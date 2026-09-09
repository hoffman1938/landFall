/**
 * Wire protocol — Zod schemas shared by server (validation) and web (types).
 * Client->server messages are validated reject-by-default
 * (docs/05-security/security-review.md §1.18).
 */
import { z } from 'zod';
import type { LiquidityLevel } from './liquidity.js';
import {
  CHAT_MAX_LEN,
  EXCLUSION_MAX_MINUTES,
  MAX_STAKE_MINOR,
  MIN_STAKE_MINOR,
  REALITY_CHECK_MAX_MINUTES,
  ZONE_COUNT,
  type WeatherPattern,
} from './constants.js';

// ---------- client -> server ----------

export const helloMsg = z.object({
  type: z.literal('HELLO'),
  playerId: z.string().uuid().optional(),
});

export const anchorMsg = z.object({
  type: z.literal('ANCHOR'),
  zone: z
    .number()
    .int()
    .min(0)
    .max(ZONE_COUNT - 1),
  stakeMinor: z.number().int().min(MIN_STAKE_MINOR).max(MAX_STAKE_MINOR),
});

export const fleetOrderMsg = z.object({
  type: z.literal('FLEET_ORDER'),
  mode: z.enum(['FOCUS', 'SPLIT']),
  primaryZone: z
    .number()
    .int()
    .min(0)
    .max(ZONE_COUNT - 1),
  secondaryZone: z
    .number()
    .int()
    .min(0)
    .max(ZONE_COUNT - 1)
    .optional(),
  stakeMinor: z.number().int().min(MIN_STAKE_MINOR).max(MAX_STAKE_MINOR),
});

export const chatMsg = z.object({
  type: z.literal('CHAT'),
  text: z.string().min(1).max(CHAT_MAX_LEN),
});

export const signalMsg = z.object({
  type: z.literal('SIGNAL'),
  zone: z
    .number()
    .int()
    .min(0)
    .max(ZONE_COUNT - 1),
  kind: z.enum(['RALLY', 'FLEE', 'HOLD']),
});

/** Withdraw the whole fleet order before lock; the stake is refunded in full. */
export const cancelOrderMsg = z.object({
  type: z.literal('CANCEL_ORDER'),
});

/** Switch rooms (C1). Any live order in the old room is cancelled+refunded first. */
export const joinRoomMsg = z.object({
  type: z.literal('JOIN_ROOM'),
  roomId: z.string().min(1).max(64),
});

/** Look up a skipper's cosmetic record by display name (E1). */
export const getSkipperMsg = z.object({
  type: z.literal('GET_SKIPPER'),
  name: z.string().min(1).max(64),
});

/**
 * Self-set responsible-gambling limits (F1). Omitted fields are unchanged;
 * null clears a limit. Tightening applies immediately; loosening (raise or
 * clear) is queued behind LIMIT_RAISE_COOLDOWN_MS server-side.
 */
export const setLimitsMsg = z.object({
  type: z.literal('SET_LIMITS'),
  sessionLossLimitMinor: z.number().int().positive().nullable().optional(),
  dailyLossLimitMinor: z.number().int().positive().nullable().optional(),
  stakePerRoundCapMinor: z.number().int().positive().nullable().optional(),
  realityCheckMinutes: z
    .number()
    .int()
    .min(1)
    .max(REALITY_CHECK_MAX_MINUTES)
    .nullable()
    .optional(),
});

/** Demo-grade self-exclusion (F2): a lockout that can only be extended. */
export const setExclusionMsg = z.object({
  type: z.literal('SET_EXCLUSION'),
  minutes: z.number().int().min(1).max(EXCLUSION_MAX_MINUTES),
});

export const clientMessage = z.discriminatedUnion('type', [
  helloMsg,
  anchorMsg,
  fleetOrderMsg,
  chatMsg,
  signalMsg,
  cancelOrderMsg,
  joinRoomMsg,
  getSkipperMsg,
  setLimitsMsg,
  setExclusionMsg,
]);
export type ClientMessage = z.infer<typeof clientMessage>;

// ---------- server -> client ----------

export interface PhaseInfo {
  phase: 'ANCHOR_OPEN' | 'LOCKED_STORM' | 'RESOLVED' | 'COOLDOWN';
  endsAt: number; // epoch ms, server clock
}

export interface PoolsState {
  /** Per-zone totals in minor units, INCLUDING house seeds. */
  totalsMinor: number[];
  /** Per-zone anchored player count (house seeds excluded). */
  boatCounts: number[];
}

export type TideBand = 'seed' | 'light' | 'medium' | 'heavy' | 'packed';
export type TideTrend = 'falling' | 'stable' | 'rising';

export interface TideReportEntry {
  zone: number;
  band: TideBand;
  trend: TideTrend;
  boatCount: number;
}

export interface TideReport {
  entries: TideReportEntry[];
  generatedAt: number;
  /** True during Blind Fog: the report is intentionally frozen while final orders are hidden. */
  frozen: boolean;
}

export type SignalKind = 'RALLY' | 'FLEE' | 'HOLD';
export type FleetMode = 'FOCUS' | 'SPLIT';

export interface FleetPlanPublic {
  mode: FleetMode;
  primaryZone: number;
  secondaryZone: number | null;
  stakeMinor: number;
}

/**
 * Flag honesty reveal (E2/B4): did the flag match where that skipper's fleet
 * actually sat at lock? RALLY/HOLD are honest on an occupied cove; FLEE is
 * honest on a cove the fleet is NOT in. Computed from public data only.
 */
export interface FlagReveal {
  name: string;
  zone: number;
  kind: SignalKind;
  honest: boolean;
}

export interface WreckWakeReplay {
  headline: string;
  finalOrders: number;
  fogMoves: number;
  splitFleets: number;
  struckPoolMinor: number;
  mostCrowdedSafeZone: number | null;
  mostCrowdedSafePoolMinor: number;
  signalSummary: {
    rally: number;
    flee: number;
    hold: number;
    onStruck: number;
  };
  /** Net boats per zone between fog start and lock (E2) — the fog-movement arrows. */
  fogNetBoats?: number[];
  /** Largest positive salvage this round (post-reveal, public exact data). */
  biggestSalvage?: { name: string; amountMinor: number } | null;
  /** Flag honesty ribbon (E2): every flown flag, revealed honest or bluff. */
  flagReveals?: FlagReveal[];
}

export interface SignalPublic {
  name: string;
  zone: number;
  kind: SignalKind;
}

export interface PlayerPublic {
  name: string;
  zone: number;
  /** Present only after lock/reveal. Live anchor lists use stakeBand to avoid exact whale tracking. */
  stakeMinor?: number;
  stakeBand?: TideBand;
  mode?: FleetMode;
  shareLabel?: string;
}

/**
 * Skipper Record (E1) — per-player, cosmetic-only, odds-irrelevant reputation.
 * No XP, no progression rewards, no wagering incentives: identity, not Skinner box.
 */
export interface SkipperRecordPublic {
  name: string;
  currentStreak: number;
  bestStreak: number;
  bluffsCalled: number;
  biggestSalvageMinor: number;
  roundsSailed: number;
  surgeWins: number;
}

/** A queued loosening of a limit (F1), applied once effectiveAt passes. */
export interface LimitsPending {
  field: 'sessionLossLimitMinor' | 'dailyLossLimitMinor' | 'stakePerRoundCapMinor';
  value: number | null;
  effectiveAt: number;
}

/** Responsible-gambling state (F1/F2). null = not set; all server-enforced. */
export interface LimitsState {
  sessionLossLimitMinor: number | null;
  dailyLossLimitMinor: number | null;
  stakePerRoundCapMinor: number | null;
  realityCheckMinutes: number | null;
  /** Self-exclusion lockout (F2): anchors rejected until this epoch ms. */
  excludedUntil: number | null;
  pending: LimitsPending[];
}

/** Lobby room card (C1/C2): name, stakes, REAL human count (bots never counted). */
export interface RoomInfo {
  roomId: string;
  name: string;
  minStakeMinor: number;
  maxStakeMinor: number;
  /** Connected human players (population honesty — excludes bots). */
  humanCount: number;
  /** Demo practice bots allowed in this room (never true outside demo env). */
  botsAllowed: boolean;
  /**
   * Population hint for the lobby ('quiet' | 'filling' | 'busy'), derived from
   * `humanCount` alone. Display and routing only — it never touches odds,
   * stakes or settlement. Optional so older clients keep parsing (§3 law).
   */
  liquidity?: LiquidityLevel;
}

export type ServerMessage =
  | {
      type: 'WELCOME';
      playerId: string;
      name: string;
      balanceMinor: number;
      chainCommitment: string;
      houseSeedMinor: number;
      roomId: string;
      rooms: RoomInfo[];
      /** Room stake limits for client-side pre-checks (B5/C2). */
      minStakeMinor: number;
      maxStakeMinor: number;
      whaleCapFraction: number;
      /**
       * Total handle the house guarantees while the table is thin. Published so
       * the client can derive the SAME round-share cap the server enforces
       * (`max(liquidityFloor, ZONE_COUNT × houseSeed + others)`) instead of
       * guessing it from the previous round and offering stakes that get
       * rejected. Room config, not private state — the practice bots already
       * derive their ladder from it (remediation decision 63).
       */
      liquidityFloorMinor: number;
      round: RoundHeader;
      phase: PhaseInfo;
      /** Exact pools are present only outside the live decision window. */
      pools?: PoolsState;
      tideReport: TideReport;
      anchors: PlayerPublic[];
      signals: SignalPublic[];
      yourAnchor: { zone: number; stakeMinor: number } | null;
      yourFleet: FleetPlanPublic | null;
      wreckLog: number[];
      chatTail: ChatEntry[];
      /** Responsible-gambling state (F1/F2) for the settings sheet. */
      limits: LimitsState;
      /** Epoch ms this connection's session began — drives the session clock (F2). */
      sessionStartAt: number;
    }
  | { type: 'ROUND_HEADER'; round: RoundHeader; phase: PhaseInfo; tideReport: TideReport }
  | {
      type: 'TIDE_REPORT';
      tideReport: TideReport;
      anchors: PlayerPublic[];
      signals: SignalPublic[];
    }
  | { type: 'FOG_STARTED'; tideReport: TideReport; phase: PhaseInfo }
  | {
      type: 'ANCHOR_ACK';
      zone: number;
      stakeMinor: number;
      balanceMinor: number;
      finalOrderUsed?: boolean;
      fleet?: FleetPlanPublic;
      /** Signed action receipt (B1). */
      receipt?: ActionReceipt;
    }
  | {
      type: 'CANCEL_ACK';
      balanceMinor: number;
      /** True when the cancel happened during Blind Fog and consumed the one hidden order. */
      finalOrderUsed: boolean;
      refundMinor: number;
      /** Signed action receipt (B1). */
      receipt?: ActionReceipt;
    }
  | { type: 'SIGNAL_UPDATE'; signals: SignalPublic[] }
  | { type: 'LOCK_SNAPSHOT'; pools: PoolsState; anchors: PlayerPublic[]; phase: PhaseInfo }
  | { type: 'STORM_PATH'; feints: [number, number]; phase: PhaseInfo }
  | {
      type: 'LANDFALL';
      roundId: number;
      struckZone: number;
      seedHex: string;
      prevChainValue: string;
      pools: PoolsState;
      results: { name: string; outcome: 'SAFE' | 'WRECKED' | 'SPLIT'; netMinor: number }[];
      yourResult: { outcome: 'SAFE' | 'WRECKED' | 'SPLIT' | 'SPECTATOR'; netMinor: number };
      balanceMinor: number;
      phase: PhaseInfo;
      wreckLog: number[];
      replay: WreckWakeReplay;
      /** Present only on surge rounds. */
      surge?: SurgeResult;
      /** Storm Power (hurricane category) that multiplied this round's salvage. */
      stormPower: { label: string; mNum: number; mDen: number };
      /** True when the per-round liability cap clamped the Storm Power payout (disclosed, never silent). */
      powerCapped: boolean;
    }
  | { type: 'PHASE'; phase: PhaseInfo }
  | { type: 'ROOM_LIST'; rooms: RoomInfo[] }
  | { type: 'CHAT_MESSAGE'; entry: ChatEntry }
  | { type: 'SYSTEM_MESSAGE'; text: string; at: number }
  /** E1: reply to GET_SKIPPER. record is null when no such skipper exists. */
  | { type: 'SKIPPER_RECORD'; name: string; record: SkipperRecordPublic | null }
  /** F1/F2: authoritative limits state after every SET_LIMITS/SET_EXCLUSION. */
  | { type: 'LIMITS_STATE'; limits: LimitsState }
  /**
   * F1: periodic reality check — net position + elapsed time. Calm, dismissible,
   * NEVER amber (beacon amber is payout-only, Identity Freeze §2.7).
   */
  | { type: 'REALITY_CHECK'; elapsedMinutes: number; sessionNetMinor: number; at: number }
  | {
      type: 'ERROR';
      code: string;
      message: string;
      /** Signed rejection receipt for late/refused round actions (B1). */
      receipt?: ActionReceipt;
    };

export interface RoundHeader {
  roundId: number;
  chainIndex: number;
  houseSeedMinor: number;
  /** Epoch ms when Blind Fog begins during ANCHOR_OPEN. */
  fogStartsAt: number;
  weather: WeatherPattern;
  /** Storm Surge: is THIS round a surge round (announced before anchoring), and the live pot. */
  surgeRound: boolean;
  surgePotMinor: number;
  /**
   * Flat-odds Golden Anchor (A4, flag-gated): on this surge round every surviving
   * stake has equal odds instead of stake-weighted odds. Announced pre-anchor.
   */
  surgeFlatOdds: boolean;
}

/**
 * Signed action receipt (B1): the server's non-repudiable record of exactly what
 * it accepted (or rejected) and when. HMAC-signed with the server's receipt key,
 * persisted, echoed in the ACK, and shown in the Verify sheet's order history.
 */
export interface ActionReceipt {
  roundId: number;
  /** Monotonic per-round sequence over all accepted/rejected receipted actions. */
  seq: number;
  playerId: string;
  /** What the player asked: ANCHOR | FLEET_ORDER | CANCEL_ORDER. */
  action: string;
  /** SHA-256 hex of the canonical action payload (zone/mode/stake…). */
  actionHash: string;
  /** Server receive timestamp, epoch ms. */
  ts: number;
  /** Milliseconds between receipt and the anchor-lock boundary (negative = after lock). */
  msBeforeLock: number;
  verdict: 'ACCEPTED' | 'REJECTED';
  /** Rejection code for REJECTED receipts (e.g. ROUND_LOCKED). */
  reason?: string;
  /** HMAC-SHA256 over the canonical receipt string, hex. */
  sigHex: string;
}

export interface SurgeResult {
  potMinor: number;
  /** Winner of the whole pot, or null when no player stake survived (pot rolls over). */
  winnerName: string | null;
  winnerStakeMinor: number | null;
}

export interface ChatEntry {
  name: string;
  text: string;
  at: number;
}
