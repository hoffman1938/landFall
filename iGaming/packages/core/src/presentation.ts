/**
 * Presentation draws — event tier, environment, cosmetic stream.
 *
 * ============================================================================
 * THE ONE RULE OF THIS FILE
 * ============================================================================
 * Nothing here can move the harbor draw. Every harbor keeps P = 1/6 exactly,
 * for every tier, every environment and every cosmetic variation, because the
 * harbor draw is a different HMAC over a different message and is computed in
 * `beginRound()` before any of this exists. These three tables decide how the
 * round LOOKS and how long each beat of the reveal is allowed to be — never who
 * gets hit, never what anything pays.
 *
 * Domains (rng.ts `domainDigest`):
 *   harbor      landfall:round:<roundId>        <- authoritative, elsewhere
 *   event        landfall:event:<roundId>
 *   environment  landfall:environment:<roundId>
 *   cosmetic     landfall:cosmetic:<roundId>
 *
 * All three tables below are exact integer parts-per-million and are asserted to
 * sum to 1_000_000 at module load, so a mis-typed weight is a crash at boot
 * rather than a silently skewed distribution.
 */
import { domainDigest, ppmFrom } from './rng.js';

const PPM = 1_000_000;

/* ============================== event tier ============================== */

/**
 * How loud this round's reveal is.
 *
 * The ids are the brief's (`CALM`/`SURGE`/`TEMPEST`); the middle tier's PLAYER-
 * FACING label is "HEAVY", not "surge", because Storm Surge is already the name
 * of the progressive jackpot and one word may only ever mean one thing at the
 * moment a result lands.
 */
export type EventTierId = 'CALM' | 'SURGE' | 'TEMPEST';

export interface EventTierSpec {
  id: EventTierId;
  /** What the player is shown. Never the word "surge" — that is the jackpot. */
  label: string;
  /** Exact probability in parts per million. */
  weightPpm: number;
  /** Cumulative upper bound (exclusive) in [0, 1e6) — roll < bound selects this tier. */
  cumPpm: number;
  /** Radar sweeps played during the reveal. More sweeps = more narrowing steps. */
  pulses: number;
  /** Camera shake amplitude at impact, in board pixels. 0 = still. */
  shakePx: number;
  /** Does the reveal repaint the sky? */
  skyShift: boolean;
  /** Does the reveal throw lightning? */
  lightning: boolean;
  /** One line for the info sheet. Never implies an odds change, because there is none. */
  description: string;
}

export const EVENT_TIERS: readonly EventTierSpec[] = [
  {
    id: 'CALM',
    label: 'Calm',
    weightPpm: 750_000,
    cumPpm: 750_000,
    pulses: 2,
    shakePx: 0,
    skyShift: false,
    lightning: false,
    description: 'A standard approach. The storm takes the short route in.',
  },
  {
    id: 'SURGE',
    label: 'Heavy',
    weightPpm: 200_000,
    cumPpm: 950_000,
    pulses: 3,
    shakePx: 4,
    skyShift: false,
    lightning: false,
    description: 'Rough water. The sweep runs wider and the board takes the hit harder.',
  },
  {
    id: 'TEMPEST',
    label: 'Tempest',
    weightPpm: 50_000,
    cumPpm: 1_000_000,
    pulses: 4,
    shakePx: 9,
    skyShift: true,
    lightning: true,
    description: 'A rare one. The sky turns over and the strike arrives with everything behind it.',
  },
] as const;

export function eventTierFromRoll(rollPpm: number): EventTierSpec {
  for (const tier of EVENT_TIERS) {
    if (rollPpm < tier.cumPpm) return tier;
  }
  return EVENT_TIERS[EVENT_TIERS.length - 1]!;
}

/* ============================== environment ============================== */

export type EnvironmentId =
  'NORMAL_SEA' | 'RAIN' | 'NIGHT' | 'LIGHTNING' | 'RED_SKY' | 'AURORA' | 'BLACK_FOG';

export type EnvironmentRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface EnvironmentSpec {
  id: EnvironmentId;
  label: string;
  weightPpm: number;
  cumPpm: number;
  rarity: EnvironmentRarity;
  /** Base tint the board fades to, 0xRRGGBB. Presentation only. */
  skyHex: number;
  description: string;
}

/**
 * The board's weather skin. Purely cosmetic and deliberately unconnected to
 * `WeatherPattern` in constants.ts, which is a MECHANICAL modifier (fog length,
 * flag delay). Two systems, two names, no overlap: a Black Fog round can be a
 * Clear Tide round, and neither knows about the other.
 */
export const ENVIRONMENTS: readonly EnvironmentSpec[] = [
  {
    id: 'NORMAL_SEA',
    label: 'Open Sea',
    weightPpm: 650_000,
    cumPpm: 650_000,
    rarity: 'common',
    skyHex: 0x101010,
    description: 'Clear water and a flat horizon.',
  },
  {
    id: 'RAIN',
    label: 'Rain',
    weightPpm: 200_000,
    cumPpm: 850_000,
    rarity: 'common',
    skyHex: 0x121418,
    description: 'Steady rain across the chart.',
  },
  {
    id: 'NIGHT',
    label: 'Night Watch',
    weightPpm: 80_000,
    cumPpm: 930_000,
    rarity: 'uncommon',
    skyHex: 0x080a12,
    description: 'The harbors run on lamplight.',
  },
  {
    id: 'LIGHTNING',
    label: 'Dry Lightning',
    weightPpm: 40_000,
    cumPpm: 970_000,
    rarity: 'uncommon',
    skyHex: 0x14121a,
    description: 'Flashes on the horizon all round.',
  },
  {
    id: 'RED_SKY',
    label: 'Red Sky',
    weightPpm: 20_000,
    cumPpm: 990_000,
    rarity: 'rare',
    skyHex: 0x1c0c0c,
    description: 'Red sky at morning. Sailors take warning.',
  },
  {
    id: 'AURORA',
    label: 'Aurora',
    weightPpm: 8_000,
    cumPpm: 998_000,
    rarity: 'rare',
    skyHex: 0x061410,
    description: 'Light over the northern harbors.',
  },
  {
    id: 'BLACK_FOG',
    label: 'Black Fog',
    weightPpm: 2_000,
    cumPpm: 1_000_000,
    rarity: 'legendary',
    skyHex: 0x000000,
    description: 'The chart goes dark. One round in five hundred.',
  },
] as const;

export function environmentFromRoll(rollPpm: number): EnvironmentSpec {
  for (const env of ENVIRONMENTS) {
    if (rollPpm < env.cumPpm) return env;
  }
  return ENVIRONMENTS[ENVIRONMENTS.length - 1]!;
}

/* ============================== cosmetic ============================== */

/**
 * Deterministic visual jitter — wave phase, rain offsets, where a lightning
 * fork lands. Reaches the canvas and nothing else, so every client draws the
 * same round identically without any of it ever being an input to anything.
 */
export interface CosmeticDraw {
  /** 32-bit stream seed for the client's visual PRNG. */
  seed: number;
  /** 0..999 — a variation index for one-of-N cosmetic picks. */
  variant: number;
}

export function cosmeticFromDigest(digestHex: string): CosmeticDraw {
  return {
    seed: parseInt(digestHex.slice(0, 8), 16) >>> 0,
    variant: ppmFrom(digestHex, 8) % 1_000,
  };
}

/* ============================== the draw ============================== */

export interface RoundPresentation {
  eventTier: EventTierSpec;
  environment: EnvironmentSpec;
  cosmetic: CosmeticDraw;
}

export function drawEventTier(seedHex: string, roundId: number): EventTierSpec {
  return eventTierFromRoll(ppmFrom(domainDigest(seedHex, 'event', roundId)));
}

export function drawEnvironment(seedHex: string, roundId: number): EnvironmentSpec {
  return environmentFromRoll(ppmFrom(domainDigest(seedHex, 'environment', roundId)));
}

export function drawCosmetic(seedHex: string, roundId: number): CosmeticDraw {
  return cosmeticFromDigest(domainDigest(seedHex, 'cosmetic', roundId));
}

/** All three presentation domains for one round. Never an input to settlement. */
export function drawPresentation(seedHex: string, roundId: number): RoundPresentation {
  return {
    eventTier: drawEventTier(seedHex, roundId),
    environment: drawEnvironment(seedHex, roundId),
    cosmetic: drawCosmetic(seedHex, roundId),
  };
}

/* ---------- boot-time table validation ---------- */

function assertTable(name: string, rows: readonly { weightPpm: number; cumPpm: number }[]): void {
  let running = 0;
  for (const row of rows) {
    running += row.weightPpm;
    if (row.cumPpm !== running) {
      throw new Error(`${name}: cumulative bound ${row.cumPpm} should be ${running}`);
    }
  }
  if (running !== PPM) throw new Error(`${name}: weights sum to ${running}, expected ${PPM}`);
}

assertTable('EVENT_TIERS', EVENT_TIERS);
assertTable('ENVIRONMENTS', ENVIRONMENTS);
