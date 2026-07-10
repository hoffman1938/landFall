/**
 * RoundCoordinator — the authoritative round state machine
 * (docs/04-architecture/software-architecture.md §3, game-design-document.md §4).
 *
 * ANCHOR_OPEN -> LOCKED_STORM -> RESOLVED -> COOLDOWN -> (next round)
 *
 * Invariants enforced here:
 *  - anchors accepted only in ANCHOR_OPEN, against the server clock;
 *  - the draw is computed from (seed, roundId, K) only — pools are never an input;
 *  - settlement is one synchronous SQLite transaction, idempotent by roundId,
 *    with core's conservation assert running inside it.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  BLIND_FOG_MS,
  DEFAULT_TIMINGS,
  HOUSE_SEED_MINOR,
  RAKE,
  SPLIT_PRIMARY_PERCENT,
  SURGE_MIN_POT_MINOR,
  SURGE_RAKE_SHARE,
  ZONE_COUNT,
  drawZone,
  pickGoldenAnchor,
  settleRound,
  stormPowerFromRoll,
  weatherFromRoll,
  type DrawResult,
  type FleetMode,
  type FleetPlanPublic,
  type PhaseInfo,
  type PlayerPublic,
  type PoolsState,
  type RoundHeader,
  type RoundPhase,
  type SignalKind,
  type SignalPublic,
  type StakeEntry,
  type SurgeResult,
  type TideBand,
  type TideReport,
  type TideTrend,
  type WeatherPattern,
  type WreckWakeReplay,
} from '@landfall/core';
import type { ChainHandle } from './chain.js';
import type { Db, Sqlite } from './db/index.js';
import { players, rounds, stakes, surgeEvents, surgeState } from './db/schema.js';

export interface CoordinatorEvents {
  broadcast(msg: unknown): void;
  sendToPlayer(playerId: string, msg: unknown): void;
  /** Per-player payload variants for LANDFALL (yourResult/balance). */
  broadcastLandfall(build: (playerId: string) => unknown): void;
  systemMessage(text: string): void;
}

interface LiveFleet {
  primaryStakeId: string;
  secondaryStakeId: string | null;
  playerId: string;
  name: string;
  mode: FleetMode;
  primaryZone: number;
  secondaryZone: number | null;
  stakeMinor: number;
  lastChangeAt: number;
}

interface LiveSignal {
  playerId: string;
  name: string;
  zone: number;
  kind: SignalKind;
}

interface LiveStakeEntry {
  id: string;
  playerId: string;
  name: string;
  mode: FleetMode;
  zone: number;
  amountMinor: number;
  shareLabel: string;
}

export interface Timings {
  anchorMs: number;
  stormMs: number;
  resolvedMs: number;
  cooldownMs: number;
}

const ANCHOR_MIN_INTERVAL_MS = 150; // human-scale re-anchor cap (security-review.md §1.16)

export class RoundCoordinator {
  phase: RoundPhase = 'COOLDOWN';
  phaseEndsAt = 0;
  roundId = 0;
  private chainIndex = 0;
  private seedHex = '';
  private prevChainValue = '';
  private draw: DrawResult | null = null;
  private weather: WeatherPattern = weatherFromRoll(0);
  private surgeRound = false;
  private surgePotMinor = 0;
  private fleets = new Map<string, LiveFleet>(); // playerId -> live fleet plan
  private signals = new Map<string, LiveSignal>(); // playerId -> one public signal per round
  private finalOrders = new Set<string>(); // one hidden order per player during Blind Fog
  private fogMoveCount = 0;
  private lockSnapshot: StakeEntry[] | null = null;
  private timer: NodeJS.Timeout | null = null;
  private tideTimer: NodeJS.Timeout | null = null;
  private fogTimer: NodeJS.Timeout | null = null;
  private fogStartsAt = 0;
  private fogStarted = false;
  private lastReportTotals: number[] | null = null;
  private currentTideReport: TideReport | null = null;
  private wreckLog: number[] = [];

  constructor(
    private db: Db,
    private sqlite: Sqlite,
    private chain: ChainHandle,
    private events: CoordinatorEvents,
    private timings: Timings = DEFAULT_TIMINGS,
    /** Overridable for local testing (LANDFALL_SURGE_PROB); included in /api/round for verification. */
    readonly surgeProb: number = 0,
  ) {
    const recent = this.db
      .select({ z: rounds.struckZone })
      .from(rounds)
      .orderBy(rounds.id)
      .all()
      .map((r) => r.z)
      .filter((z): z is number => z !== null);
    this.wreckLog = recent.slice(-20);

    // Storm Surge pot: load or seed the floor (house-funded, auditable).
    const pot = this.db.select().from(surgeState).where(eq(surgeState.id, 1)).get();
    if (pot) {
      this.surgePotMinor = pot.potMinor;
    } else {
      this.surgePotMinor = SURGE_MIN_POT_MINOR;
      this.db.insert(surgeState).values({ id: 1, potMinor: this.surgePotMinor }).run();
      const house = this.db.select().from(players).where(eq(players.isHouse, true)).get();
      if (house) {
        this.db
          .update(players)
          .set({ balanceMinor: house.balanceMinor - this.surgePotMinor })
          .where(eq(players.id, house.id))
          .run();
      }
    }
  }

  start(): void {
    this.beginRound();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.tideTimer) clearTimeout(this.tideTimer);
    if (this.fogTimer) clearTimeout(this.fogTimer);
  }

  // ---------- public queries ----------

  phaseInfo(): PhaseInfo {
    return { phase: this.phase, endsAt: this.phaseEndsAt };
  }

  roundHeader(): RoundHeader {
    return {
      roundId: this.roundId,
      chainIndex: this.chainIndex,
      houseSeedMinor: HOUSE_SEED_MINOR,
      fogStartsAt: this.fogStartsAt,
      weather: this.weather,
      surgeRound: this.surgeRound,
      surgePotMinor: this.surgePotMinor,
    };
  }

  poolsState(): PoolsState {
    const totalsMinor = new Array<number>(ZONE_COUNT).fill(HOUSE_SEED_MINOR);
    const boatCounts = new Array<number>(ZONE_COUNT).fill(0);
    for (const entry of this.liveStakeEntries(false)) {
      totalsMinor[entry.zone]! += entry.amountMinor;
      boatCounts[entry.zone]! += 1;
    }
    return { totalsMinor, boatCounts };
  }

  anchorsPublic(exact = false): PlayerPublic[] {
    return this.liveStakeEntries(false).map((entry) => ({
      name: entry.name,
      zone: entry.zone,
      mode: entry.mode,
      shareLabel: entry.shareLabel,
      ...(exact
        ? { stakeMinor: entry.amountMinor }
        : { stakeBand: this.stakeBand(entry.amountMinor) }),
    }));
  }

  tideReportState(): TideReport {
    return this.currentTideReport ?? this.buildTideReport(false);
  }

  signalsPublic(): SignalPublic[] {
    return [...this.signals.values()].map((s) => ({
      name: s.name,
      zone: s.zone,
      kind: s.kind,
    }));
  }

  yourAnchor(playerId: string): { zone: number; stakeMinor: number } | null {
    const f = this.fleets.get(playerId);
    return f ? { zone: f.primaryZone, stakeMinor: f.stakeMinor } : null;
  }

  yourFleet(playerId: string): FleetPlanPublic | null {
    const f = this.fleets.get(playerId);
    return f ? this.fleetPublic(f) : null;
  }

  wreckLogState(): number[] {
    return [...this.wreckLog];
  }

  // ---------- player actions ----------

  /** Back-compat wrapper: old ANCHOR messages are Focus fleet orders. */
  anchor(
    playerId: string,
    name: string,
    zone: number,
    stakeMinor: number,
  ):
    | { ok: true; balanceMinor: number; finalOrderUsed: boolean; fleet: FleetPlanPublic }
    | { ok: false; code: string; message: string } {
    return this.fleetOrder(playerId, name, 'FOCUS', zone, null, stakeMinor);
  }

  /** Upsert a Focus or Split fleet plan during ANCHOR_OPEN only. */
  fleetOrder(
    playerId: string,
    name: string,
    mode: FleetMode,
    primaryZone: number,
    secondaryZone: number | null,
    stakeMinor: number,
  ):
    | { ok: true; balanceMinor: number; finalOrderUsed: boolean; fleet: FleetPlanPublic }
    | { ok: false; code: string; message: string } {
    if (this.phase !== 'ANCHOR_OPEN' || Date.now() >= this.phaseEndsAt) {
      return { ok: false, code: 'ROUND_LOCKED', message: 'Anchors are locked for this round.' };
    }
    if (mode === 'SPLIT') {
      if (secondaryZone === null || secondaryZone === primaryZone) {
        return {
          ok: false,
          code: 'BAD_SPLIT',
          message: 'Split orders need two different harbors.',
        };
      }
    }
    const existing = this.fleets.get(playerId);
    const now = Date.now();
    const finalOrderUsed = this.isBlindFogActive(now);
    if (finalOrderUsed && this.finalOrders.has(playerId)) {
      return {
        ok: false,
        code: 'FINAL_ORDER_USED',
        message: 'Blind Fog allows one final order. Your fleet is already committed.',
      };
    }
    if (existing && now - existing.lastChangeAt < ANCHOR_MIN_INTERVAL_MS) {
      return { ok: false, code: 'TOO_FAST', message: 'Re-anchoring too fast.' };
    }
    const delta = stakeMinor - (existing?.stakeMinor ?? 0);

    const player = this.db.select().from(players).where(eq(players.id, playerId)).get();
    if (!player) return { ok: false, code: 'NO_PLAYER', message: 'Unknown player.' };
    if (delta > 0 && player.balanceMinor < delta) {
      return { ok: false, code: 'INSUFFICIENT', message: 'Not enough credits.' };
    }

    const newBalance = player.balanceMinor - delta;
    this.db.update(players).set({ balanceMinor: newBalance }).where(eq(players.id, playerId)).run();

    if (existing) {
      const previousKey = this.fleetKey(existing);
      existing.mode = mode;
      existing.primaryZone = primaryZone;
      existing.secondaryZone = mode === 'SPLIT' ? secondaryZone : null;
      existing.stakeMinor = stakeMinor;
      existing.lastChangeAt = now;
      if (mode === 'SPLIT' && existing.secondaryStakeId === null) {
        existing.secondaryStakeId = randomUUID();
      }
      if (finalOrderUsed && previousKey !== this.fleetKey(existing)) this.fogMoveCount += 1;
    } else {
      this.fleets.set(playerId, {
        primaryStakeId: randomUUID(),
        secondaryStakeId: mode === 'SPLIT' ? randomUUID() : null,
        playerId,
        name,
        mode,
        primaryZone,
        secondaryZone: mode === 'SPLIT' ? secondaryZone : null,
        stakeMinor,
        lastChangeAt: now,
      });
      if (finalOrderUsed) this.fogMoveCount += 1;
    }
    const fleet = this.fleets.get(playerId)!;
    if (finalOrderUsed) {
      this.finalOrders.add(playerId);
    } else {
      this.scheduleTideBroadcast();
    }
    return { ok: true, balanceMinor: newBalance, finalOrderUsed, fleet: this.fleetPublic(fleet) };
  }

  /** One public bluff/coordination signal per player per round. Signals never affect settlement. */
  signal(
    playerId: string,
    name: string,
    zone: number,
    kind: SignalKind,
  ): { ok: true } | { ok: false; code: string; message: string } {
    if (this.phase !== 'ANCHOR_OPEN' || Date.now() >= this.phaseEndsAt) {
      return { ok: false, code: 'ROUND_LOCKED', message: 'Signals are closed for this round.' };
    }
    if (this.signals.has(playerId)) {
      return {
        ok: false,
        code: 'SIGNAL_USED',
        message: 'One signal flag per round. Your signal is already flying.',
      };
    }
    this.signals.set(playerId, { playerId, name, zone, kind });
    const publish = () =>
      this.events.broadcast({
        type: 'SIGNAL_UPDATE',
        signals: this.signalsPublic(),
      });
    if (this.weather.id === 'CROSSWIND') setTimeout(publish, 650);
    else publish();
    return { ok: true };
  }

  // ---------- state machine ----------

  private beginRound(): void {
    const { chainIndex, seedHex, prevChainValue } = this.chain.consume();
    this.chainIndex = chainIndex;
    this.seedHex = seedHex;
    this.prevChainValue = prevChainValue;
    this.fleets.clear();
    this.signals.clear();
    this.finalOrders.clear();
    this.fogMoveCount = 0;
    this.lockSnapshot = null;
    this.lastReportTotals = null;
    this.currentTideReport = null;
    this.fogStarted = false;

    const res = this.db
      .insert(rounds)
      .values({ chainIndex, prevChainValue, createdAt: Date.now() })
      .run();
    this.roundId = Number(res.lastInsertRowid);

    // Draw once, up front. Announcing the surge bit pre-anchor is deliberate and
    // safe: it comes from a digest span disjoint from the struck-zone bits, and
    // the reveal lets anyone verify the announcement was honest
    // (docs/04-architecture/rng-provably-fair-spec.md; core surge tests assert
    // trigger/zone independence).
    this.draw = drawZone(this.seedHex, this.roundId, ZONE_COUNT);
    this.weather = weatherFromRoll(this.draw.weatherRoll);
    this.surgeRound = this.draw.uSurge < this.surgeProb;

    this.setPhase('ANCHOR_OPEN', this.timings.anchorMs);
    const weatherFogBonus = this.weather.id === 'HEAVY_FOG' ? 1_000 : 0;
    const fogMs = Math.min(
      BLIND_FOG_MS + weatherFogBonus,
      Math.max(0, this.timings.anchorMs - 500),
    );
    this.fogStartsAt = this.phaseEndsAt - fogMs;
    this.currentTideReport = this.buildTideReport(false);
    this.events.broadcast({
      type: 'ROUND_HEADER',
      round: this.roundHeader(),
      phase: this.phaseInfo(),
      tideReport: this.currentTideReport,
    });
    if (this.surgeRound) {
      this.events.systemMessage(
        `⚡ STORM SURGE ROUND — the Golden Anchor pot of ${(this.surgePotMinor / 100).toFixed(2)} pays out this round!`,
      );
    }
    const fogDelay = Math.max(0, this.fogStartsAt - Date.now());
    this.fogTimer = setTimeout(() => this.beginFog(), fogDelay);
    this.timer = setTimeout(() => this.lock(), this.timings.anchorMs);
  }

  private lock(): void {
    if (this.fogTimer) {
      clearTimeout(this.fogTimer);
      this.fogTimer = null;
    }
    this.setPhase('LOCKED_STORM', this.timings.stormMs);

    // Canonical lock snapshot: player anchors + house seeds (fixed, published).
    const snapshot: StakeEntry[] = [];
    for (let z = 0; z < ZONE_COUNT; z++) {
      snapshot.push({
        id: `house-${this.roundId}-${z}`,
        zone: z,
        amountMinor: HOUSE_SEED_MINOR,
        isHouseSeed: true,
      });
    }
    for (const entry of this.liveStakeEntries(true)) {
      snapshot.push({
        id: entry.id,
        zone: entry.zone,
        amountMinor: entry.amountMinor,
        isHouseSeed: false,
      });
    }
    this.lockSnapshot = snapshot;

    // Persist stakes + debit house seeds, atomically.
    const housePlayer = this.db.select().from(players).where(eq(players.isHouse, true)).get();
    const txn = this.sqlite.transaction(() => {
      const now = Date.now();
      for (const entry of this.liveStakeEntries(true)) {
        this.db
          .insert(stakes)
          .values({
            id: entry.id,
            roundId: this.roundId,
            playerId: entry.playerId,
            zone: entry.zone,
            amountMinor: entry.amountMinor,
            isHouseSeed: false,
            createdAt: now,
          })
          .run();
      }
      if (housePlayer) {
        for (let z = 0; z < ZONE_COUNT; z++) {
          this.db
            .insert(stakes)
            .values({
              id: `house-${this.roundId}-${z}`,
              roundId: this.roundId,
              playerId: housePlayer.id,
              zone: z,
              amountMinor: HOUSE_SEED_MINOR,
              isHouseSeed: true,
              createdAt: now,
            })
            .run();
        }
        this.db
          .update(players)
          .set({ balanceMinor: housePlayer.balanceMinor - ZONE_COUNT * HOUSE_SEED_MINOR })
          .where(eq(players.id, housePlayer.id))
          .run();
      }
      this.db
        .update(rounds)
        .set({ lockSnapshotJson: JSON.stringify(snapshot) })
        .where(eq(rounds.id, this.roundId))
        .run();
    });
    txn();

    this.events.broadcast({
      type: 'LOCK_SNAPSHOT',
      pools: this.poolsState(),
      anchors: this.anchorsPublic(true),
      phase: this.phaseInfo(),
    });

    const draw = this.draw!;
    this.events.broadcast({ type: 'STORM_PATH', feints: draw.feints, phase: this.phaseInfo() });

    this.timer = setTimeout(() => this.resolve(draw.struckZone), this.timings.stormMs);
  }

  private resolve(struckZone: number): void {
    this.setPhase('RESOLVED', this.timings.resolvedMs);
    const snapshot = this.lockSnapshot!;
    // Storm Power: the same digest decides how hard the storm hits (salvage ×M).
    const power = stormPowerFromRoll(this.draw!.stormPowerRoll);
    const settlement = settleRound(snapshot, struckZone, RAKE, {
      mNum: power.mNum,
      mDen: power.mDen,
    }); // conservation (incl. house delta) asserted inside

    const stakeOwner = new Map<string, string>(); // stakeId -> playerId
    for (const entry of this.liveStakeEntries(true)) stakeOwner.set(entry.id, entry.playerId);

    const housePlayer = this.db.select().from(players).where(eq(players.isHouse, true)).get();
    const perPlayerNet = new Map<string, number>();

    // Storm Surge accounting: half the rake feeds the pot; on a surge round the
    // whole pot goes to one surviving player stake (Golden Anchor), then the
    // house re-seeds the floor. All inside the settlement transaction.
    const surgeContribMinor = Math.floor(settlement.rakeMinor * SURGE_RAKE_SHARE);
    const houseRakeMinor = settlement.rakeMinor - surgeContribMinor;
    const goldenWinner = this.surgeRound
      ? pickGoldenAnchor(snapshot, struckZone, this.draw!.uWinner)
      : null;
    let surgeResult: SurgeResult | undefined;

    const txn = this.sqlite.transaction(() => {
      const already = this.db
        .select({ s: rounds.settledAt })
        .from(rounds)
        .where(eq(rounds.id, this.roundId))
        .get();
      if (already?.s) return; // idempotency: never settle a round twice

      for (const line of settlement.lines) {
        this.db
          .update(stakes)
          .set({ outcome: line.outcome, payoutMinor: line.payoutMinor })
          .where(eq(stakes.id, line.id))
          .run();

        const ownerId = line.isHouseSeed ? housePlayer?.id : stakeOwner.get(line.id);
        if (!ownerId) continue;
        if (line.payoutMinor > 0) {
          const p = this.db.select().from(players).where(eq(players.id, ownerId)).get()!;
          this.db
            .update(players)
            .set({ balanceMinor: p.balanceMinor + line.payoutMinor })
            .where(eq(players.id, ownerId))
            .run();
        }
        if (!line.isHouseSeed) {
          perPlayerNet.set(
            ownerId,
            (perPlayerNet.get(ownerId) ?? 0) + line.payoutMinor - line.amountMinor,
          );
        }
      }
      if (housePlayer) {
        // House books its rake share MINUS the Storm Power delta (delta > 0 means
        // the house funded extra salvage this round; delta < 0 means it kept the
        // difference on a weak storm — E[delta] = 0 by the ladder's construction).
        const p = this.db.select().from(players).where(eq(players.id, housePlayer.id)).get()!;
        this.db
          .update(players)
          .set({
            balanceMinor: p.balanceMinor + houseRakeMinor - settlement.houseDeltaMinor,
          })
          .where(eq(players.id, housePlayer.id))
          .run();
      }

      // Pot grows by this round's contribution first, then pays out if surging.
      let pot = this.surgePotMinor + surgeContribMinor;
      if (this.surgeRound) {
        if (goldenWinner) {
          const winnerPlayerId = stakeOwner.get(goldenWinner.id)!;
          const wp = this.db.select().from(players).where(eq(players.id, winnerPlayerId)).get()!;
          this.db
            .update(players)
            .set({ balanceMinor: wp.balanceMinor + pot })
            .where(eq(players.id, winnerPlayerId))
            .run();
          perPlayerNet.set(winnerPlayerId, (perPlayerNet.get(winnerPlayerId) ?? 0) + pot);
          this.db
            .insert(surgeEvents)
            .values({
              roundId: this.roundId,
              winnerPlayerId,
              winnerStakeId: goldenWinner.id,
              amountMinor: pot,
              createdAt: Date.now(),
            })
            .run();
          surgeResult = {
            potMinor: pot,
            winnerName: this.fleets.get(winnerPlayerId)?.name ?? '?',
            winnerStakeMinor: goldenWinner.amountMinor,
          };
          // House re-seeds the floor so the next pot is never trivial.
          pot = SURGE_MIN_POT_MINOR;
          if (housePlayer) {
            const hp = this.db.select().from(players).where(eq(players.id, housePlayer.id)).get()!;
            this.db
              .update(players)
              .set({ balanceMinor: hp.balanceMinor - SURGE_MIN_POT_MINOR })
              .where(eq(players.id, housePlayer.id))
              .run();
          }
        } else {
          // No surviving player stake — pot rolls over, event recorded for the log.
          this.db
            .insert(surgeEvents)
            .values({
              roundId: this.roundId,
              winnerPlayerId: null,
              winnerStakeId: null,
              amountMinor: pot,
              createdAt: Date.now(),
            })
            .run();
          surgeResult = { potMinor: pot, winnerName: null, winnerStakeMinor: null };
        }
      }
      this.db.update(surgeState).set({ potMinor: pot }).where(eq(surgeState.id, 1)).run();
      this.surgePotMinor = pot;

      this.db
        .update(rounds)
        .set({
          seedHex: this.seedHex,
          struckZone,
          rakeMinor: settlement.rakeMinor,
          settledAt: Date.now(),
        })
        .where(eq(rounds.id, this.roundId))
        .run();
    });
    txn();

    this.wreckLog.push(struckZone);
    if (this.wreckLog.length > 20) this.wreckLog.shift();

    const resultByPlayer = this.resultsByPlayer(settlement.lines, struckZone, perPlayerNet);
    const results = [...this.fleets.values()].map((f) => ({
      name: f.name,
      outcome: resultByPlayer.get(f.playerId)?.outcome ?? 'SAFE',
      netMinor: perPlayerNet.get(f.playerId) ?? 0,
    }));
    const replay = this.buildReplay(snapshot, struckZone);

    const base = {
      type: 'LANDFALL' as const,
      roundId: this.roundId,
      struckZone,
      seedHex: this.seedHex,
      prevChainValue: this.prevChainValue,
      pools: this.poolsState(),
      results,
      phase: this.phaseInfo(),
      wreckLog: this.wreckLogState(),
      replay,
      stormPower: { label: power.label, mNum: power.mNum, mDen: power.mDen },
      ...(surgeResult ? { surge: surgeResult } : {}),
    };
    this.events.broadcastLandfall((playerId) => {
      const fleet = this.fleets.get(playerId);
      const balance =
        this.db.select().from(players).where(eq(players.id, playerId)).get()?.balanceMinor ?? 0;
      const yourResult = fleet
        ? {
            outcome: resultByPlayer.get(playerId)?.outcome ?? 'SAFE',
            netMinor: perPlayerNet.get(playerId) ?? 0,
          }
        : { outcome: 'SPECTATOR' as const, netMinor: 0 };
      return { ...base, yourResult, balanceMinor: balance };
    });

    // Big-storm callouts (Cat 3 = ×2 and up) go to the Salvage Log.
    if (power.mNum / power.mDen >= 2) {
      const mult = power.mNum / power.mDen;
      this.events.systemMessage(
        `⛈ ${power.label} STORM — all salvage ×${mult}${mult >= 25 ? '!!!' : '!'}`,
      );
    }
    if (surgeResult?.winnerName) {
      this.events.systemMessage(
        `⚡⚓ GOLDEN ANCHOR! ${surgeResult.winnerName} wins the entire Storm Surge pot: +${(surgeResult.potMinor / 100).toFixed(2)} on a ${((surgeResult.winnerStakeMinor ?? 0) / 100).toFixed(2)} stake (${(surgeResult.potMinor / Math.max(1, surgeResult.winnerStakeMinor ?? 1)).toFixed(0)}x)!`,
      );
    } else if (surgeResult) {
      this.events.systemMessage(
        `⚡ The Golden Anchor found no surviving skipper — the pot of ${(surgeResult.potMinor / 100).toFixed(2)} rolls over!`,
      );
    }
    for (const r of results) {
      if (r.outcome !== 'WRECKED' && r.netMinor > 0) {
        this.events.systemMessage(
          `${r.name} salvaged +${(r.netMinor / 100).toFixed(2)} from Harbor ${struckZone + 1}'s wreck`,
        );
      }
    }

    this.timer = setTimeout(() => this.cooldown(), this.timings.resolvedMs);
  }

  private cooldown(): void {
    this.setPhase('COOLDOWN', this.timings.cooldownMs);
    this.events.broadcast({ type: 'PHASE', phase: this.phaseInfo() });
    this.timer = setTimeout(() => this.beginRound(), this.timings.cooldownMs);
  }

  private setPhase(phase: RoundPhase, durationMs: number): void {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + durationMs;
  }

  private beginFog(): void {
    if (this.phase !== 'ANCHOR_OPEN' || this.fogStarted) return;
    this.fogStarted = true;
    this.currentTideReport = { ...this.tideReportState(), frozen: true, generatedAt: Date.now() };
    this.events.broadcast({
      type: 'FOG_STARTED',
      tideReport: this.currentTideReport,
      phase: this.phaseInfo(),
    });
  }

  private scheduleTideBroadcast(): void {
    if (this.tideTimer || this.isBlindFogActive()) return;
    this.tideTimer = setTimeout(() => {
      this.tideTimer = null;
      if (this.phase !== 'ANCHOR_OPEN' || this.isBlindFogActive()) return;
      this.currentTideReport = this.buildTideReport(false);
      this.events.broadcast({
        type: 'TIDE_REPORT',
        tideReport: this.currentTideReport,
        anchors: this.anchorsPublic(false),
        signals: this.signalsPublic(),
      });
    }, 100);
  }

  private isBlindFogActive(now = Date.now()): boolean {
    return this.phase === 'ANCHOR_OPEN' && this.fogStartsAt > 0 && now >= this.fogStartsAt;
  }

  private buildTideReport(frozen: boolean): TideReport {
    const pools = this.poolsState();
    const total = pools.totalsMinor.reduce((a, n) => a + n, 0);
    const avg = Math.max(1, total / ZONE_COUNT);
    const prev = this.lastReportTotals;
    const trendThreshold = Math.max(10_00, avg * 0.04);
    const entries = pools.totalsMinor.map((amount, zone) => {
      const ratio = amount / avg;
      const band: TideBand =
        amount <= HOUSE_SEED_MINOR
          ? 'seed'
          : ratio < 0.75
            ? 'light'
            : ratio < 1.25
              ? 'medium'
              : ratio < 1.8
                ? 'heavy'
                : 'packed';
      const delta = prev ? amount - (prev[zone] ?? amount) : 0;
      const trend: TideTrend =
        delta > trendThreshold ? 'rising' : delta < -trendThreshold ? 'falling' : 'stable';
      return { zone, band, trend, boatCount: pools.boatCounts[zone] ?? 0 };
    });
    if (!frozen) this.lastReportTotals = [...pools.totalsMinor];
    return { entries, generatedAt: Date.now(), frozen };
  }

  private liveStakeEntries(withIds: true): LiveStakeEntry[];
  private liveStakeEntries(withIds: false): LiveStakeEntry[];
  private liveStakeEntries(_withIds: boolean): LiveStakeEntry[] {
    return [...this.fleets.values()].flatMap((f) => this.entriesForFleet(f));
  }

  private fleetPublic(f: LiveFleet): FleetPlanPublic {
    return {
      mode: f.mode,
      primaryZone: f.primaryZone,
      secondaryZone: f.mode === 'SPLIT' ? f.secondaryZone : null,
      stakeMinor: f.stakeMinor,
    };
  }

  private fleetKey(f: LiveFleet): string {
    return `${f.mode}:${f.primaryZone}:${f.secondaryZone ?? '-'}:${f.stakeMinor}`;
  }

  private resultsByPlayer(
    lines: { id: string; outcome: 'SAFE' | 'WRECKED' }[],
    struckZone: number,
    perPlayerNet: Map<string, number>,
  ): Map<string, { outcome: 'SAFE' | 'WRECKED' | 'SPLIT' }> {
    const lineById = new Map(lines.map((line) => [line.id, line]));
    const out = new Map<string, { outcome: 'SAFE' | 'WRECKED' | 'SPLIT' }>();
    for (const f of this.fleets.values()) {
      const entries = this.entriesForFleet(f);
      const wrecked = entries.filter(
        (entry) => lineById.get(entry.id)?.outcome === 'WRECKED',
      ).length;
      const net = perPlayerNet.get(f.playerId) ?? 0;
      const outcome =
        wrecked === entries.length
          ? 'WRECKED'
          : wrecked > 0
            ? 'SPLIT'
            : net < 0 && entries.some((e) => e.zone === struckZone)
              ? 'SPLIT'
              : 'SAFE';
      out.set(f.playerId, { outcome });
    }
    return out;
  }

  private entriesForFleet(f: LiveFleet): LiveStakeEntry[] {
    if (f.mode === 'SPLIT' && f.secondaryZone !== null && f.secondaryStakeId !== null) {
      const primary = Math.floor((f.stakeMinor * SPLIT_PRIMARY_PERCENT) / 100);
      const secondary = f.stakeMinor - primary;
      return [
        {
          id: f.primaryStakeId,
          playerId: f.playerId,
          name: f.name,
          mode: f.mode,
          zone: f.primaryZone,
          amountMinor: primary,
          shareLabel: `${SPLIT_PRIMARY_PERCENT}%`,
        },
        {
          id: f.secondaryStakeId,
          playerId: f.playerId,
          name: f.name,
          mode: f.mode,
          zone: f.secondaryZone,
          amountMinor: secondary,
          shareLabel: `${100 - SPLIT_PRIMARY_PERCENT}%`,
        },
      ];
    }
    return [
      {
        id: f.primaryStakeId,
        playerId: f.playerId,
        name: f.name,
        mode: 'FOCUS',
        zone: f.primaryZone,
        amountMinor: f.stakeMinor,
        shareLabel: '100%',
      },
    ];
  }

  private buildReplay(snapshot: StakeEntry[], struckZone: number): WreckWakeReplay {
    const pools = new Array<number>(ZONE_COUNT).fill(0);
    for (const stake of snapshot) pools[stake.zone]! += stake.amountMinor;
    let mostCrowdedSafeZone: number | null = null;
    let mostCrowdedSafePoolMinor = 0;
    pools.forEach((pool, zone) => {
      if (zone !== struckZone && pool > mostCrowdedSafePoolMinor) {
        mostCrowdedSafePoolMinor = pool;
        mostCrowdedSafeZone = zone;
      }
    });

    const signalSummary = { rally: 0, flee: 0, hold: 0, onStruck: 0 };
    for (const signal of this.signals.values()) {
      if (signal.kind === 'RALLY') signalSummary.rally += 1;
      if (signal.kind === 'FLEE') signalSummary.flee += 1;
      if (signal.kind === 'HOLD') signalSummary.hold += 1;
      if (signal.zone === struckZone) signalSummary.onStruck += 1;
    }
    const splitFleets = [...this.fleets.values()].filter((f) => f.mode === 'SPLIT').length;
    const headline =
      this.fogMoveCount > 0
        ? `${this.fogMoveCount} fleet${this.fogMoveCount === 1 ? '' : 's'} moved in the fog before Harbor ${
            struckZone + 1
          } took the storm.`
        : `The room held steady before Harbor ${struckZone + 1} took the storm.`;
    return {
      headline,
      finalOrders: this.finalOrders.size,
      fogMoves: this.fogMoveCount,
      splitFleets,
      struckPoolMinor: pools[struckZone] ?? 0,
      mostCrowdedSafeZone,
      mostCrowdedSafePoolMinor,
      signalSummary,
    };
  }

  private stakeBand(amountMinor: number): TideBand {
    if (amountMinor < 50_00) return 'light';
    if (amountMinor < 500_00) return 'medium';
    if (amountMinor < 2_000_00) return 'heavy';
    return 'packed';
  }
}
