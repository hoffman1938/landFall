/**
 * Game constants — the single source of truth referenced by docs/03-math/mathematical-model.md.
 * All money values are integer minor units (1 credit = 100 minor units).
 */
export const ZONE_COUNT = 6;
export const RAKE = 0.06; // rake on the struck pool only -> gross take = RAKE / ZONE_COUNT = 1% of handle
export const HOUSE_SEED_MINOR = 50_00; // house anchors 50.00 credits on every harbor, every round
export const MIN_STAKE_MINOR = 1_00;
export const MAX_STAKE_MINOR = 5_000_00; // high-roller ceiling
export const STARTING_BALANCE_MINOR = 50_000_00;

/**
 * Storm Surge — progressive jackpot (docs/03-math/mathematical-model.md §10).
 * Half the rake feeds a shared pot; on a surge round (provably-fair trigger from
 * the same round digest) the entire pot goes to ONE surviving player stake,
 * picked weighted-by-stake from the lock snapshot. Long-run effective house
 * edge drops from 1% to ~0.5% of handle since half the take returns to players.
 */
export const SURGE_RAKE_SHARE = 0.5; // fraction of each round's rake feeding the pot
export const SURGE_PROB = 1 / 25; // expected surge frequency (~every 25 rounds)
export const SURGE_MIN_POT_MINOR = 500_00; // house re-seeds the pot floor after each payout

/**
 * Storm Power — the per-round salvage multiplier ladder (hurricane categories).
 * Drawn provably-fair from digest span [35,40) (20 bits); survivors' salvage is
 * multiplied by M. Probabilities are exact integer counts in 2^20 space chosen
 * so that E[M] = 1 EXACTLY — the ladder redistributes payout variance (rare
 * huge storms, frequent halved ones) without changing the house edge at all.
 * A 1-credit stake surviving a Perfect Storm on a fat wreck pays hundreds —
 * Landfall's answer to Aviator's "even 1 credit can catch a 500x".
 * Math: docs/03-math/mathematical-model.md §10.
 */
export interface StormPowerTier {
  label: string;
  mNum: number; // multiplier as an exact rational mNum/mDen (integer money math)
  mDen: number;
  /** Cumulative upper bound (exclusive) in [0, 2^20) — draw < bound selects this tier. */
  cumBound: number;
}

export const STORM_POWER_LADDER: StormPowerTier[] = [
  { label: 'Category 1', mNum: 1, mDen: 2, cumBound: 733_570 }, // ×0.5  p≈0.6996
  { label: 'Category 2', mNum: 1, mDen: 1, cumBound: 902_550 }, // ×1    p≈0.1612
  { label: 'Category 3', mNum: 2, mDen: 1, cumBound: 1_007_408 }, // ×2   p≈0.1000
  { label: 'Category 4', mNum: 5, mDen: 1, cumBound: 1_045_157 }, // ×5   p=0.036
  { label: 'Category 5', mNum: 25, mDen: 1, cumBound: 1_048_303 }, // ×25 p=0.003
  { label: 'Category 6', mNum: 100, mDen: 1, cumBound: 1_048_555 }, // ×100 p=0.00024
  { label: 'PERFECT STORM', mNum: 500, mDen: 1, cumBound: 1_048_576 }, // ×500 p=0.00002
];

export function stormPowerFromRoll(roll: number): StormPowerTier {
  for (const tier of STORM_POWER_LADDER) {
    if (roll < tier.cumBound) return tier;
  }
  return STORM_POWER_LADDER[STORM_POWER_LADDER.length - 1]!;
}

export const HARBOR_NAMES = [
  'North Quay',
  'Gullrock',
  'Saltmere',
  'Ketterly',
  'Fogwatch',
  'Brinehollow',
] as const;

/** Round phase timings (ms). Overridable via server env for fast integration tests. */
export const DEFAULT_TIMINGS = {
  anchorMs: 10_000,
  stormMs: 5_000,
  resolvedMs: 3_000,
  cooldownMs: 2_000,
} as const;

/** Final part of ANCHOR_OPEN where public tide movement is hidden and each player gets one order. */
export const BLIND_FOG_MS = 3_000;
export const SPLIT_PRIMARY_PERCENT = 70;

export type WeatherId = 'CLEAR_TIDE' | 'HEAVY_FOG' | 'CROSSWIND' | 'HIGH_SWELL';

export interface WeatherPattern {
  id: WeatherId;
  label: string;
  shortLabel: string;
  description: string;
}

export const WEATHER_PATTERNS: WeatherPattern[] = [
  {
    id: 'CLEAR_TIDE',
    label: 'Clear Tide',
    shortLabel: 'Clear',
    description: 'Standard tide reports and a three-second Blind Fog.',
  },
  {
    id: 'HEAVY_FOG',
    label: 'Heavy Fog',
    shortLabel: 'Fog',
    description: 'Blind Fog rolls in earlier, so final movement is hidden longer.',
  },
  {
    id: 'CROSSWIND',
    label: 'Crosswind',
    shortLabel: 'Wind',
    description: 'Signal flags arrive with a short delay, making bluffs harder to read.',
  },
  {
    id: 'HIGH_SWELL',
    label: 'High Swell',
    shortLabel: 'Swell',
    description: 'The storm approach is louder and more dramatic; odds are unchanged.',
  },
] as const;

export function weatherFromRoll(roll: number): WeatherPattern {
  return WEATHER_PATTERNS[roll % WEATHER_PATTERNS.length]!;
}

export type RoundPhase = 'ANCHOR_OPEN' | 'LOCKED_STORM' | 'RESOLVED' | 'COOLDOWN';

/** Chat constraints (docs/02-game-design/game-design-document.md §5.1) */
export const CHAT_MAX_LEN = 200;
export const CHAT_MIN_INTERVAL_MS = 2_000;
export const CHAT_BURST = 3;

export const SEED_CHAIN_LENGTH = 10_000; // seeds per season
