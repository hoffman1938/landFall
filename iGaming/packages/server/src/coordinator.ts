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
import {
  BLIND_FOG_MS,
  DEFAULT_TIMINGS,
  FLAG_MAX_PER_WINDOW,
  FLAG_WINDOW_ROUNDS,
  HOUSE_SEED_MINOR,
  MAX_STAKE_MINOR,
  MIN_STAKE_MINOR,
  RAKE,
  RAKE_SPLIT,
  SIGNAL_MIN_STAKE_MINOR,
  SPLIT_PRIMARY_PERCENT,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  SURGE_FLAT_ODDS_EVERY_N,
  SURGE_MIN_POT_MINOR,
  WHALE_CAP_FRACTION,
  ZONE_COUNT,
  computeTideBands,
  drawZone,
  pickGoldenAnchorFlat,
  validateRakeConfig,
  type ActionReceipt,
  type RakeSplit,
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
import type { GameRepository } from './db/repository.js';
import { ReceiptSigner, hashActionPayload } from './receipts.js';

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
  /** C5: bot stakes are marked through to the public lock snapshot. */
  isBot: boolean;
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
  isBot: boolean;
}

export interface Timings {
  anchorMs: number;
  stormMs: number;
  resolvedMs: number;
  cooldownMs: number;
}

/**
 * Room economy config (A1/A3) — validated on construction; env-overridable in
 * main.ts, per-room once Workstream C lands. Rake is applied to the struck
 * pool; the split routes it to operator / Storm Surge pot / Storm Reserve.
 */
export interface EconomyConfig {
  rake: number;
  rakeSplit: RakeSplit;
  /** Storm Power liability cap: max total salvage = multiple × round handle. */
  maxPayoutMultiple: number;
  /** Flat-odds Golden Anchor cadence (A4): every Nth surge round; 0 disables. */
  surgeFlatEveryN: number;
}

export const DEFAULT_ECONOMY: EconomyConfig = {
  rake: RAKE,
  rakeSplit: RAKE_SPLIT,
  maxPayoutMultiple: STORM_POWER_MAX_PAYOUT_MULTIPLE,
  surgeFlatEveryN: SURGE_FLAT_ODDS_EVERY_N,
};

/**
 * Room configuration (C1/C2): each room runs an independent RoundCoordinator
 * against this config. Tier configs live in server config (rooms JSON), not
 * code — DEFAULT_ROOM exists for tests and single-room tools.
 */
export interface RoomConfig {
  roomId: string;
  name: string;
  minStakeMinor: number;
  maxStakeMinor: number;
  /** B5: max fraction of the round handle one player may hold. */
  whaleCapFraction: number;
  /** House seed per zone per round. */
  seedMinor: number;
  /** C5: demo practice bots. Hard-false outside LANDFALL_ENV=demo (rooms.ts crashes otherwise). */
  botsAllowed: boolean;
  surgeProb: number;
  /** B4: minimum anchored stake required to fly a signal flag. */
  signalMinStakeMinor: number;
  econ: EconomyConfig;
  timings: Timings;
}

export const DEFAULT_ROOM: RoomConfig = {
  roomId: 'harbor',
  name: 'Harbor',
  minStakeMinor: MIN_STAKE_MINOR,
  maxStakeMinor: MAX_STAKE_MINOR,
  whaleCapFraction: WHALE_CAP_FRACTION,
  seedMinor: HOUSE_SEED_MINOR,
  botsAllowed: false,
  surgeProb: 0,
  signalMinStakeMinor: SIGNAL_MIN_STAKE_MINOR,
  econ: DEFAULT_ECONOMY,
  timings: DEFAULT_TIMINGS,
};

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
  private surgeFlatOdds = false;
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
  /** Bands of the last PUBLISHED report — the hysteresis anchor (B2). */
  private lastReportBands: TideBand[] | null = null;
  private currentTideReport: TideReport | null = null;
  private wreckLog: number[] = [];
  /** Signed action receipts (B1): per-round monotonic sequence + signer. */
  private receiptSeq = 0;
  private anchorLockAt = 0;
  private receiptSigner: ReceiptSigner;

  /** Storm Reserve running balance (mirrors the last storm_reserve_ledger row). */
  private reserveBalanceMinor = 0;
  /** B4: per-player roundIds of recently flown flags (cooldown window). */
  private flagHistory = new Map<string, number[]>();

  /** Convenience accessors preserved from the pre-room single-config API. */
  get econ(): EconomyConfig {
    return this.cfg.econ;
  }
  get surgeProb(): number {
    return this.cfg.surgeProb;
  }
  private get timings(): Timings {
    return this.cfg.timings;
  }

  constructor(
    private repo: GameRepository,
    private chain: ChainHandle,
    private events: CoordinatorEvents,
    readonly cfg: RoomConfig = DEFAULT_ROOM,
  ) {
    validateRakeConfig(cfg.econ.rake, cfg.econ.rakeSplit);
    if (!Number.isInteger(cfg.econ.maxPayoutMultiple) || cfg.econ.maxPayoutMultiple < 1) {
      throw new Error(
        `maxPayoutMultiple must be a positive integer, got ${cfg.econ.maxPayoutMultiple}`,
      );
    }
    if (cfg.minStakeMinor < MIN_STAKE_MINOR || cfg.maxStakeMinor > MAX_STAKE_MINOR) {
      throw new Error(
        `room stakes [${cfg.minStakeMinor}, ${cfg.maxStakeMinor}] outside protocol bounds`,
      );
    }
    if (cfg.whaleCapFraction <= 0 || cfg.whaleCapFraction > 1) {
      throw new Error(`whaleCapFraction ${cfg.whaleCapFraction} outside (0, 1]`);
    }
    this.receiptSigner = new ReceiptSigner(repo.getOrCreateReceiptKey());
    this.reserveBalanceMinor = repo.lastReserveBalance(cfg.roomId);
    this.wreckLog = repo.recentStruckZones(cfg.roomId, 20);

    // Storm Surge pot: load or seed the floor (house-funded, auditable).
    const pot = repo.getSurgePot(cfg.roomId);
    if (pot !== undefined) {
      this.surgePotMinor = pot;
    } else {
      this.surgePotMinor = SURGE_MIN_POT_MINOR;
      repo.setSurgePot(cfg.roomId, this.surgePotMinor);
      const house = repo.getHousePlayer();
      if (house) repo.creditPlayer(house.id, -this.surgePotMinor);
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
      houseSeedMinor: this.cfg.seedMinor,
      fogStartsAt: this.fogStartsAt,
      weather: this.weather,
      surgeRound: this.surgeRound,
      surgePotMinor: this.surgePotMinor,
      surgeFlatOdds: this.surgeFlatOdds,
    };
  }

  poolsState(): PoolsState {
    const totalsMinor = new Array<number>(ZONE_COUNT).fill(this.cfg.seedMinor);
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

  /**
   * Issue, persist and return a signed action receipt (B1). Called on every
   * accept/reject decision for round actions — the client can later prove what
   * the server acknowledged and exactly when, especially at the fog/lock boundary.
   */
  private issueReceipt(
    playerId: string,
    action: string,
    payload: unknown,
    verdict: 'ACCEPTED' | 'REJECTED',
    reason?: string,
  ): ActionReceipt {
    const ts = Date.now();
    this.receiptSeq += 1;
    const receipt = this.receiptSigner.sign({
      roundId: this.roundId,
      seq: this.receiptSeq,
      playerId,
      action,
      actionHash: hashActionPayload(payload),
      ts,
      msBeforeLock: this.anchorLockAt - ts,
      verdict,
      ...(reason !== undefined ? { reason } : {}),
    });
    this.repo.insertReceipt(receipt);
    return receipt;
  }

  /** Back-compat wrapper: old ANCHOR messages are Focus fleet orders. */
  anchor(
    playerId: string,
    name: string,
    zone: number,
    stakeMinor: number,
  ):
    | {
        ok: true;
        balanceMinor: number;
        finalOrderUsed: boolean;
        fleet: FleetPlanPublic;
        receipt: ActionReceipt;
      }
    | { ok: false; code: string; message: string; receipt?: ActionReceipt } {
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
    | {
        ok: true;
        balanceMinor: number;
        finalOrderUsed: boolean;
        fleet: FleetPlanPublic;
        receipt: ActionReceipt;
      }
    | { ok: false; code: string; message: string; receipt?: ActionReceipt } {
    const payload = { mode, primaryZone, secondaryZone, stakeMinor };
    const reject = (code: string, message: string) => ({
      ok: false as const,
      code,
      message,
      receipt: this.issueReceipt(playerId, 'FLEET_ORDER', payload, 'REJECTED', code),
    });
    if (this.phase !== 'ANCHOR_OPEN' || Date.now() >= this.phaseEndsAt) {
      return reject('ROUND_LOCKED', 'Anchors are locked for this round.');
    }
    if (mode === 'SPLIT') {
      if (secondaryZone === null || secondaryZone === primaryZone) {
        return reject('BAD_SPLIT', 'Split orders need two different harbors.');
      }
    }
    // Room stake tier bounds (C2) — the protocol schema only enforces absolutes.
    if (stakeMinor < this.cfg.minStakeMinor || stakeMinor > this.cfg.maxStakeMinor) {
      return reject(
        'STAKE_OUT_OF_TIER',
        `This room takes ${(this.cfg.minStakeMinor / 100).toFixed(2)}–${(this.cfg.maxStakeMinor / 100).toFixed(2)} credit stakes.`,
      );
    }
    const existing = this.fleets.get(playerId);
    // Whale guardrail (B5): a single player may not exceed whaleCapFraction of
    // the round handle (house seeds included), evaluated at accept time against
    // the handle INCLUDING this order.
    const othersMinor =
      ZONE_COUNT * this.cfg.seedMinor +
      [...this.fleets.values()]
        .filter((f) => f.playerId !== playerId)
        .reduce((a, f) => a + f.stakeMinor, 0);
    if (stakeMinor > this.cfg.whaleCapFraction * (othersMinor + stakeMinor)) {
      const capMinor = Math.floor(
        (this.cfg.whaleCapFraction / (1 - this.cfg.whaleCapFraction)) * othersMinor,
      );
      return reject(
        'WHALE_CAP',
        `A single fleet is capped at ${Math.round(this.cfg.whaleCapFraction * 100)}% of this round's handle — up to ${(capMinor / 100).toFixed(2)} right now.`,
      );
    }
    const now = Date.now();
    const finalOrderUsed = this.isBlindFogActive(now);
    if (finalOrderUsed && this.finalOrders.has(playerId)) {
      return reject(
        'FINAL_ORDER_USED',
        'Blind Fog allows one final order. Your fleet is already committed.',
      );
    }
    if (existing && now - existing.lastChangeAt < ANCHOR_MIN_INTERVAL_MS) {
      return reject('TOO_FAST', 'Re-anchoring too fast.');
    }
    const delta = stakeMinor - (existing?.stakeMinor ?? 0);

    const player = this.repo.getPlayer(playerId);
    if (!player) return reject('NO_PLAYER', 'Unknown player.');
    if (delta > 0 && player.balanceMinor < delta) {
      return reject('INSUFFICIENT', 'Not enough credits.');
    }

    const newBalance = player.balanceMinor - delta;
    this.repo.setPlayerBalance(playerId, newBalance);

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
        isBot: player.isBot,
      });
      if (finalOrderUsed) this.fogMoveCount += 1;
    }
    const fleet = this.fleets.get(playerId)!;
    if (finalOrderUsed) {
      this.finalOrders.add(playerId);
    } else {
      this.scheduleTideBroadcast();
    }
    return {
      ok: true,
      balanceMinor: newBalance,
      finalOrderUsed,
      fleet: this.fleetPublic(fleet),
      receipt: this.issueReceipt(playerId, 'FLEET_ORDER', payload, 'ACCEPTED'),
    };
  }

  /**
   * Withdraw the player's whole fleet order before lock; the stake is refunded
   * in full (stakes are only persisted at lock, so this is in-memory + balance).
   * During Blind Fog a cancel is the player's one hidden order, same as a move.
   */
  cancelOrder(
    playerId: string,
  ):
    | {
        ok: true;
        balanceMinor: number;
        finalOrderUsed: boolean;
        refundMinor: number;
        receipt: ActionReceipt;
      }
    | { ok: false; code: string; message: string; receipt?: ActionReceipt } {
    const reject = (code: string, message: string) => ({
      ok: false as const,
      code,
      message,
      receipt: this.issueReceipt(playerId, 'CANCEL_ORDER', {}, 'REJECTED', code),
    });
    if (this.phase !== 'ANCHOR_OPEN' || Date.now() >= this.phaseEndsAt) {
      return reject('ROUND_LOCKED', 'Anchors are locked for this round.');
    }
    const existing = this.fleets.get(playerId);
    if (!existing) {
      return reject('NO_ORDER', 'You have no active order to cancel.');
    }
    const now = Date.now();
    const fogOrder = this.isBlindFogActive(now);
    if (fogOrder && this.finalOrders.has(playerId)) {
      return reject(
        'FINAL_ORDER_USED',
        'Blind Fog allows one final order. Your fleet is already committed.',
      );
    }
    if (now - existing.lastChangeAt < ANCHOR_MIN_INTERVAL_MS) {
      return reject('TOO_FAST', 'Re-anchoring too fast.');
    }

    const player = this.repo.getPlayer(playerId);
    if (!player) return reject('NO_PLAYER', 'Unknown player.');

    const refundMinor = existing.stakeMinor;
    const newBalance = player.balanceMinor + refundMinor;
    this.repo.setPlayerBalance(playerId, newBalance);
    this.fleets.delete(playerId);

    if (fogOrder) {
      this.finalOrders.add(playerId);
      this.fogMoveCount += 1;
    } else {
      this.scheduleTideBroadcast();
    }
    return {
      ok: true,
      balanceMinor: newBalance,
      finalOrderUsed: fogOrder,
      refundMinor,
      receipt: this.issueReceipt(playerId, 'CANCEL_ORDER', {}, 'ACCEPTED'),
    };
  }

  /**
   * One public bluff/coordination signal per player per round. Signals never
   * affect settlement. B4 friction: flying a flag requires an anchored fleet
   * of at least signalMinStakeMinor THIS round, and flags are usable in at
   * most FLAG_MAX_PER_WINDOW of any FLAG_WINDOW_ROUNDS consecutive rounds —
   * free to read, no longer free to spam-lie at scale.
   */
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
    const fleet = this.fleets.get(playerId);
    if (!fleet || fleet.stakeMinor < this.cfg.signalMinStakeMinor) {
      return {
        ok: false,
        code: 'SIGNAL_NEEDS_FLEET',
        message: `Flags need an anchored fleet of at least ${(this.cfg.signalMinStakeMinor / 100).toFixed(2)} this round.`,
      };
    }
    const history = this.flagHistory.get(playerId) ?? [];
    const windowStart = this.roundId - (FLAG_WINDOW_ROUNDS - 1);
    const recent = history.filter((r) => r >= windowStart && r < this.roundId);
    if (recent.length >= FLAG_MAX_PER_WINDOW) {
      const nextRound = Math.min(...recent) + FLAG_WINDOW_ROUNDS;
      return {
        ok: false,
        code: 'FLAG_COOLDOWN',
        message: `Flags fly in at most ${FLAG_MAX_PER_WINDOW} of ${FLAG_WINDOW_ROUNDS} rounds — yours returns in round ${nextRound}.`,
      };
    }
    this.flagHistory.set(playerId, [...recent, this.roundId]);
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
    this.lastReportBands = null;
    this.currentTideReport = null;
    this.fogStarted = false;
    this.receiptSeq = 0;

    this.roundId = this.repo.insertRound(this.cfg.roomId, chainIndex, prevChainValue);

    // Draw once, up front. Announcing the surge bit pre-anchor is deliberate and
    // safe: it comes from a digest span disjoint from the struck-zone bits, and
    // the reveal lets anyone verify the announcement was honest
    // (docs/04-architecture/rng-provably-fair-spec.md; core surge tests assert
    // trigger/zone independence).
    this.draw = drawZone(this.seedHex, this.roundId, ZONE_COUNT);
    this.weather = weatherFromRoll(this.draw.weatherRoll);
    this.surgeRound = this.draw.uSurge < this.surgeProb;
    // Flat-odds Golden Anchor (A4, flag-gated): every Nth surge round, counted
    // over the auditable surge_events history, pays with equal odds per stake.
    if (this.surgeRound && this.econ.surgeFlatEveryN > 0) {
      const prior = this.repo.countSurgeEvents(this.cfg.roomId);
      this.surgeFlatOdds = (prior + 1) % this.econ.surgeFlatEveryN === 0;
    } else {
      this.surgeFlatOdds = false;
    }

    this.setPhase('ANCHOR_OPEN', this.timings.anchorMs);
    this.anchorLockAt = this.phaseEndsAt;
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
    // Bot stakes are marked (C5) so their Golden Anchor exclusion is recomputable.
    const snapshot: StakeEntry[] = [];
    for (let z = 0; z < ZONE_COUNT; z++) {
      snapshot.push({
        id: `house-${this.roundId}-${z}`,
        zone: z,
        amountMinor: this.cfg.seedMinor,
        isHouseSeed: true,
      });
    }
    for (const entry of this.liveStakeEntries(true)) {
      snapshot.push({
        id: entry.id,
        zone: entry.zone,
        amountMinor: entry.amountMinor,
        isHouseSeed: false,
        ...(entry.isBot ? { isBot: true } : {}),
      });
    }
    this.lockSnapshot = snapshot;

    // Persist stakes + debit house seeds, atomically.
    const housePlayer = this.repo.getHousePlayer();
    this.repo.inTransaction(() => {
      for (const entry of this.liveStakeEntries(true)) {
        this.repo.insertStake({
          id: entry.id,
          roundId: this.roundId,
          playerId: entry.playerId,
          zone: entry.zone,
          amountMinor: entry.amountMinor,
          isHouseSeed: false,
        });
      }
      if (housePlayer) {
        for (let z = 0; z < ZONE_COUNT; z++) {
          this.repo.insertStake({
            id: `house-${this.roundId}-${z}`,
            roundId: this.roundId,
            playerId: housePlayer.id,
            zone: z,
            amountMinor: this.cfg.seedMinor,
            isHouseSeed: true,
          });
        }
        this.repo.creditPlayer(housePlayer.id, -ZONE_COUNT * this.cfg.seedMinor);
      }
      this.repo.setRoundLockSnapshot(this.roundId, JSON.stringify(snapshot));
    });

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
    // Storm Power: the same digest decides how hard the storm hits (salvage ×M),
    // clamped by the per-round liability cap (A3) — max salvage = multiple × handle.
    const power = stormPowerFromRoll(this.draw!.stormPowerRoll);
    const handleMinor = snapshot.reduce((a, s) => a + s.amountMinor, 0);
    const settlement = settleRound(
      snapshot,
      struckZone,
      this.econ.rake,
      { mNum: power.mNum, mDen: power.mDen },
      this.econ.maxPayoutMultiple * handleMinor,
    ); // conservation (incl. reserve delta) asserted inside

    const stakeOwner = new Map<string, string>(); // stakeId -> playerId
    for (const entry of this.liveStakeEntries(true)) stakeOwner.set(entry.id, entry.playerId);

    const housePlayer = this.repo.getHousePlayer();
    const perPlayerNet = new Map<string, number>();

    // Rake split (A1): surge share feeds the pot, stormReserve share feeds the
    // reserve ledger, the house books the remainder (rounding dust included).
    // On a surge round the whole pot goes to one surviving player stake (Golden
    // Anchor), then the house re-seeds the floor. All inside the settlement txn.
    const surgeContribMinor = Math.floor(settlement.rakeMinor * this.econ.rakeSplit.surge);
    const reserveContribMinor = Math.floor(
      settlement.rakeMinor * this.econ.rakeSplit.stormReserve,
    );
    const houseRakeMinor = settlement.rakeMinor - surgeContribMinor - reserveContribMinor;
    // Storm Power overpayment (≥ 0 with the ×1-floor ladder) draws from the reserve.
    const reserveOutflowMinor = Math.max(0, settlement.houseDeltaMinor);
    const goldenWinner = this.surgeRound
      ? (this.surgeFlatOdds ? pickGoldenAnchorFlat : pickGoldenAnchor)(
          snapshot,
          struckZone,
          this.draw!.uWinner,
        )
      : null;
    let surgeResult: SurgeResult | undefined;

    this.repo.inTransaction(() => {
      if (this.repo.roundSettledAt(this.roundId) !== null) return; // idempotency: never settle twice

      for (const line of settlement.lines) {
        this.repo.setStakeOutcome(line.id, line.outcome, line.payoutMinor);

        const ownerId = line.isHouseSeed ? housePlayer?.id : stakeOwner.get(line.id);
        if (!ownerId) continue;
        if (line.payoutMinor > 0) {
          this.repo.creditPlayer(ownerId, line.payoutMinor);
        }
        if (!line.isHouseSeed) {
          perPlayerNet.set(
            ownerId,
            (perPlayerNet.get(ownerId) ?? 0) + line.payoutMinor - line.amountMinor,
          );
        }
      }
      if (housePlayer) {
        // House books only its rake share. The Storm Power overpayment is no
        // longer a house liability: it draws from the Storm Reserve, whose
        // funding invariant (core storm-power test) keeps E[outflow] ≤ E[inflow].
        this.repo.creditPlayer(housePlayer.id, houseRakeMinor);
      }

      // Storm Reserve ledger row (A3): auditable inflow/outflow/balance per round.
      this.reserveBalanceMinor += reserveContribMinor - reserveOutflowMinor;
      this.repo.insertReserveLedger({
        roomId: this.cfg.roomId,
        roundId: this.roundId,
        inflowMinor: reserveContribMinor,
        outflowMinor: reserveOutflowMinor,
        balanceMinor: this.reserveBalanceMinor,
      });

      // Pot grows by this round's contribution first, then pays out if surging.
      let pot = this.surgePotMinor + surgeContribMinor;
      if (this.surgeRound) {
        if (goldenWinner) {
          const winnerPlayerId = stakeOwner.get(goldenWinner.id)!;
          this.repo.creditPlayer(winnerPlayerId, pot);
          perPlayerNet.set(winnerPlayerId, (perPlayerNet.get(winnerPlayerId) ?? 0) + pot);
          this.repo.insertSurgeEvent({
            roundId: this.roundId,
            winnerPlayerId,
            winnerStakeId: goldenWinner.id,
            amountMinor: pot,
            flatOdds: this.surgeFlatOdds,
          });
          surgeResult = {
            potMinor: pot,
            winnerName: this.fleets.get(winnerPlayerId)?.name ?? '?',
            winnerStakeMinor: goldenWinner.amountMinor,
          };
          // House re-seeds the floor so the next pot is never trivial.
          pot = SURGE_MIN_POT_MINOR;
          if (housePlayer) {
            this.repo.creditPlayer(housePlayer.id, -SURGE_MIN_POT_MINOR);
          }
        } else {
          // No surviving player stake — pot rolls over, event recorded for the log.
          this.repo.insertSurgeEvent({
            roundId: this.roundId,
            winnerPlayerId: null,
            winnerStakeId: null,
            amountMinor: pot,
            flatOdds: this.surgeFlatOdds,
          });
          surgeResult = { potMinor: pot, winnerName: null, winnerStakeMinor: null };
        }
      }
      this.repo.setSurgePot(this.cfg.roomId, pot);
      this.surgePotMinor = pot;

      this.repo.settleRound(this.roundId, {
        seedHex: this.seedHex,
        struckZone,
        rakeMinor: settlement.rakeMinor,
        rakeBp: Math.round(this.econ.rake * 10_000),
        maxPayoutMultiple: this.econ.maxPayoutMultiple,
        powerCapped: settlement.powerCapped,
      });
    });

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
      powerCapped: settlement.powerCapped,
      ...(surgeResult ? { surge: surgeResult } : {}),
    };
    this.events.broadcastLandfall((playerId) => {
      const fleet = this.fleets.get(playerId);
      const balance =
        this.repo.getPlayer(playerId)?.balanceMinor ?? 0;
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
    // Honesty over silence: if the liability cap clamped the payout, say so.
    if (settlement.powerCapped) {
      this.events.systemMessage(
        `⚖ Storm Power payout reached this round's cap (${this.econ.maxPayoutMultiple}× the round handle) — salvage was clamped to ${(settlement.salvageTotalMinor / 100).toFixed(2)}.`,
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
    // Bands with hysteresis (B2): a band flips only after the pool clears the
    // threshold by a margin, so min-stake probing cannot binary-search exact
    // totals below band resolution (see core tide.ts + probing test).
    const bands = computeTideBands(pools.totalsMinor, this.lastReportBands, this.cfg.seedMinor);
    const entries = pools.totalsMinor.map((amount, zone) => {
      const delta = prev ? amount - (prev[zone] ?? amount) : 0;
      const trend: TideTrend =
        delta > trendThreshold ? 'rising' : delta < -trendThreshold ? 'falling' : 'stable';
      return { zone, band: bands[zone]!, trend, boatCount: pools.boatCounts[zone] ?? 0 };
    });
    if (!frozen) {
      this.lastReportTotals = [...pools.totalsMinor];
      this.lastReportBands = bands;
    }
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
          isBot: f.isBot,
        },
        {
          id: f.secondaryStakeId,
          playerId: f.playerId,
          name: f.name,
          mode: f.mode,
          zone: f.secondaryZone,
          amountMinor: secondary,
          shareLabel: `${100 - SPLIT_PRIMARY_PERCENT}%`,
          isBot: f.isBot,
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
        isBot: f.isBot,
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
