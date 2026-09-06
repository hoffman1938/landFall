/**
 * Game constants — the single source of truth referenced by docs/03-math/mathematical-model.md.
 * All money values are integer minor units (1 credit = 100 minor units).
 */
export const ZONE_COUNT = 6;
export const RAKE = 0.12; // rake on the struck pool only -> gross take = RAKE / ZONE_COUNT = 2% of handle
/**
 * Ceiling for the house seed per harbor — what a COMPLETELY DEAD table gets.
 * The seed is no longer a constant: `houseSeedPerZone()` in liquidity.ts tops
 * the table up to LIQUIDITY_FLOOR_MINOR and then falls away to
 * LIQUIDITY_MIN_SEED_MINOR as real players arrive. A large flat seed averages
 * the pools together and flattens payouts to the same number every round —
 * see the measured table in liquidity.ts.
 */
export const HOUSE_SEED_MINOR = 50_00;
/** Total table handle the house guarantees while the room is thin. */
export const LIQUIDITY_FLOOR_MINOR = ZONE_COUNT * HOUSE_SEED_MINOR;
/** Token seed that always remains, so no harbor is ever literally empty. */
export const LIQUIDITY_MIN_SEED_MINOR = 1_00;
export const MIN_STAKE_MINOR = 1_00;
/**
 * Absolute protocol ceiling — the widest stake the wire schema will carry.
 * Effective ceilings come from room tiers (`packages/server/config/rooms.json`)
 * and are always far lower; this exists so the top tier has head-room and so a
 * malformed client cannot ask for an unbounded number. Raised from 5,000 to
 * 500,000 credits when the Galleon/Leviathan high-roller tiers were added.
 */
export const MAX_STAKE_MINOR = 500_000_00;
export const STARTING_BALANCE_MINOR = 50_000_00;

/**
 * Rake split — where each round's rake goes (fractions of the rake, sum = 1):
 *   house        -> operator revenue (net hold ≈ RAKE/ZONE_COUNT × house = 1% of handle)
 *   surge        -> Storm Surge progressive pot (returns to players)
 *   stormReserve -> Storm Reserve funding the Storm Power ladder's E[M−1] overpayment
 * Player-facing long-run return ≈ 98% (survivors receive (1−RAKE) = 88% of the
 * wrecked pool; surge + reserve flows return the rest of the non-house take).
 */
export interface RakeSplit {
  house: number;
  surge: number;
  stormReserve: number;
}
export const RAKE_SPLIT: RakeSplit = { house: 0.5, surge: 0.25, stormReserve: 0.25 };

/** Operator-configurable rake bounds; splits must be non-negative and sum to 1. */
export const RAKE_MIN = 0.06;
export const RAKE_MAX = 0.2;

/** Validate a (rake, split) room/env override. Throws with a precise reason. */
export function validateRakeConfig(rake: number, split: RakeSplit): void {
  if (!Number.isFinite(rake) || rake < RAKE_MIN || rake > RAKE_MAX) {
    throw new Error(`rake ${rake} outside [${RAKE_MIN}, ${RAKE_MAX}]`);
  }
  const parts = [split.house, split.surge, split.stormReserve];
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) {
    throw new Error(`rake split parts must be non-negative, got ${JSON.stringify(split)}`);
  }
  const sum = parts.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`rake split must sum to 1, got ${sum}`);
  }
}

/**
 * Storm Power liability cap — max total salvage per round as a multiple of the
 * round handle. A nominal ×500 Perfect Storm on a whale pool is clamped here;
 * the clamp is published in the round result (powerCapped) and the unspent
 * overpayment intent stays in the Storm Reserve. Operator-configurable.
 */
export const STORM_POWER_MAX_PAYOUT_MULTIPLE = 25;

/**
 * Storm Surge — progressive jackpot (docs/03-math/mathematical-model.md §10).
 * RAKE_SPLIT.surge of the rake feeds a shared pot; on a surge round
 * (provably-fair trigger from the same round digest) the entire pot goes to ONE
 * surviving player stake, picked weighted-by-stake from the lock snapshot.
 */
export const SURGE_PROB = 1 / 25; // expected surge frequency (~every 25 rounds)

/**
 * The pot floor the house re-seeds after each payout.
 *
 * Pots are per TABLE (`surge_pots` is keyed by room) and are fed only by the
 * rake of rounds played at that table, so a Leviathan player's losses can never
 * pay out to a 1-credit Skiff bet. The floor, however, used to be a flat 500
 * credits everywhere, which is a different unfairness in both directions: ten
 * times the Skiff table maximum, and a tenth of one percent of the Leviathan
 * minimum bet — a jackpot a high-roller would not notice had been won.
 *
 * `surgeFloorFor` ties the floor to the table instead: never trivial in
 * absolute terms, and never trivial *for this table* either. Rooms may override
 * it in the rooms config; this is the default shape.
 */
export const SURGE_MIN_POT_MINOR = 500_00;

/** A floor worth this many minimum bets at the table it belongs to. */
export const SURGE_FLOOR_MIN_STAKE_MULTIPLE = 20;

export function surgeFloorFor(minStakeMinor: number): number {
  return Math.max(SURGE_MIN_POT_MINOR, SURGE_FLOOR_MIN_STAKE_MULTIPLE * minStakeMinor);
}
/**
 * Flat-odds Golden Anchor (A4, P2, feature flag): every Nth surge round pays the
 * pot with EQUAL odds per surviving stake entry instead of stake-weighted odds —
 * announced in the round header like surge itself. 0 disables (default; enable
 * per deployment via LANDFALL_SURGE_FLAT_EVERY once RG/compliance review clears it).
 */
export const SURGE_FLAT_ODDS_EVERY_N = 0;

/**
 * Whale guardrail (B5) — a single player's total round stake may not exceed
 * this fraction of the round handle (house seeds included), evaluated at
 * accept time against the handle INCLUDING the candidate stake: you can never
 * be more than a quarter of the room. Pari-mutuel-native: caps payout
 * domination and pool-reading leverage at once. Per-room overridable.
 */
export const WHALE_CAP_FRACTION = 0.25;

/**
 * Signal flag friction (B4) — flags stay free to read, not free to spam-lie:
 * flying one requires an anchored fleet of at least SIGNAL_MIN_STAKE_MINOR in
 * that round, and flags are usable in at most FLAG_MAX_PER_WINDOW of any
 * FLAG_WINDOW_ROUNDS consecutive rounds per account.
 */
export const SIGNAL_MIN_STAKE_MINOR = 5_00;
export const FLAG_MAX_PER_WINDOW = 2;
export const FLAG_WINDOW_ROUNDS = 3;

/**
 * Storm Power — the per-round salvage multiplier ladder (hurricane categories).
 * Drawn provably-fair from digest span [35,40) (20 bits); survivors' salvage is
 * multiplied by M. Probabilities are exact integer counts in 2^20 space.
 *
 * Ladder v2 invariants (remediation Workstream A2, replacing E[M]=1):
 *   - floor is ×1: a survivor's salvage is NEVER reduced (Category 1 leaves it untouched);
 *   - the expected overpayment E[M−1] is funded by the Storm Reserve:
 *       E[M−1] × (1−RAKE) ≤ RAKE_SPLIT.stormReserve × RAKE
 *     With RAKE 0.12 and reserve share 0.25 the exact budget is E[M−1] ≤ 3/88.
 *     This ladder's Σ count·(M−1) = 35,685.5 of a 35,746.9 budget in 2^20 space
 *     (99.8% utilization; the slack is deliberate reserve head-room).
 *   - felt "storm bonus" (M>1) on ~1 round in 11.3; the marketable tail keeps a
 *     nominal ×500 Perfect Storm (~1 in 2^20), clamped per round by
 *     STORM_POWER_MAX_PAYOUT_MULTIPLE and drawn from the reserve.
 * The exact-arithmetic funding test lives in core/test/storm-power.test.ts.
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
  { label: 'Category 1', mNum: 1, mDen: 1, cumBound: 955_529 }, // ×1     p≈0.9113
  { label: 'Category 2', mNum: 5, mDen: 4, cumBound: 1_039_415 }, // ×1.25 p=0.0800  (~1 in 12.5)
  { label: 'Category 3', mNum: 2, mDen: 1, cumBound: 1_047_415 }, // ×2    p≈0.00763 (~1 in 131)
  { label: 'Category 4', mNum: 5, mDen: 1, cumBound: 1_048_515 }, // ×5    p≈0.00105 (~1 in 953)
  { label: 'Category 5', mNum: 25, mDen: 1, cumBound: 1_048_570 }, // ×25  p≈5.2e-5  (~1 in 19k)
  { label: 'Category 6', mNum: 100, mDen: 1, cumBound: 1_048_575 }, // ×100 p≈4.8e-6 (~1 in 210k)
  { label: 'PERFECT STORM', mNum: 500, mDen: 1, cumBound: 1_048_576 }, // ×500 p=2^-20 (~1 in 1.05M)
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

/**
 * Responsible gambling (F1/F2) — self-set limits are server-enforced on the
 * anchor accept path. Tightening a limit applies immediately; LOOSENING one
 * (raising or clearing) only takes effect after this cooldown (industry
 * standard). Self-exclusion can only ever be extended, never shortened.
 */
export const LIMIT_RAISE_COOLDOWN_MS = 24 * 60 * 60 * 1_000;
export const REALITY_CHECK_MAX_MINUTES = 480;
export const EXCLUSION_MAX_MINUTES = 365 * 24 * 60;

export const SEED_CHAIN_LENGTH = 10_000; // seeds per season
