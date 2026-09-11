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
 * Player-facing long-run return ≈ 99.0% — survivors receive (1−RAKE) = 88% of
 * the wrecked pool, and the surge and reserve shares come back to players on top
 * of that. The figure used to be quoted as 98%, which is the BASE term alone
 * (1 − RAKE/ZONE_COUNT) and ignores the two return flows the same sentence
 * listed; GLI-19 §4.7.2 requires a displayed return to match its own stated
 * derivation. The single source is `theoreticalRtp()` in rtp.ts — never retype
 * the number, call `economyDisclosure()`.
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
 * round handle. The clamp is published in the round result (`powerCapped`) and
 * recomputable from the public lock snapshot. Operator-configurable.
 *
 * WHY 150, AND WHY IT USED TO BE 25.
 *
 * The cap is denominated in HANDLE; the multiplier it limits is applied to
 * `distributable = (1−RAKE)·P_struck`. Those are different bases, so the
 * EFFECTIVE ceiling on the multiplier is a function of the round's pool shape:
 *
 *     salvage = (1−r)·P_struck·M  ≤  C·T     ⟺     M ≤ C / ((1−r)·P_struck/T)
 *
 * At C = 25 that bound is ×170.5 when the pools are uniform (P_struck/T = 1/6),
 * and the cap bit on ANY round whose struck harbor held more than 5.68% of the
 * handle. Six harbors average 16.7%, so the advertised ×500 Perfect Storm was
 * clamped in essentially every round it ever landed in — the 10M-round sim's 13
 * cap hits are almost exactly its 9.5 expected Perfect Storms. An award that
 * cannot be paid at its advertised value fails GLI-19 §4.4.1(f) ("an explicitly
 * advertised award must be winnable from a single game or series"), on top of
 * the §4.7.4/§4.13.3 disclosure the cap already owed players.
 *
 * The bound is now DERIVED from the ladder instead of chosen: the cap must pay
 * every advertised tier in full while the struck harbor holds up to TWICE its
 * uniform share — a genuinely crowded harbor, and already the windfall case for
 * survivors. For the top tier that is
 *
 *     C ≥ (1−r)·M_max·(2/K) = 0.88 × 500 × 2/6 = 146.67  →  150
 *
 * so ×500 now pays in full for every round where the struck harbor holds up to
 * 34.1% of the handle, and the clamp is reserved for genuinely extreme shapes.
 * `unwinnableTiers` below is the executable form of this invariant, and the
 * coordinator calls it at construction so a room config cannot bypass it.
 * The larger tail is funded by the Storm Reserve's opening capitalization and
 * its never-negative backstop (see STORM_RESERVE_* below).
 */
export const STORM_POWER_MAX_PAYOUT_MULTIPLE = 150;

/**
 * The pool shape the cap is required to pay the whole ladder at, as a multiple
 * of a harbor's uniform share (1/K). The disclosure in the client quotes the
 * resulting percentage directly, so it lives here rather than in copy.
 */
export const STORM_POWER_CAP_HEADROOM = 2;

/**
 * GLI-19 §4.4.1(f) as an assertion: every tier the artwork advertises must be
 * payable IN FULL at the reference pool shape. Called by the core test suite
 * and by the server at startup, so a rake/cap/ladder config that quietly makes
 * the headline award unwinnable cannot reach players.
 *
 * Returns the tiers that fail; empty means the ladder is honest.
 */
export function unwinnableTiers(
  rake: number,
  maxPayoutMultiple: number,
  zones: number = ZONE_COUNT,
  headroom: number = STORM_POWER_CAP_HEADROOM,
  ladder: readonly StormPowerTier[] = STORM_POWER_LADDER,
): StormPowerTier[] {
  const struckShare = headroom / zones; // P_struck / T at the reference shape
  return ladder.filter(
    (t) => (1 - rake) * (t.mNum / t.mDen) * struckShare > maxPayoutMultiple + 1e-9,
  );
}

/**
 * The struck-harbor share (as a fraction of handle) above which a given tier
 * starts to be clamped. Disclosed to players next to the tier's odds, because
 * §4.7.4 requires a limitation on an award to be explained on the theme
 * offering it. Returns null when the tier can never be clamped.
 */
export function capBindsAboveShare(
  mNum: number,
  mDen: number,
  rake: number = RAKE,
  maxPayoutMultiple: number = STORM_POWER_MAX_PAYOUT_MULTIPLE,
): number | null {
  const share = maxPayoutMultiple / ((1 - rake) * (mNum / mDen));
  return share >= 1 ? null : share;
}

/**
 * Storm Reserve solvency (G11; GLI-19 §A.4.1 operator reserves, §A.6.5(d)).
 *
 * The reserve funds the Storm Power ladder's expected overpayment E[M−1], and
 * its funding invariant makes E[outflow] ≤ E[inflow] — so over any long horizon
 * it self-sustains. What it did NOT have was a position on the SHORT horizon: a
 * big storm in the opening rounds drew against a fund that had collected almost
 * nothing, and the ledger recorded a NEGATIVE BALANCE (decisions-log #3, by
 * deliberate design, with the house silently backstopping). A regulator reviewing
 * bankroll adequacy reads an obligation fund that can run negative as a solvency
 * question, and reads a silent backstop as an undisclosed liability.
 *
 * Two changes, neither of which touches a player's payout:
 *
 *   1. OPENING CAPITALIZATION. Each room's reserve opens with a disclosed,
 *      ledgered balance sized to the worst single round the liability cap can
 *      produce at that room's guaranteed size. The fund starts solvent instead
 *      of earning its way out of a hole.
 *   2. NEVER NEGATIVE. Where a draw still exceeds the balance, the shortfall is
 *      booked as an explicit `backstopMinor` house capital injection on the
 *      ledger row — a named, reported, auditable commitment — and the balance
 *      floors at zero. The player is paid in full either way; the difference is
 *      that the house's obligation is now on the record rather than implied by
 *      a minus sign.
 *
 * Sized at the cap's worst case against the room's liquidity floor, which is the
 * table size the house itself guarantees: `C × F`. At Skiff (F = 90 credits)
 * that is 13,500 credits; at Leviathan (F = 22,500) it is 3,375,000.
 */
export const STORM_RESERVE_OPENING_MULTIPLE = STORM_POWER_MAX_PAYOUT_MULTIPLE;

export function stormReserveOpeningFor(liquidityFloorMinor: number): number {
  return STORM_RESERVE_OPENING_MULTIPLE * liquidityFloorMinor;
}

/**
 * Storm Surge — progressive jackpot (docs/03-math/mathematical-model.md §10).
 * RAKE_SPLIT.surge of the rake feeds a shared pot; on a surge round
 * (provably-fair trigger from the same round digest) the entire pot goes to ONE
 * surviving player stake, picked weighted-by-stake from the lock snapshot.
 */
export const SURGE_PROB = 1 / 25; // expected surge frequency (~every 25 rounds)

/**
 * Jackpot ceiling and diversion pool (GLI-19 §4.13.3).
 *
 * §4.13.3 requires that a jackpot which reaches a maximum "remains at that
 * amount until it is won", with further contributions credited to a DIVERSION
 * POOL that seeds the next jackpot rather than being lost — and §4.13.6 requires
 * contributions never to be lost or truncated. The pot previously had no ceiling
 * at all, which is not a violation on its own, but it left the operator with an
 * unbounded advertised figure and no defined reset value. Both are now explicit.
 *
 * The ceiling is per table, expressed in the money that table plays for, so a
 * Skiff pot cannot advertise a Leviathan number.
 */
export const SURGE_CEILING_MIN_STAKE_MULTIPLE = 5_000;

export function surgeCeilingFor(minStakeMinor: number, resetMinor: number): number {
  return Math.max(SURGE_CEILING_MIN_STAKE_MULTIPLE * minStakeMinor, resetMinor * 10);
}

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
