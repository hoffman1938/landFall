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
  LIQUIDITY_FLOOR_MINOR,
  LIQUIDITY_MIN_SEED_MINOR,
  houseSeedPerZone,
  updateHandleEma,
  MAX_STAKE_MINOR,
  MIN_STAKE_MINOR,
  RAKE,
  RAKE_SPLIT,
  SIGNAL_MIN_STAKE_MINOR,
  SPLIT_PRIMARY_PERCENT,
  STARTING_BALANCE_MINOR,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  SURGE_FLAT_ODDS_EVERY_N,
  SURGE_MIN_POT_MINOR,
  WHALE_CAP_FRACTION,
  ZONE_COUNT,
  RULES_VERSION,
  applyFloatRound,
  applyReserveRound,
  computeTideBands,
  assertSingleWinner,
  contributeToSurge,
  houseFloatOpeningFor,
  drawPresentation,
  drawZone,
  openFloat,
  payOutSurge,
  pickGoldenAnchorFlat,
  rollOverSurge,
  stormReserveOpeningFor,
  surgeCeilingFor,
  unwinnableTiers,
  validateRakeConfig,
  MALFUNCTION_NOTICE,
  type HouseFloatState,
  type SurgePotPolicy,
  type ActionReceipt,
  type RakeSplit,
  pickGoldenAnchor,
  settleRound,
  stormPowerFromRoll,
  weatherFromRoll,
  type DrawResult,
  type FlagReveal,
  type RoundPresentation,
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
import { monotonicMs } from './clock.js';
import type { GameRepository, SkipperRecordRow } from './db/repository.js';
import { LimitsService, utcDayKey } from './limits.js';
import { ReceiptSigner, hashActionPayload } from './receipts.js';
import { log } from './log.js';
import { SETTLE_BUCKETS, metrics } from './metrics.js';

/**
 * Flag honesty (E2/B4 replay ribbon + E1 bluff counter): RALLY/HOLD claim the
 * skipper is at that cove; FLEE claims they are not. Judged against the fleet's
 * actual zones at lock — a fleetless flagger's RALLY/HOLD is a bluff by definition.
 */
export function flagHonest(kind: SignalKind, zone: number, fleetZones: Set<number>): boolean {
  return kind === 'FLEE' ? !fleetZones.has(zone) : fleetZones.has(zone);
}

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
  /**
   * CEILING for the house seed per zone — what a dead table gets. The seed
   * itself is adaptive: see `liquidityFloorMinor` and core/liquidity.ts.
   */
  seedMinor: number;
  /**
   * Total table handle the house guarantees while the room is thin. Below it
   * the house tops the table up; at or above it the seed falls to
   * `minSeedMinor` and the round is pure player-versus-player.
   */
  liquidityFloorMinor: number;
  /** Token seed that always remains, so no zone is ever literally empty. */
  minSeedMinor: number;
  /** C5: demo practice bots. Hard-false outside LANDFALL_ENV=demo (rooms.ts crashes otherwise). */
  botsAllowed: boolean;
  /**
   * How many practice bots this room seats. `null` means "no per-room opinion"
   * — main.ts falls back to the global default. Ignored when `botsAllowed` is
   * false. High-roller tiers seat fewer: a thin, expensive table is the honest
   * picture of one, and every bot there carries a large bankroll.
   */
  botCount: number | null;
  /**
   * Balance a practice bot is topped back up to. Scales with the tier — a bot
   * with a Skiff bankroll on a Leviathan table is broke on its first anchor,
   * which would leave the rich rooms looking deserted. Demo-only, like the
   * bots themselves.
   */
  botBankrollMinor: number;
  surgeProb: number;
  /** Jackpot floor re-seeded by the house after a payout AT THIS TABLE. */
  surgeFloorMinor: number;
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
  liquidityFloorMinor: LIQUIDITY_FLOOR_MINOR,
  minSeedMinor: LIQUIDITY_MIN_SEED_MINOR,
  botsAllowed: false,
  botCount: null,
  botBankrollMinor: STARTING_BALANCE_MINOR,
  surgeProb: 0,
  surgeFloorMinor: SURGE_MIN_POT_MINOR,
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
  /**
   * v4 presentation draws — event tier, board environment, cosmetic stream.
   *
   * Drawn from three HMAC domains of their own (core/presentation.ts), in the
   * same breath as the harbor draw and from the same already-committed seed,
   * so the whole round exists before a single frame is broadcast. Nothing here
   * is ever read by settlement, the tide report, the pools, or the payout: it
   * decides how the round looks and nothing else.
   */
  private presentation: RoundPresentation | null = null;
  private weather: WeatherPattern = weatherFromRoll(0);
  private surgeRound = false;
  private surgeFlatOdds = false;
  private surgePotMinor = 0;
  private fleets = new Map<string, LiveFleet>(); // playerId -> live fleet plan
  private signals = new Map<string, LiveSignal>(); // playerId -> one public signal per round
  private finalOrders = new Set<string>(); // one hidden order per player during Blind Fog
  private fogMoveCount = 0;
  private lockSnapshot: StakeEntry[] | null = null;
  /**
   * Adaptive house liquidity. `seedMinor` is THIS round's house seed per zone,
   * fixed before anchoring opens and published in the round header, so it can
   * leak nothing about the live pools. It is derived from `handleEmaMinor`, an
   * EMA of settled rounds' real (non-house) handle: the house tops a thin table
   * up to `liquidityFloorMinor` and gets out of the way once players arrive.
   * See core/liquidity.ts for why a flat seed flattens the whole game.
   */
  private seedMinor: number;
  private handleEmaMinor: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private parkAfterRound = false;
  private tideTimer: ReturnType<typeof setTimeout> | null = null;
  private fogTimer: ReturnType<typeof setTimeout> | null = null;
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
  /** Cumulative house capital injected to keep the reserve non-negative (G11). */
  private reserveBackstopTotalMinor = 0;
  /**
   * GLI-19 §4.13.3 diversion pool — surge contributions received while the pot
   * stood at its ceiling. Never lost; funds the reset value after the next win.
   */
  private surgeDiversionMinor = 0;
  /**
   * SEGREGATED LIQUIDITY FLOAT (G8). House-seed stakes and settlements move
   * against this, never against operator revenue. See core/houseFloat.ts for
   * why GLI-19 §A.7.1(c)–(d) requires the separation.
   */
  private floatState: HouseFloatState;
  /** B4: per-player roundIds of recently flown flags (cooldown window). */
  private flagHistory = new Map<string, number[]>();
  /** Boat counts at fog start (E2): lock − fog = the replay's net movement arrows. */
  private fogBoatCounts: number[] | null = null;

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

  /**
   * GLI-19 §4.13.3 / §4.13.6(d) — the pot's ceiling and its RESET VALUE, the two
   * figures the clause requires a progressive jackpot to define. The reset value
   * is the table-sized floor the pot returns to after a win; the ceiling is
   * where it stops incrementing and further contributions divert.
   */
  private get surgePolicy(): SurgePotPolicy {
    return {
      resetMinor: this.cfg.surgeFloorMinor,
      ceilingMinor: surgeCeilingFor(this.cfg.minStakeMinor, this.cfg.surgeFloorMinor),
    };
  }

  constructor(
    private repo: GameRepository,
    private chain: ChainHandle,
    private events: CoordinatorEvents,
    readonly cfg: RoomConfig = DEFAULT_ROOM,
    /** Responsible-gambling service (F1/F2), shared across rooms. Optional for tests/tools. */
    private limits?: LimitsService,
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
    // GLI-19 §4.4.1(f) — a ladder tier the liability cap can never pay in full
    // is an advertised award that is not winnable. Asserted at construction so a
    // rake/cap override in room config cannot ship a dishonest paytable; this is
    // the executable form of the finding that raised the cap from 25× to 150×.
    const unwinnable = unwinnableTiers(cfg.econ.rake, cfg.econ.maxPayoutMultiple);
    if (unwinnable.length > 0) {
      throw new Error(
        `room ${cfg.roomId}: maxPayoutMultiple ${cfg.econ.maxPayoutMultiple} cannot pay ` +
          `${unwinnable.map((t) => `${t.label} (×${t.mNum / t.mDen})`).join(', ')} in full at the ` +
          `reference pool shape — GLI-19 §4.4.1(f) requires every advertised award to be winnable`,
      );
    }

    this.receiptSigner = new ReceiptSigner(repo.getOrCreateReceiptKey());
    this.reserveBalanceMinor = repo.lastReserveBalance(cfg.roomId);
    this.reserveBackstopTotalMinor = repo.lastReserveBackstopTotal(cfg.roomId);
    this.wreckLog = repo.recentStruckZones(cfg.roomId, 20);

    // G11 — the Storm Reserve opens CAPITALIZED rather than at zero. Its funding
    // invariant makes it self-sustaining over the long run, but a big storm in
    // the opening rounds used to draw against a fund that had collected almost
    // nothing and drive the ledger negative. Opening capital sized to the worst
    // single round the cap admits at this room's guaranteed table size.
    const openingReserve = stormReserveOpeningFor(cfg.liquidityFloorMinor);
    if (repo.lastFloatBalance(cfg.roomId) === undefined && this.reserveBalanceMinor === 0) {
      this.reserveBalanceMinor = openingReserve;
    } else if (this.reserveBalanceMinor < 0) {
      // A LEGACY DEFICIT, regularised ONCE, here rather than in a round.
      //
      // Databases written before rules v2 can carry a negative reserve balance:
      // that was the old design (decisions-log #3), and it is the thing G11
      // objects to. Folding it into the next round's settlement would work
      // arithmetically but would book a large house backstop against a round
      // that did not cause it, and raise an Art. 16.1(b) incident for an
      // upgrade. So it is recognised at construction as what it actually is —
      // operator capital covering a historical shortfall — and the per-round
      // ledger stays a record of that round.
      const deficit = -this.reserveBalanceMinor;
      const injected = deficit + openingReserve;
      repo.inTransaction(() => {
        const house = repo.getHousePlayer();
        if (house) repo.creditPlayer(house.id, -injected);
        repo.insertSignificantEvent({
          category: 'RESERVE',
          component: `storm_reserve.${cfg.roomId}`,
          actor: 'system',
          reason:
            'rules v2 migration: legacy negative reserve balance regularised and the fund ' +
            'capitalized; the balance can no longer go negative',
          valueBefore: String(-deficit),
          valueAfter: String(openingReserve),
        });
      });
      this.reserveBalanceMinor = openingReserve;
    }

    // The segregated float opens with disclosed operator capital sized to fund
    // several fully-seeded rounds, so a top-up means the float is genuinely
    // exhausted rather than merely new.
    const floatBalance = repo.lastFloatBalance(cfg.roomId);
    this.floatState =
      floatBalance === undefined
        ? openFloat(houseFloatOpeningFor(cfg.seedMinor, ZONE_COUNT, cfg.liquidityFloorMinor))
        : { balanceMinor: floatBalance, contributedMinor: 0, releasedMinor: 0 };

    // Storm Surge pot: load or seed the reset value (house-funded, auditable).
    const pot = repo.getSurgePot(cfg.roomId);
    if (pot !== undefined) {
      this.surgePotMinor = pot.potMinor;
      this.surgeDiversionMinor = pot.diversionMinor;
    } else {
      this.surgePotMinor = cfg.surgeFloorMinor;
      repo.setSurgePot(cfg.roomId, this.surgePotMinor, 0);
      const house = repo.getHousePlayer();
      if (house) repo.creditPlayer(house.id, -this.surgePotMinor);
    }

    // A fresh room has no handle history, so it opens fully seeded (the old
    // fixed-seed behaviour) and thins out from there as players show up.
    this.seedMinor = houseSeedPerZone(this.liquidityPolicy(), 0, ZONE_COUNT);
  }

  /**
   * One structured line and one metrics update per settled round — the whole
   * observable surface of the game loop. Money stays in minor units, and
   * nothing here can affect settlement: it runs after the transaction has
   * committed and only reads what the transaction produced.
   */
  private recordRoundTelemetry(
    struckZone: number,
    settlement: { rakeMinor: number; houseDeltaMinor: number; salvageTotalMinor?: number; powerCapped: boolean },
    handleMinor: number,
    powerLabel: string,
    startedAt: number,
  ): void {
    const seconds = (monotonicMs() - startedAt) / 1000;
    const room = { room: this.cfg.roomId };

    metrics.counter('landfall_rounds_settled_total', 'Rounds settled.', room);
    metrics.counter('landfall_handle_minor_total', 'Total handle staked, minor units.', room, handleMinor);
    metrics.counter('landfall_rake_minor_total', 'Rake taken from struck pools, minor units.', room, settlement.rakeMinor);
    metrics.counter(
      'landfall_house_delta_minor_total',
      'Cumulative house delta, minor units. Reconciles against the DB; drift means a leak.',
      room,
      settlement.houseDeltaMinor,
    );
    if (settlement.powerCapped) {
      metrics.counter('landfall_power_capped_total', 'Rounds whose salvage hit the liability cap.', room);
    }
    metrics.observe(
      'landfall_round_settle_seconds',
      'Wall time to settle a round. The loop is a fixed ~20s heartbeat; a climbing p95 means settlement is falling behind it.',
      SETTLE_BUCKETS,
      seconds,
      room,
    );
    metrics.gauge('landfall_storm_reserve_minor', 'Storm Reserve balance, minor units.', this.reserveBalanceMinor, room);
    metrics.gauge('landfall_surge_pot_minor', 'Storm Surge jackpot, minor units.', this.surgePotMinor, room);
    metrics.gauge('landfall_house_seed_minor', 'Adaptive house seed per zone for the NEXT round, minor units.', this.seedMinor, room);
    metrics.gauge('landfall_handle_ema_minor', 'EMA of real (non-house) handle, minor units — drives the adaptive seed.', this.handleEmaMinor ?? 0, room);

    log.info('round settled', {
      room: this.cfg.roomId,
      roundId: this.roundId,
      struckZone,
      handleMinor,
      rakeMinor: settlement.rakeMinor,
      houseDeltaMinor: settlement.houseDeltaMinor,
      reserveMinor: this.reserveBalanceMinor,
      surgePotMinor: this.surgePotMinor,
      seedMinor: this.seedMinor,
      power: powerLabel,
      powerCapped: settlement.powerCapped,
      settleMs: Math.round(seconds * 1000),
    });
  }

  /** The room's liquidity policy, clamped so the floor can never invert. */
  private liquidityPolicy() {
    const maxSeedMinor = this.cfg.seedMinor;
    return {
      floorMinor: this.cfg.liquidityFloorMinor,
      minSeedMinor: Math.min(this.cfg.minSeedMinor, maxSeedMinor),
      maxSeedMinor,
    };
  }

  start(): void {
    // A player may return while an empty room is finishing its last round.
    // Keep that round and its accepted stakes; only resume the following loop.
    this.parkAfterRound = false;
    if (this.running) return;
    this.running = true;
    this.beginRound();
  }

  /** Finish accepted bets on their normal schedule, then stop opening rounds. */
  park(): void {
    this.parkAfterRound = true;
    if (this.phase === 'RESOLVED' || this.phase === 'COOLDOWN') this.stop();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.tideTimer) clearTimeout(this.tideTimer);
    if (this.fogTimer) clearTimeout(this.fogTimer);
    this.timer = null;
    this.tideTimer = null;
    this.fogTimer = null;
    this.running = false;
  }

  // ---------- public queries ----------

  phaseInfo(): PhaseInfo {
    return { phase: this.phase, endsAt: this.phaseEndsAt };
  }

  roundHeader(): RoundHeader {
    return {
      roundId: this.roundId,
      chainIndex: this.chainIndex,
      houseSeedMinor: this.seedMinor,
      fogStartsAt: this.fogStartsAt,
      weather: this.weather,
      ...(this.presentation ? { environment: this.presentation.environment } : {}),
      surgeRound: this.surgeRound,
      surgePotMinor: this.surgePotMinor,
      surgeFlatOdds: this.surgeFlatOdds,
    };
  }

  poolsState(): PoolsState {
    const totalsMinor = new Array<number>(ZONE_COUNT).fill(this.seedMinor);
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

  finalOrderUsed(playerId: string): boolean {
    return this.finalOrders.has(playerId);
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

  /**
   * Behavioral telemetry (B3): one row per ACCEPTED round action, feeding the
   * offline collusion scan (scripts/collusion-scan.ts). Rejected actions are
   * already fully recorded by the signed receipts (B1).
   */
  private recordTelemetry(
    playerId: string,
    action: 'FLEET_ORDER' | 'CANCEL_ORDER' | 'SIGNAL',
    now: number,
    zone: number | null,
    stakeMinor: number | null,
    detail: string | null,
  ): void {
    this.repo.insertTelemetry({
      roomId: this.cfg.roomId,
      roundId: this.roundId,
      playerId,
      action,
      msIntoPhase: Math.max(0, now - (this.anchorLockAt - this.timings.anchorMs)),
      zone,
      stakeMinor,
      inFog: this.isBlindFogActive(now),
      isMinStake: stakeMinor !== null && stakeMinor === this.cfg.minStakeMinor,
      detail,
    });
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
    // Responsible gambling (F1/F2): the player's own limits precede house rules.
    if (this.limits) {
      const rg = this.limits.checkOrder(playerId, stakeMinor);
      if (!rg.ok) return reject(rg.code!, rg.message!);
    }
    const existing = this.fleets.get(playerId);
    // Whale guardrail (B5): a single player may not exceed whaleCapFraction of
    // the round handle (house seeds included), evaluated at accept time against
    // the handle INCLUDING this order.
    // Measured against the round's EXPECTED handle, floored at the room's
    // guaranteed liquidity. Without that floor the adaptive seed would turn B5
    // against the very first bettor: on a busy table the seed is a token 1.00,
    // so the earliest anchor would be capped at a quarter of six credits —
    // a guardrail meant for whales clamping a casual at 2.00.
    const othersMinor = Math.max(
      this.cfg.liquidityFloorMinor,
      ZONE_COUNT * this.seedMinor +
        [...this.fleets.values()]
          .filter((f) => f.playerId !== playerId)
          .reduce((a, f) => a + f.stakeMinor, 0),
    );
    if (stakeMinor > this.cfg.whaleCapFraction * (othersMinor + stakeMinor)) {
      const capMinor = Math.floor(
        (this.cfg.whaleCapFraction / (1 - this.cfg.whaleCapFraction)) * othersMinor,
      );
      /*
       * Last line of defence, not the normal path: the client derives the same
       * cap from published numbers and clamps before sending (web/stakeLimits).
       * This fires on a genuine race — someone else's stake landing between the
       * client's read and this check — so it has to read like news rather than
       * like the internal rule. "Fleet" and "handle" are internal vocabulary
       * (web/strings.ts §4) and never belong in front of a player.
       */
      return reject(
        'WHALE_CAP',
        `Most you can bet in this round is ${(capMinor / 100).toFixed(2)} — payouts come out of the hit zone's pot, so a bigger bet would have little to win. It rises as players join.`,
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
    this.recordTelemetry(playerId, 'FLEET_ORDER', now, primaryZone, stakeMinor, mode);
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
    this.recordTelemetry(playerId, 'CANCEL_ORDER', now, null, refundMinor, null);
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
    this.recordTelemetry(playerId, 'SIGNAL', Date.now(), zone, null, kind);
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
    this.fogBoatCounts = null;
    this.receiptSeq = 0;

    // The rules version is stamped at round CREATION, not at settlement: GLI-19
    // §A.5.1 binds a wager to the rules in force when it was accepted (G45).
    this.roundId = this.repo.insertRound(
      this.cfg.roomId,
      chainIndex,
      prevChainValue,
      RULES_VERSION,
    );

    // Fix this round's house seed BEFORE anchoring opens, from settled history
    // only. It goes out in the round header with everything else, so no player
    // can learn anything from it that the whole table does not already know.
    this.seedMinor = houseSeedPerZone(
      this.liquidityPolicy(),
      this.handleEmaMinor ?? 0,
      ZONE_COUNT,
    );

    // Draw once, up front. Announcing the surge bit pre-anchor is deliberate and
    // safe: it comes from a digest span disjoint from the struck-zone bits, and
    // the reveal lets anyone verify the announcement was honest
    // (docs/04-architecture/rng-provably-fair-spec.md; core surge tests assert
    // trigger/zone independence).
    this.draw = drawZone(this.seedHex, this.roundId, ZONE_COUNT);
    // Presentation domains, drawn here for the same reason the harbor is: the
    // WHOLE round is decided before anything is announced, so no animation, no
    // click and no reconnect can be an input to any of it.
    this.presentation = drawPresentation(this.seedHex, this.roundId);
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
        amountMinor: this.seedMinor,
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
            amountMinor: this.seedMinor,
            isHouseSeed: true,
          });
        }
        // NO HOUSE DEBIT HERE (G8). The seed is funded by the SEGREGATED
        // LIQUIDITY FLOAT, not by the operator's account, and both legs of that
        // — what went out and what came back — are booked together against the
        // float at settlement by `applyFloatRound`. Debiting the house here and
        // crediting it at settlement is what put house-seed profit into operator
        // revenue in the first place, which is the §A.7.1(c)–(d) finding.
        //
        // The stakes above still carry the house player as owner because the
        // lock snapshot and the public verification record need an owner; it is
        // the MONEY that moved, not the attribution.
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
    // The reveal's choreography ships with the reveal. The tier was drawn at
    // beginRound from its own domain; publishing it here rather than in the
    // header simply means the storm arrives with its own weather.
    this.events.broadcast({
      type: 'STORM_PATH',
      feints: draw.feints,
      phase: this.phaseInfo(),
      ...(this.presentation
        ? { eventTier: this.presentation.eventTier, cosmetic: this.presentation.cosmetic }
        : {}),
    });

    this.timer = setTimeout(() => this.resolve(draw.struckZone), this.timings.stormMs);
  }

  /**
   * G27 / GLI-19 §4.16, §A.6.4 — INTERRUPTED GAME HANDLING.
   *
   * Landfall's position on the usual form of this clause is unusually strong and
   * worth stating: there are no player actions after bets lock, so the entire
   * class of "interrupted mid-decision" games cannot occur. What CAN occur is a
   * round interrupted between lock and settlement — a settlement that throws,
   * most importantly the core conservation assert firing — and until now that
   * left the stakes debited and nobody paid.
   *
   * §A.6.4 prescribes the remedy exactly: return the wagers, update balances and
   * history, inform the regulatory body, and disable if the failure is likely to
   * recur. This does the first three; the fourth is `gameControl.disable`.
   */
  private voidRound(reason: string): void {
    const snapshot = this.lockSnapshot;
    this.repo.inTransaction(() => {
      if (this.repo.roundSettledAt(this.roundId) !== null) return;
      // Refund every PLAYER stake in full. House seeds are not refunded to the
      // operator's account because they were never debited from it — the float
      // simply books no round, which leaves it whole.
      for (const entry of this.liveStakeEntries(true)) {
        this.repo.setStakeOutcome(entry.id, 'SAFE', entry.amountMinor);
        this.repo.creditPlayer(entry.playerId, entry.amountMinor);
      }
      this.repo.voidRound(this.roundId, reason);
      this.repo.insertSignificantEvent({
        category: 'INCIDENT',
        component: `round.${this.roundId}`,
        actor: 'system',
        reason: `round voided and all bets refunded: ${reason}`,
        valueBefore: 'LOCKED_STORM',
        valueAfter: 'VOID',
        incident: true,
      });
    });
    const refunded = snapshot?.filter((e) => !e.isHouseSeed).length ?? 0;
    log.error('ROUND VOIDED — every bet refunded', {
      roundId: this.roundId,
      roomId: this.cfg.roomId,
      reason,
      refundedStakes: refunded,
    });
    metrics.counter(
      'landfall_rounds_voided_total',
      'Rounds voided between lock and settlement; every bet refunded.',
      { room: this.cfg.roomId },
      1,
    );
    this.events.systemMessage(
      `Round #${this.roundId} could not be settled and has been voided. Every bet in it has been ` +
        `returned in full. ${MALFUNCTION_NOTICE}.`,
    );
  }

  private resolve(struckZone: number): void {
    try {
      this.resolveOrThrow(struckZone);
    } catch (err) {
      // The conservation assert is the loudest thing that can land here, and it
      // firing means the settlement arithmetic disagreed with itself — so the
      // one thing we must NOT do is pay it out anyway.
      this.voidRound(err instanceof Error ? err.message : String(err));
      this.setPhase('COOLDOWN', this.timings.cooldownMs);
      this.timer = setTimeout(() => this.beginRound(), this.timings.cooldownMs);
    }
  }

  private resolveOrThrow(struckZone: number): void {
    const settleStartedAt = monotonicMs();
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

    // Adaptive liquidity: fold this round's REAL (non-house) handle into the
    // room's estimate, which sizes the next round's seed. Bot stakes count —
    // they are traffic that genuinely disperses the pools, and demo is meant
    // to behave like a populated table.
    this.handleEmaMinor = updateHandleEma(
      this.handleEmaMinor,
      snapshot.reduce((a, entry) => a + (entry.isHouseSeed ? 0 : entry.amountMinor), 0),
    );

    const stakeOwner = new Map<string, string>(); // stakeId -> playerId
    for (const entry of this.liveStakeEntries(true)) stakeOwner.set(entry.id, entry.playerId);

    const housePlayer = this.repo.getHousePlayer();

    // Per-player nets are pure functions of the settlement lines — computed up
    // front so the Skipper Records (E1) and RG day-loss ledger (F1) can be
    // written inside the same settlement transaction below.
    const perPlayerNet = new Map<string, number>();
    for (const line of settlement.lines) {
      if (line.isHouseSeed) continue;
      const ownerId = stakeOwner.get(line.id);
      if (!ownerId) continue;
      perPlayerNet.set(
        ownerId,
        (perPlayerNet.get(ownerId) ?? 0) + line.payoutMinor - line.amountMinor,
      );
    }
    // Salvage-only nets (E1 "biggest salvage"): before any Golden Anchor credit.
    const salvageNetByPlayer = new Map(perPlayerNet);

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

    // G8 — the house seed's own stake and settlement, isolated from the rake.
    // These two figures are the whole of the ring-fence: what house money put on
    // the table, and what came back. Neither touches the operator's account.
    const seedStakedMinor = snapshot.reduce(
      (a, entry) => a + (entry.isHouseSeed ? entry.amountMinor : 0),
      0,
    );
    const seedReturnedMinor = settlement.lines.reduce(
      (a, line) => a + (line.isHouseSeed ? line.payoutMinor : 0),
      0,
    );
    const goldenWinner = this.surgeRound
      ? (this.surgeFlatOdds ? pickGoldenAnchorFlat : pickGoldenAnchor)(
          snapshot,
          struckZone,
          this.draw!.uWinner,
        )
      : null;
    const surgeWinnerPlayerId = goldenWinner ? (stakeOwner.get(goldenWinner.id) ?? null) : null;
    let surgeResult: SurgeResult | undefined;

    this.repo.inTransaction(() => {
      if (this.repo.roundSettledAt(this.roundId) !== null) return; // idempotency: never settle twice

      for (const line of settlement.lines) {
        this.repo.setStakeOutcome(line.id, line.outcome, line.payoutMinor);

        // HOUSE SEEDS NO LONGER CREDIT THE HOUSE ACCOUNT (G8). Their settlement
        // is booked against the segregated liquidity float below, so a seed that
        // survives a round can never appear in operator revenue. GLI-19
        // §A.7.1(c)–(d): the operator must not profit from the play beyond the
        // rake, and operator-funded wagers must ultimately be lost or played.
        if (line.isHouseSeed) continue;
        const ownerId = stakeOwner.get(line.id);
        if (!ownerId) continue;
        if (line.payoutMinor > 0) {
          this.repo.creditPlayer(ownerId, line.payoutMinor);
        }
      }
      if (housePlayer) {
        // The operator books THE RAKE ALONE. The Storm Power overpayment draws
        // from the Storm Reserve, and the house seed's profit and loss goes to
        // the segregated float — so this single line is now the complete
        // definition of operator revenue, which is what `reconcileOperatorRevenue`
        // asserts against.
        this.repo.creditPlayer(housePlayer.id, houseRakeMinor);
      }

      // Segregated liquidity float ledger (G8).
      const floatRound = applyFloatRound(this.floatState, seedStakedMinor, seedReturnedMinor);
      this.floatState = floatRound.state;
      this.repo.insertFloatLedger({
        roomId: this.cfg.roomId,
        roundId: this.roundId,
        stakedMinor: floatRound.stakedMinor,
        returnedMinor: floatRound.returnedMinor,
        netMinor: floatRound.netMinor,
        topUpMinor: floatRound.topUpMinor,
        balanceMinor: floatRound.state.balanceMinor,
      });
      if (housePlayer && floatRound.topUpMinor > 0) {
        // Operator capital entering the float is a real movement on the house
        // account, and it is the one direction that is permitted: money goes IN.
        this.repo.creditPlayer(housePlayer.id, -floatRound.topUpMinor);
      }

      // Storm Reserve ledger row (A3, G11): the balance can no longer go
      // negative — a draw beyond the fund is booked as an explicit house
      // backstop, which is a reportable obligation rather than a minus sign.
      const reserve = applyReserveRound(
        { balanceMinor: this.reserveBalanceMinor, backstopTotalMinor: this.reserveBackstopTotalMinor },
        reserveContribMinor,
        reserveOutflowMinor,
      );
      this.reserveBalanceMinor = reserve.state.balanceMinor;
      this.reserveBackstopTotalMinor = reserve.state.backstopTotalMinor;
      this.repo.insertReserveLedger({
        roomId: this.cfg.roomId,
        roundId: this.roundId,
        inflowMinor: reserve.inflowMinor,
        outflowMinor: reserve.outflowMinor,
        balanceMinor: reserve.state.balanceMinor,
        backstopMinor: reserve.backstopMinor,
      });
      if (housePlayer && reserve.backstopMinor > 0) {
        this.repo.creditPlayer(housePlayer.id, -reserve.backstopMinor);
        this.repo.insertSignificantEvent({
          category: 'RESERVE',
          component: `storm_reserve.${this.cfg.roomId}`,
          actor: 'system',
          reason: 'Storm Power draw exceeded the reserve; house backstop injected',
          valueBefore: String(reserve.state.balanceMinor + reserve.outflowMinor - reserve.inflowMinor),
          valueAfter: String(reserve.state.balanceMinor),
          incident: true,
        });
      }

      // JACKPOT CONTROL SOFTWARE (G10). Every movement below goes through
      // core/jackpot.ts, which exists as a separate artefact because Order 222
      // Annex 1 Art. 17.1 requires the jackpot PROGRAM and the jackpot CONTROL
      // SOFTWARE to be authorized separately — the accounting cannot be code
      // inlined here if it has to be certified on its own.
      const policy = this.surgePolicy;
      const contribution = contributeToSurge(
        { potMinor: this.surgePotMinor, diversionMinor: this.surgeDiversionMinor },
        surgeContribMinor,
        policy,
      );
      let potState = contribution.state;
      if (contribution.toDiversionMinor > 0) {
        // §4.13.3 — the pot is at its ceiling and the overflow is being held for
        // the next reset. Recorded, because an advertised jackpot that has
        // stopped growing is a fact players and auditors both need.
        this.repo.insertSignificantEvent({
          category: 'JACKPOT',
          component: `surge_pot.${this.cfg.roomId}`,
          actor: 'system',
          reason: 'pot at ceiling; contribution credited to the diversion pool',
          valueBefore: String(this.surgeDiversionMinor),
          valueAfter: String(potState.diversionMinor),
        });
      }

      if (this.surgeRound) {
        if (goldenWinner && surgeWinnerPlayerId) {
          const winnerPlayerId = surgeWinnerPlayerId;
          // §4.13.9 — exactly one winner per surge round, by construction.
          assertSingleWinner([goldenWinner.id]);
          const payout = payOutSurge(potState, policy);
          this.repo.creditPlayer(winnerPlayerId, payout.paidMinor);
          perPlayerNet.set(
            winnerPlayerId,
            (perPlayerNet.get(winnerPlayerId) ?? 0) + payout.paidMinor,
          );
          this.repo.insertSurgeEvent({
            roundId: this.roundId,
            winnerPlayerId,
            winnerStakeId: goldenWinner.id,
            amountMinor: payout.paidMinor,
            flatOdds: this.surgeFlatOdds,
          });
          surgeResult = {
            potMinor: payout.paidMinor,
            winnerName: this.fleets.get(winnerPlayerId)?.name ?? '?',
            winnerStakeMinor: goldenWinner.amountMinor,
          };
          // §4.13.6(d) — the pot returns to its defined reset value, funded from
          // the diversion pool first and only then by the house. Money held back
          // at the ceiling therefore comes straight back as the next pot.
          potState = payout.state;
          if (housePlayer && payout.fromHouseMinor > 0) {
            this.repo.creditPlayer(housePlayer.id, -payout.fromHouseMinor);
          }
        } else {
          // Art. 17.3 — no surviving player stake, so the jackpot cannot be paid.
          // It ROLLS OVER UNTOUCHED: cancellation of an unpaid jackpot is not
          // permitted, and `rollOverSurge` is the named, tested expression of that.
          potState = rollOverSurge(potState);
          this.repo.insertSurgeEvent({
            roundId: this.roundId,
            winnerPlayerId: null,
            winnerStakeId: null,
            amountMinor: potState.potMinor,
            flatOdds: this.surgeFlatOdds,
          });
          surgeResult = { potMinor: potState.potMinor, winnerName: null, winnerStakeMinor: null };
        }
      }
      this.repo.setSurgePot(this.cfg.roomId, potState.potMinor, potState.diversionMinor);
      this.surgePotMinor = potState.potMinor;
      this.surgeDiversionMinor = potState.diversionMinor;

      this.repo.settleRound(this.roundId, {
        seedHex: this.seedHex,
        struckZone,
        rakeMinor: settlement.rakeMinor,
        rakeBp: Math.round(this.econ.rake * 10_000),
        maxPayoutMultiple: this.econ.maxPayoutMultiple,
        powerCapped: settlement.powerCapped,
      });

      // Skipper Records (E1) + RG day-loss ledger (F1): same txn as the
      // settlement so neither can ever disagree with a settled round.
      this.updateSkipperRecords(settlement.lines, salvageNetByPlayer, surgeWinnerPlayerId);
      const dayKey = utcDayKey();
      for (const f of this.fleets.values()) {
        const net = perPlayerNet.get(f.playerId) ?? 0;
        if (net !== 0) this.repo.addDayLoss(f.playerId, dayKey, -net);
      }
    });

    // F1: in-memory session accounting, after the txn committed.
    if (this.limits) {
      for (const f of this.fleets.values()) {
        this.limits.noteSessionNet(f.playerId, perPlayerNet.get(f.playerId) ?? 0);
      }
    }

    this.recordRoundTelemetry(struckZone, settlement, handleMinor, power.label, settleStartedAt);

    this.wreckLog.push(struckZone);
    if (this.wreckLog.length > 20) this.wreckLog.shift();

    const resultByPlayer = this.resultsByPlayer(settlement.lines, struckZone, perPlayerNet);
    const results = [...this.fleets.values()].map((f) => ({
      name: f.name,
      outcome: resultByPlayer.get(f.playerId)?.outcome ?? 'SAFE',
      netMinor: perPlayerNet.get(f.playerId) ?? 0,
      // C5: a practice fleet is marked wherever it is published, so a results
      // feed can never pass demo activity off as another player's win.
      ...(f.isBot ? { bot: true } : {}),
    }));
    const replay = this.buildReplay(snapshot, struckZone, salvageNetByPlayer);

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
      ...(this.presentation
        ? {
            eventTier: this.presentation.eventTier,
            environment: this.presentation.environment,
          }
        : {}),
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
          `${r.name} salvaged +${(r.netMinor / 100).toFixed(2)} from Zone ${struckZone + 1}'s pool`,
        );
      }
    }

    if (this.parkAfterRound) this.stop();
    else this.timer = setTimeout(() => this.cooldown(), this.timings.resolvedMs);
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
    this.fogBoatCounts = this.poolsState().boatCounts;
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
    const bands = computeTideBands(pools.totalsMinor, this.lastReportBands, this.seedMinor);
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

  /**
   * Skipper Record updates (E1) — one row per player with a fleet at lock,
   * written inside the settlement transaction. Cosmetic only: nothing here is
   * ever read back into gameplay, odds, or settlement.
   */
  private updateSkipperRecords(
    lines: { id: string; outcome: 'SAFE' | 'WRECKED' }[],
    salvageNetByPlayer: Map<string, number>,
    surgeWinnerPlayerId: string | null,
  ): void {
    const lineById = new Map(lines.map((line) => [line.id, line]));
    for (const f of this.fleets.values()) {
      const entries = this.entriesForFleet(f);
      const wrecked = entries.filter(
        (entry) => lineById.get(entry.id)?.outcome === 'WRECKED',
      ).length;
      const rec: SkipperRecordRow = this.repo.getSkipperRecord(f.playerId) ?? {
        playerId: f.playerId,
        currentStreak: 0,
        bestStreak: 0,
        bluffsCalled: 0,
        biggestSalvageMinor: 0,
        roundsSailed: 0,
        surgeWins: 0,
      };
      rec.roundsSailed += 1;
      // Streak = rounds in a row without losing a single boat (SPLIT breaks it too).
      rec.currentStreak = wrecked === 0 ? rec.currentStreak + 1 : 0;
      rec.bestStreak = Math.max(rec.bestStreak, rec.currentStreak);
      const salvage = salvageNetByPlayer.get(f.playerId) ?? 0;
      if (salvage > rec.biggestSalvageMinor) rec.biggestSalvageMinor = salvage;
      if (surgeWinnerPlayerId === f.playerId) rec.surgeWins += 1;
      const signal = this.signals.get(f.playerId);
      if (signal && !flagHonest(signal.kind, signal.zone, new Set(entries.map((e) => e.zone)))) {
        rec.bluffsCalled += 1;
      }
      this.repo.upsertSkipperRecord(rec);
    }
  }

  private buildReplay(
    snapshot: StakeEntry[],
    struckZone: number,
    salvageNetByPlayer: Map<string, number>,
  ): WreckWakeReplay {
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
        ? `${this.fogMoveCount} player${this.fogMoveCount === 1 ? '' : 's'} moved in the fog before Zone ${
            struckZone + 1
          } was hit.`
        : `Nobody moved in the fog before Zone ${struckZone + 1} was hit.`;

    // E2: net fog movement (lock − fog-start boat counts), from public counts only.
    const lockBoatCounts = this.poolsState().boatCounts;
    const fogNetBoats = this.fogBoatCounts
      ? lockBoatCounts.map((n, z) => n - (this.fogBoatCounts![z] ?? 0))
      : undefined;

    // E2: biggest salvage — post-reveal exact data is public by design.
    let biggestSalvage: { name: string; amountMinor: number } | null = null;
    for (const f of this.fleets.values()) {
      const salvage = salvageNetByPlayer.get(f.playerId) ?? 0;
      if (salvage > 0 && salvage > (biggestSalvage?.amountMinor ?? 0)) {
        biggestSalvage = { name: f.name, amountMinor: salvage };
      }
    }

    // E2/B4: the flag honesty ribbon — every flown flag, judged at reveal.
    const flagReveals: FlagReveal[] = [...this.signals.values()].map((s) => {
      const fleet = this.fleets.get(s.playerId);
      const zones = new Set(fleet ? this.entriesForFleet(fleet).map((e) => e.zone) : []);
      return { name: s.name, zone: s.zone, kind: s.kind, honest: flagHonest(s.kind, s.zone, zones) };
    });

    return {
      headline,
      finalOrders: this.finalOrders.size,
      fogMoves: this.fogMoveCount,
      splitFleets,
      struckPoolMinor: pools[struckZone] ?? 0,
      mostCrowdedSafeZone,
      mostCrowdedSafePoolMinor,
      signalSummary,
      ...(fogNetBoats ? { fogNetBoats } : {}),
      biggestSalvage,
      flagReveals,
    };
  }

  private stakeBand(amountMinor: number): TideBand {
    if (amountMinor < 50_00) return 'light';
    if (amountMinor < 500_00) return 'medium';
    if (amountMinor < 2_000_00) return 'heavy';
    return 'packed';
  }
}
