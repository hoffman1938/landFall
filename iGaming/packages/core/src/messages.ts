/**
 * Wire protocol — Zod schemas shared by server (validation) and web (types).
 * Client->server messages are validated reject-by-default
 * (docs/05-security/security-review.md §1.18).
 */
import { z } from 'zod';
import {
  CHAT_MAX_LEN,
  MAX_STAKE_MINOR,
  MIN_STAKE_MINOR,
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

export const clientMessage = z.discriminatedUnion('type', [
  helloMsg,
  anchorMsg,
  fleetOrderMsg,
  chatMsg,
  signalMsg,
  cancelOrderMsg,
  joinRoomMsg,
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
