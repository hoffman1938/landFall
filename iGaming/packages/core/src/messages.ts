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

export const clientMessage = z.discriminatedUnion('type', [
  helloMsg,
  anchorMsg,
  fleetOrderMsg,
  chatMsg,
  signalMsg,
  cancelOrderMsg,
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

export type ServerMessage =
  | {
      type: 'WELCOME';
      playerId: string;
      name: string;
      balanceMinor: number;
      chainCommitment: string;
      houseSeedMinor: number;
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
    }
  | {
      type: 'CANCEL_ACK';
      balanceMinor: number;
      /** True when the cancel happened during Blind Fog and consumed the one hidden order. */
      finalOrderUsed: boolean;
      refundMinor: number;
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
    }
  | { type: 'PHASE'; phase: PhaseInfo }
  | { type: 'CHAT_MESSAGE'; entry: ChatEntry }
  | { type: 'SYSTEM_MESSAGE'; text: string; at: number }
  | { type: 'ERROR'; code: string; message: string };

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
