/**
 * LANDFALL — CERTIFICATION-GRADE ECONOMY SIMULATION
 * =================================================
 *
 * Produces the evidence pack a test laboratory and the Selected Person ask for
 * when they want to see that the shipped economy behaves as the PAR sheet says:
 * measured RTP with a confidence interval, the theoretical figure tested against
 * it, outcome-distribution tests at 99% confidence, the operator's true net
 * position, reserve solvency, and what actually happens to players.
 *
 * Related but different from `simulate.ts`, which is the FAST CI RELEASE GATE:
 * a fixed synthetic crowd, pass/fail checks, exits non-zero. This script is the
 * REPORT GENERATOR: a behavioural crowd, statistics with significance, and a
 * written report per run. Keep both — the gate catches regressions on every
 * commit; this produces the artefact you hand to a reviewer.
 *
 * ---------------------------------------------------------------------------
 * RUNNING
 *
 *   pnpm --filter @landfall/core cert-sim
 *   pnpm --filter @landfall/core cert-sim -- --rounds=5000 --players=800
 *   pnpm --filter @landfall/core cert-sim -- --seed=20260911 --runs=1
 *   pnpm --filter @landfall/core cert-sim -- --save=0          print, don't write files
 *
 * Reports land in `packages/core/sim-reports/run_N/report_1.txt`, one per run,
 * each written as soon as it is finished. Without `--seed` every report takes a
 * fresh random seed and the reports are independent; with `--seed` they run on
 * seed, seed+1, … and reproduce to the minor unit. Every report's second line is
 * the exact command that regenerates it.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAKES THIS ADMISSIBLE, AND WHAT IT STILL IS NOT
 *
 * Four properties separate this from a spreadsheet, and each is a deliberate
 * choice a reviewer will check:
 *
 *  1. IT RUNS THE SHIPPED CODE. Every outcome and every settlement comes from
 *     @landfall/core — `drawZone`, `settleRound`, `stormPowerFromRoll`,
 *     `pickGoldenAnchor`, the jackpot control software, the reserve and float
 *     controls. Nothing about the game is reimplemented here. A simulation that
 *     models the game separately validates the model, not the product.
 *
 *  2. OUTCOMES COME FROM THE PRODUCTION RNG. The struck harbour, the surge
 *     trigger, the Golden Anchor pick and the Storm Power tier are all drawn
 *     from the real SHA-256 hash chain through the real HMAC. A convenience
 *     PRNG (LCG) drives ONLY player behaviour — how much someone bets, whether
 *     they skip, when they leave — which decides nothing about an outcome. The
 *     two streams are separate objects so they cannot be confused.
 *
 *  3. EVERY NUMBER CARRIES ITS UNCERTAINTY. RTP is reported with a 99%
 *     confidence interval from a BLOCK BOOTSTRAP RESAMPLED BY ROUND, not a
 *     naive per-bet interval — because Landfall is pari-mutuel, outcomes within
 *     a round are strongly correlated (one player's win is funded by another's
 *     loss), and a per-bet interval would understate the true spread by a large
 *     factor. Distribution tests use chi-square at 99% with low-expectation
 *     cells pooled.
 *
 *  4. THE REPORT IS BOUND TO AN ARTEFACT. The header carries the rules version,
 *     a digest over the full economy configuration, the seed and the repeat
 *     command. A report that cannot name the build it describes is not evidence.
 *
 * WHAT IT IS NOT. A simulation does not certify an RNG and does not by itself
 * establish RTP for a regulator. GLI-19 certifies by source-code review plus the
 * laboratory's own statistical testing of raw RNG output (§3.2–§3.3), and the
 * Selected Person audits the live system. This is SUPPORTING EVIDENCE: it shows
 * the economy the certified code produces, and it is the thing that makes the
 * PAR sheet checkable rather than asserted. Treat it as an exhibit, not a pass.
 *
 * ---------------------------------------------------------------------------
 * WHY THE RISK MODEL LOOKS NOTHING LIKE A HOUSE-BANKED GAME
 *
 * In a house-banked game the operator is the counterparty and the interesting
 * question is the variance of its profit. Landfall is PARI-MUTUEL: settlement
 * redistributes money already staked in the same round, so on the base game the
 * house can never owe more than the round collected. Its payout liability is
 * structurally zero, and that is a genuine licensing asset worth presenting.
 *
 * The operator's real exposure is in three places, and they are what this
 * report measures:
 *   - the STORM RESERVE, which funds the Storm Power ladder's overpayment and
 *     can need a house backstop on an early or heavy tail;
 *   - the JACKPOT FLOOR RE-SEED, house money added after every payout so the
 *     next pot is not trivial — measured here, it is the single largest
 *     operator cost, larger than the rake it keeps;
 *   - the LIQUIDITY FLOAT, which funds the house seed and is ring-fenced out of
 *     revenue (G8).
 *
 * ---------------------------------------------------------------------------
 * THE PLAYER MODEL, AND THE ONE THING IT EXISTS TO SHOW
 *
 * Profiles give players a bankroll, a bet size, a skip rate, take-profit and
 * stop-loss exits, a progression (martingale or press), and a tilt-driven quit
 * chance — all drawn per player from the profile's ranges.
 *
 * The addition Landfall needs, and which a house-banked model has no analogue
 * for, is the CROWD parameter. Landfall's whole strategic layer is reading where
 * other players stand: payouts come from the struck harbour's pot, so standing
 * where the crowd is not pays relatively more. `crowd > 0` follows the crowd,
 * `crowd < 0` avoids it, `crowd = 0` picks at random. Players bet in random
 * order within the window and see the pools as they stand, so the crowd forms
 * dynamically rather than being imposed.
 *
 * That exists to demonstrate, rather than assert, the claim in math-model §4
 * and the disclosure required by GLI-19 §4.6.1(a): crowd-reading skill
 * REDISTRIBUTES EXPECTED VALUE BETWEEN PLAYERS AND NEVER MOVES IT AWAY FROM THE
 * HOUSE. The report prints RTP per profile next to the operator's take, and the
 * take must not move.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIN_STAKE_MINOR,
  RAKE,
  RAKE_SPLIT,
  RULES_VERSION,
  SPLIT_PRIMARY_PERCENT,
  STORM_POWER_LADDER,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  SURGE_PROB,
  WHALE_CAP_FRACTION,
  ZONE_COUNT,
  applyFloatRound,
  applyReserveRound,
  contributeToSurge,
  drawZone,
  houseFloatOpeningFor,
  houseSeedPerZone,
  openFloat,
  payOutSurge,
  pickGoldenAnchor,
  rollOverSurge,
  settleRound,
  stormPowerFromRoll,
  stormReserveOpeningFor,
  surgeCeilingFor,
  surgeFloorFor,
  surgeResetFor,
  affordableResetMinor,
  SURGE_RESET_BUDGET_FRACTION,
  theoreticalRtp,
  updateHandleEma,
  type StakeEntry,
} from '../src/index.js';

// ══════════════════════════ 1. CONFIGURATION ══════════════════════════

/**
 * Room tiers, mirroring `packages/server/config/rooms.json`. The simulation runs
 * ONE tier at a time because the jackpot pot, the reserve and the float are all
 * per-room — mixing tiers in one economy would report a number that describes no
 * actual table.
 */
const TIERS = {
  skiff: { name: 'Skiff Harbor', minStake: 1_00, maxStake: 50_00, seed: 25_00, floor: 90_00, minSeed: 1_00 },
  schooner: { name: 'Schooner Bay', minStake: 5_00, maxStake: 500_00, seed: 50_00, floor: 180_00, minSeed: 5_00 },
  flagship: { name: 'Flagship Sound', minStake: 50_00, maxStake: 5_000_00, seed: 250_00, floor: 900_00, minSeed: 50_00 },
  galleon: { name: 'Galleon Roads', minStake: 500_00, maxStake: 50_000_00, seed: 1_250_00, floor: 4_500_00, minSeed: 500_00 },
  leviathan: { name: 'Leviathan Deep', minStake: 5_000_00, maxStake: 500_000_00, seed: 6_250_00, floor: 22_500_00, minSeed: 5_000_00 },
} as const;

type TierName = keyof typeof TIERS;

const CONFIG = {
  tier: 'skiff' as TierName,
  players: 500,
  rounds: 2_000,
  /** Fraction of the season over which players arrive. 0 = everyone in round 1. */
  arrivalWindow: 0.4,
  /** null = a fresh random seed per report; a number = seed, seed+1, … */
  seed: null as number | null,
  runs: 3,
  /** Independent seasons in the RISK block. null = chosen from the workload. */
  seasons: null as number | null,
  /** Rounds printed in the round-by-round trace. */
  tracePrint: 12,
  /** Bootstrap resamples for the RTP confidence interval. */
  bootstrap: 2_000,
  saveReport: true,
};

/**
 * Player profiles.
 *
 *   share       relative population weight (normalised)
 *   bankroll    [min, max] starting balance, drawn LOG-uniformly so small
 *               players are many and large ones are rare
 *   unit        [min, max] base bet as a fraction of the starting bankroll
 *   skip        chance of sitting a round out
 *   crowd       harbour selection bias. >0 follows the crowd, <0 avoids it,
 *               0 is uniform. This is the strategic layer — see the header
 *   split       chance of using a Split order (70/30 across two harbours)
 *   onWin/onLoss  bet multiplier after a won/lost round (0 = reset to base)
 *   levelCap    how far the bet may escalate above base
 *   takeProfit  [min, max] leaves when up this fraction of the bankroll
 *   stopLoss    [min, max] leaves when down this fraction (1.0 = plays to zero)
 *   quit        flat chance of leaving after any round
 *   tilt        added to that chance per consecutive loss
 */
interface Profile {
  id: string;
  label: string;
  share: number;
  bankroll: [number, number];
  unit: [number, number];
  skip: number;
  crowd: number;
  split: number;
  onWin: number;
  onLoss: number;
  levelCap: number;
  takeProfit: [number, number];
  stopLoss: [number, number];
  quit: number;
  tilt: number;
}

const PROFILES: Profile[] = [
  {
    id: 'NEWCOMER', label: 'Newcomer', share: 34, bankroll: [20_00, 300_00], unit: [0.02, 0.06],
    skip: 0.15, crowd: 0.6, split: 0.05, onWin: 1, onLoss: 1, levelCap: 1,
    takeProfit: [0.5, 1.5], stopLoss: [0.6, 1.0], quit: 0.05, tilt: 0.02,
  },
  {
    id: 'REGULAR', label: 'Regular', share: 26, bankroll: [200_00, 3_000_00], unit: [0.01, 0.03],
    skip: 0.10, crowd: -0.2, split: 0.20, onWin: 1, onLoss: 1, levelCap: 1,
    takeProfit: [0.5, 1.0], stopLoss: [0.4, 0.7], quit: 0.02, tilt: 0.01,
  },
  {
    id: 'CAUTIOUS', label: 'Cautious', share: 12, bankroll: [100_00, 1_500_00], unit: [0.005, 0.02],
    skip: 0.25, crowd: 0, split: 0.30, onWin: 1, onLoss: 1, levelCap: 1,
    takeProfit: [0.15, 0.4], stopLoss: [0.2, 0.4], quit: 0.03, tilt: 0.01,
  },
  {
    id: 'CHASER', label: 'Chaser', share: 12, bankroll: [50_00, 600_00], unit: [0.02, 0.05],
    skip: 0.05, crowd: 0.9, split: 0.05, onWin: 0, onLoss: 2, levelCap: 32,
    takeProfit: [0.5, 1.5], stopLoss: [1.0, 1.0], quit: 0.01, tilt: 0,
  },
  {
    /** The "skilled" player: deliberately stands away from the crowd. */
    id: 'CONTRARIAN', label: 'Contrarian', share: 9, bankroll: [150_00, 2_000_00], unit: [0.02, 0.05],
    skip: 0.10, crowd: -1.4, split: 0.25, onWin: 1, onLoss: 1, levelCap: 1,
    takeProfit: [0.6, 2.0], stopLoss: [0.5, 0.9], quit: 0.02, tilt: 0.01,
  },
  {
    id: 'WHALE', label: 'High roller', share: 2, bankroll: [5_000_00, 120_000_00], unit: [0.01, 0.04],
    skip: 0.15, crowd: -0.5, split: 0.15, onWin: 1.5, onLoss: 0, levelCap: 3,
    takeProfit: [0.25, 1.0], stopLoss: [0.3, 0.6], quit: 0.03, tilt: 0.02,
  },
];

// ── command line ──
const ARG_MAP: Record<string, keyof typeof CONFIG> = {
  players: 'players', rounds: 'rounds', seasons: 'seasons', runs: 'runs', seed: 'seed',
  arrival: 'arrivalWindow', trace: 'tracePrint', boot: 'bootstrap', save: 'saveReport',
};
for (const arg of process.argv.slice(2)) {
  // `pnpm run <script> -- --k=v` forwards a bare `--`; the documented invocation
  // in this file's header uses exactly that form, so it has to be accepted.
  if (arg === '--') continue;
  const m = /^--([a-z]+)=(.+)$/.exec(arg);
  if (!m) throw new Error(`could not parse "${arg}"; expected --key=value`);
  if (m[1] === 'tier') {
    if (!(m[2]! in TIERS)) throw new Error(`unknown tier "${m[2]}"; one of ${Object.keys(TIERS).join(', ')}`);
    CONFIG.tier = m[2] as TierName;
    continue;
  }
  const key = ARG_MAP[m[1]!];
  if (!key) {
    throw new Error(`unknown parameter --${m[1]}; available: tier, ${Object.keys(ARG_MAP).join(', ')}`);
  }
  const value = Number(m[2]);
  if (Number.isNaN(value)) throw new Error(`--${m[1]}: "${m[2]}" is not a number`);
  (CONFIG as Record<string, unknown>)[key] = value;
}

const TIER = TIERS[CONFIG.tier];
/**
 * The reset value is ADAPTIVE (rules v3): it follows the table's handle, because
 * that is the quantity the house re-seed has to be paid out of. The simulation
 * therefore recomputes it per round from the same settled-handle EMA the game
 * uses, and `SURGE_RESET_MIN` is only the lower bound.
 */
const SURGE_RESET_MIN = surgeFloorFor(TIER.minStake);
const SURGE_CEILING = surgeCeilingFor(TIER.minStake);
const resetPolicy = (handlePerRoundMinor: number) => ({
  handlePerRoundMinor: Math.max(handlePerRoundMinor, TIER.floor),
  rake: RAKE,
  houseShare: RAKE_SPLIT.house,
  zones: ZONE_COUNT,
  surgeProb: SURGE_PROB,
  minimumMinor: SURGE_RESET_MIN,
});
const LIQUIDITY = { floorMinor: TIER.floor, minSeedMinor: TIER.minSeed, maxSeedMinor: TIER.seed };

// ══════════════════════════ 2. PROVENANCE ══════════════════════════

/**
 * A digest over everything that decides the economy. Two reports with the same
 * digest describe the same game; two with different digests do not, however
 * similar the numbers look. This is the same principle as the control-program
 * self-verification in the server (G17, GLI-19 §2.3.2) applied to a report.
 */
function configDigest(): string {
  const material = JSON.stringify({
    rulesVersion: RULES_VERSION,
    zones: ZONE_COUNT,
    rake: RAKE,
    rakeSplit: RAKE_SPLIT,
    maxPayoutMultiple: STORM_POWER_MAX_PAYOUT_MULTIPLE,
    whaleCap: WHALE_CAP_FRACTION,
    surgeProb: SURGE_PROB,
    ladder: STORM_POWER_LADDER,
    tier: { ...TIER, surgeResetMin: SURGE_RESET_MIN, surgeResetBudget: SURGE_RESET_BUDGET_FRACTION, surgeCeiling: SURGE_CEILING },
  });
  return bytesToHex(sha256(new TextEncoder().encode(material)));
}

// ══════════════════════════ 3. STATISTICS ══════════════════════════

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Upper-tail chi-square critical values at 99%, df 1..20. */
const CHI2_99: Record<number, number> = {
  1: 6.635, 2: 9.210, 3: 11.345, 4: 13.277, 5: 15.086, 6: 16.812, 7: 18.475,
  8: 20.090, 9: 21.666, 10: 23.209, 11: 24.725, 12: 26.217, 13: 27.688,
  14: 29.141, 15: 30.578, 16: 32.000, 17: 33.409, 18: 34.805, 19: 36.191, 20: 37.566,
};

export interface ChiSquareResult {
  chi2: number;
  df: number;
  critical: number;
  pass: boolean;
  pooled: number;
}

/**
 * Chi-square goodness of fit, with cells whose EXPECTED count falls below 5
 * pooled into a single residual cell. Pooling is not a convenience: the
 * chi-square approximation is invalid on sparse cells, and the Storm Power
 * ladder has tiers expected once in a million rounds. Reporting an unpooled
 * statistic over those cells would be a number with no distribution behind it.
 */
function chiSquare(observed: number[], probabilities: number[]): ChiSquareResult {
  const n = sum(observed);
  const keep: number[] = [];
  let pooledObs = 0;
  let pooledExp = 0;
  let pooled = 0;
  for (let i = 0; i < observed.length; i++) {
    const exp = n * probabilities[i]!;
    if (exp >= 5) keep.push(i);
    else {
      pooledObs += observed[i]!;
      pooledExp += exp;
      pooled++;
    }
  }
  let chi2 = 0;
  for (const i of keep) {
    const exp = n * probabilities[i]!;
    chi2 += ((observed[i]! - exp) ** 2) / exp;
  }
  if (pooled > 0 && pooledExp > 0) chi2 += ((pooledObs - pooledExp) ** 2) / pooledExp;
  const cells = keep.length + (pooled > 0 ? 1 : 0);
  const df = Math.max(1, cells - 1);
  const critical = CHI2_99[df] ?? CHI2_99[20]!;
  return { chi2, df, critical, pass: chi2 <= critical, pooled };
}

/**
 * BLOCK BOOTSTRAP over rounds for a ratio estimator.
 *
 * RTP is `Σ returned / Σ staked`, and in a pari-mutuel game the terms inside a
 * round are strongly dependent — one player's salvage is funded by another
 * player's lost stake, so returns within a round move together. Resampling
 * individual BETS would treat them as independent and report an interval far
 * narrower than the truth. Resampling whole ROUNDS keeps the within-round
 * dependence intact, which is the standard remedy for exactly this structure.
 */
function bootstrapRatioCI(
  numerators: Float64Array,
  denominators: Float64Array,
  resamples: number,
  rng: () => number,
): { lo: number; hi: number; point: number } {
  const n = numerators.length;
  const point = sum(Array.from(numerators)) / sum(Array.from(denominators));
  const estimates = new Float64Array(resamples);
  for (let b = 0; b < resamples; b++) {
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rng() * n);
      num += numerators[j]!;
      den += denominators[j]!;
    }
    estimates[b] = den === 0 ? 0 : num / den;
  }
  const sorted = Array.from(estimates).sort((a, b) => a - b);
  return {
    point,
    lo: sorted[Math.floor(0.005 * resamples)]!,
    hi: sorted[Math.min(resamples - 1, Math.floor(0.995 * resamples))]!,
  };
}

// ══════════════════════════ 4. RANDOMNESS ══════════════════════════

/**
 * BEHAVIOURAL randomness only — how much a player bets, whether they skip, when
 * they leave. It decides NOTHING about an outcome. Outcomes come from the
 * production hash chain below. The two are separate objects, and named so, to
 * make it impossible to read this simulation as testing a non-crypto PRNG.
 */
function behaviourRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * OUTCOME randomness — the production scheme. A season's seeds are consumed in
 * order from a SHA-256 chain exactly as `chain.ts` consumes them; walking the
 * chain forward from a fixed point is statistically identical to walking a
 * committed season chain backward, and is O(1) per round instead of O(chain).
 * The draw itself is the production `drawZone`, so the RNG under test here is
 * the one that ships.
 */
function outcomeChain(seed: number): () => string {
  let bytes = sha256(new TextEncoder().encode(`landfall-cert-sim:${seed >>> 0}`));
  return () => {
    bytes = sha256(bytes);
    return bytesToHex(bytes);
  };
}

// ══════════════════════════ 5. PLAYERS ══════════════════════════

const between = (rng: () => number, [lo, hi]: [number, number]): number => lo + rng() * (hi - lo);
const logBetween = (rng: () => number, [lo, hi]: [number, number]): number =>
  lo * Math.pow(hi / lo, rng());

type ExitState = 'wait' | 'play' | 'tp' | 'sl' | 'bust' | 'quit';

interface Player {
  name: string;
  profile: Profile;
  startMinor: number;
  balanceMinor: number;
  unitMinor: number;
  takeProfit: number;
  stopLoss: number;
  arrive: number;
  state: ExitState;
  level: number;
  lossStreak: number;
  stakedMinor: number;
  returnedMinor: number;
  rounds: number;
  exitRound: number | null;
}

/**
 * Profiles are written in Skiff money and SCALED TO THE TIER, so that a
 * "Newcomer" means the same thing on every table: a bankroll worth the same
 * number of minimum bets. Without this, running the Leviathan tier would seat a
 * crowd that cannot afford a single bet and report an economy of nobody playing.
 */
function prepareProfiles(): (Profile & { p: number })[] {
  const total = sum(PROFILES.map((p) => p.share));
  const scale = TIER.minStake / TIERS.skiff.minStake;
  return PROFILES.map((p) => ({
    ...p,
    p: p.share / total,
    bankroll: [p.bankroll[0] * scale, p.bankroll[1] * scale] as [number, number],
  }));
}

function pickWeighted<T>(items: T[], weightOf: (t: T) => number, u: number): T {
  let target = u * sum(items.map(weightOf));
  for (const it of items) {
    target -= weightOf(it);
    if (target < 0) return it;
  }
  return items[items.length - 1]!;
}

/** Bets are placed in whole credits — nobody stakes 3.47. */
function roundToCredit(minor: number): number {
  return Math.floor(minor / 100) * 100;
}

function makePlayers(profiles: (Profile & { p: number })[], rng: () => number): Player[] {
  const window = Math.max(0, Math.min(1, CONFIG.arrivalWindow));
  return Array.from({ length: CONFIG.players }, (_, n) => {
    const pr = pickWeighted(profiles, (p) => p.p, rng());
    const start = Math.max(TIER.minStake, Math.round(logBetween(rng, pr.bankroll)));
    return {
      name: `player_${String(n + 1).padStart(4, '0')}`,
      profile: pr,
      startMinor: start,
      balanceMinor: start,
      unitMinor: Math.max(TIER.minStake, start * between(rng, pr.unit)),
      takeProfit: between(rng, pr.takeProfit),
      stopLoss: between(rng, pr.stopLoss),
      arrive: Math.floor(rng() * CONFIG.rounds * window),
      state: 'wait',
      level: 1,
      lossStreak: 0,
      stakedMinor: 0,
      returnedMinor: 0,
      rounds: 0,
      exitRound: null,
    };
  });
}

/**
 * Harbour choice — the strategic layer.
 *
 * A player weights each harbour by `(pool + floor)^crowd` against the pools AS
 * THEY STAND when they act. `crowd > 0` piles into the busy harbours,
 * `crowd < 0` seeks the quiet ones, `crowd = 0` is uniform. Because players act
 * in random order, the crowd is an emergent result of their choices rather than
 * an imposed shape — which is what makes the per-profile RTP comparison in the
 * report meaningful.
 */
function chooseHarbour(pools: number[], crowd: number, u: number): number {
  if (crowd === 0) return Math.floor(u * ZONE_COUNT);
  const floor = Math.max(1, TIER.minStake);
  const weights = pools.map((p) => Math.pow(p + floor, crowd));
  const total = sum(weights);
  let target = u * total;
  for (let z = 0; z < ZONE_COUNT; z++) {
    target -= weights[z]!;
    if (target < 0) return z;
  }
  return ZONE_COUNT - 1;
}

// ══════════════════════════ 6. THE SEASON ══════════════════════════

interface RoundTrace {
  round: number;
  struck: number;
  tier: string;
  multiplier: number;
  handleMinor: number;
  payoutMinor: number;
  atTable: number;
  surge: boolean;
  capped: boolean;
}

interface SeasonStats {
  rounds: number;
  handleMinor: number;
  playerHandleMinor: number;
  seedHandleMinor: number;
  playerReturnedMinor: number;
  seedReturnedMinor: number;
  rakeMinor: number;
  houseShareMinor: number;
  surgeContribMinor: number;
  reserveContribMinor: number;
  reserveOutMinor: number;
  reserveBackstopMinor: number;
  reserveMinBalanceMinor: number;
  reserveFinalMinor: number;
  floatBalanceMinor: number;
  floatTopUpMinor: number;
  floatPLMinor: number;
  jackpotPaidMinor: number;
  jackpotReseedMinor: number;
  jackpotRollovers: number;
  jackpotWins: number;
  diversionMinor: number;
  ceilingHits: number;
  cappedRounds: number;
  conservationViolations: number;
  zoneCounts: number[];
  tierCounts: number[];
  surgeRounds: number;
  bets: number;
  skips: number;
  /** Per-round player stake and return, for the block bootstrap. */
  roundStaked: Float64Array;
  roundReturned: Float64Array;
  trace: RoundTrace[];
  tableCurve: number[];
  players: Player[];
  worstRoundForHouseMinor: number;
  operatorNetMinor: number;
}

function runSeason(
  profiles: (Profile & { p: number })[],
  seed: number,
  collect: boolean,
): SeasonStats {
  const nextSeed = outcomeChain(seed);
  const rng = behaviourRng((seed ^ 0x5bd1e995) >>> 0);
  const players = makePlayers(profiles, rng);

  let handleEma: number | null = null;
  let potState = { potMinor: SURGE_RESET_MIN, diversionMinor: 0 };
  let reserveState = {
    balanceMinor: stormReserveOpeningFor(TIER.floor),
    backstopTotalMinor: 0,
  };
  let floatState = openFloat(houseFloatOpeningFor(TIER.seed, ZONE_COUNT, TIER.floor));
  // Recomputed at the top of every round from the settled-handle EMA, exactly as
  // the coordinator's `surgePolicy` getter does. Declared without an initialiser
  // because the first assignment always precedes the first read.
  let surgePolicy: { resetMinor: number; ceilingMinor: number };

  const s: SeasonStats = {
    rounds: 0, handleMinor: 0, playerHandleMinor: 0, seedHandleMinor: 0,
    playerReturnedMinor: 0, seedReturnedMinor: 0, rakeMinor: 0, houseShareMinor: 0,
    surgeContribMinor: 0, reserveContribMinor: 0, reserveOutMinor: 0,
    reserveBackstopMinor: 0, reserveMinBalanceMinor: reserveState.balanceMinor,
    reserveFinalMinor: 0, floatBalanceMinor: 0, floatTopUpMinor: 0, floatPLMinor: 0,
    jackpotPaidMinor: 0, jackpotReseedMinor: 0, jackpotRollovers: 0, jackpotWins: 0,
    diversionMinor: 0, ceilingHits: 0, cappedRounds: 0, conservationViolations: 0,
    zoneCounts: Array(ZONE_COUNT).fill(0), tierCounts: Array(STORM_POWER_LADDER.length).fill(0),
    surgeRounds: 0, bets: 0, skips: 0,
    roundStaked: new Float64Array(CONFIG.rounds), roundReturned: new Float64Array(CONFIG.rounds),
    trace: [], tableCurve: [], players,
    worstRoundForHouseMinor: 0, operatorNetMinor: 0,
  };

  for (let r = 0; r < CONFIG.rounds; r++) {
    const seedPerZone = houseSeedPerZone(LIQUIDITY, handleEma ?? 0, ZONE_COUNT);
    surgePolicy = {
      resetMinor: surgeResetFor(resetPolicy(handleEma ?? 0)),
      ceilingMinor: SURGE_CEILING,
    };
    const stakes: StakeEntry[] = [];
    const pools = Array<number>(ZONE_COUNT).fill(0);
    for (let z = 0; z < ZONE_COUNT; z++) {
      stakes.push({ id: `house-${r}-${z}`, zone: z, amountMinor: seedPerZone, isHouseSeed: true });
      pools[z] = seedPerZone;
    }

    // Players act in a shuffled order, so nobody permanently sees an empty table.
    const order = players.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }

    const staked = new Map<Player, number>();
    let waiting = 0;
    let active = 0;

    for (const idx of order) {
      const pl = players[idx]!;
      if (pl.state === 'wait') {
        if (pl.arrive > r) { waiting++; continue; }
        pl.state = 'play';
      }
      if (pl.state !== 'play') continue;
      if (pl.balanceMinor < TIER.minStake) { pl.state = 'bust'; pl.exitRound = r + 1; continue; }
      active++;
      if (rng() < pl.profile.skip) { s.skips++; continue; }

      // Bet size: base × progression, rounded to whole credits, clamped by the
      // table range, the balance, and the production whale cap.
      const liveHandle = Math.max(sum(pools), TIER.floor);
      const whaleCap = Math.floor((WHALE_CAP_FRACTION * liveHandle) / (1 - WHALE_CAP_FRACTION));
      let want = roundToCredit(pl.unitMinor * pl.level);
      want = Math.min(want, TIER.maxStake, pl.balanceMinor, whaleCap, MIN_STAKE_MINOR * 500_000);
      if (want < TIER.minStake) want = TIER.minStake;
      if (want > pl.balanceMinor || want > whaleCap) { s.skips++; continue; }

      const split = rng() < pl.profile.split;
      const primary = chooseHarbour(pools, pl.profile.crowd, rng());
      if (split) {
        let secondary = chooseHarbour(pools, pl.profile.crowd, rng());
        if (secondary === primary) secondary = (primary + 1 + Math.floor(rng() * (ZONE_COUNT - 1))) % ZONE_COUNT;
        const a = Math.floor((want * SPLIT_PRIMARY_PERCENT) / 100);
        const b = want - a;
        stakes.push({ id: `p-${r}-${idx}-a`, zone: primary, amountMinor: a, isHouseSeed: false });
        stakes.push({ id: `p-${r}-${idx}-b`, zone: secondary, amountMinor: b, isHouseSeed: false });
        pools[primary]! += a;
        pools[secondary]! += b;
      } else {
        stakes.push({ id: `p-${r}-${idx}`, zone: primary, amountMinor: want, isHouseSeed: false });
        pools[primary]! += want;
      }
      pl.balanceMinor -= want;
      staked.set(pl, want);
      s.bets++;
    }

    // ── the draw: production RNG, production settlement ──
    const seedHex = nextSeed();
    const draw = drawZone(seedHex, r + 1, ZONE_COUNT);
    const power = stormPowerFromRoll(draw.stormPowerRoll);
    const handleMinor = stakes.reduce((a, e) => a + e.amountMinor, 0);
    const surgeRound = draw.uSurge < SURGE_PROB;

    let settlement;
    try {
      settlement = settleRound(
        stakes,
        draw.struckZone,
        RAKE,
        { mNum: power.mNum, mDen: power.mDen },
        STORM_POWER_MAX_PAYOUT_MULTIPLE * handleMinor,
      );
    } catch {
      // The production conservation assert fired. In the game this voids the
      // round (G27); here it is counted, because a single occurrence is a
      // certification-stopping defect and must not be averaged away.
      s.conservationViolations++;
      continue;
    }

    // ── the money, through the production control modules ──
    const surgeContrib = Math.floor(settlement.rakeMinor * RAKE_SPLIT.surge);
    const reserveContrib = Math.floor(settlement.rakeMinor * RAKE_SPLIT.stormReserve);
    const houseShare = settlement.rakeMinor - surgeContrib - reserveContrib;
    const reserveOut = Math.max(0, settlement.houseDeltaMinor);

    const reserve = applyReserveRound(reserveState, reserveContrib, reserveOut);
    reserveState = reserve.state;
    s.reserveBackstopMinor += reserve.backstopMinor;
    s.reserveMinBalanceMinor = Math.min(s.reserveMinBalanceMinor, reserveState.balanceMinor);

    const seedStaked = stakes.reduce((a, e) => a + (e.isHouseSeed ? e.amountMinor : 0), 0);
    const seedReturned = settlement.lines.reduce((a, l) => a + (l.isHouseSeed ? l.payoutMinor : 0), 0);
    const floatRound = applyFloatRound(floatState, seedStaked, seedReturned);
    floatState = floatRound.state;
    s.floatTopUpMinor += floatRound.topUpMinor;

    const contribution = contributeToSurge(potState, surgeContrib, surgePolicy);
    potState = contribution.state;
    if (contribution.toDiversionMinor > 0) s.ceilingHits++;

    // ── credit the players ──
    let roundPlayerReturned = 0;
    const byOwner = new Map<number, number>();
    for (const line of settlement.lines) {
      if (line.isHouseSeed) continue;
      const m = /^p-\d+-(\d+)/.exec(line.id);
      if (!m) continue;
      const idx = Number(m[1]);
      byOwner.set(idx, (byOwner.get(idx) ?? 0) + line.payoutMinor);
    }

    if (surgeRound) {
      s.surgeRounds++;
      const winner = pickGoldenAnchor(stakes, draw.struckZone, draw.uWinner);
      if (winner) {
        const payout = payOutSurge(potState, surgePolicy);
        potState = payout.state;
        s.jackpotPaidMinor += payout.paidMinor;
        s.jackpotReseedMinor += payout.fromHouseMinor;
        s.jackpotWins++;
        const m = /^p-\d+-(\d+)/.exec(winner.id);
        if (m) {
          const winnerIdx = Number(m[1]);
          byOwner.set(winnerIdx, (byOwner.get(winnerIdx) ?? 0) + payout.paidMinor);
        }
      } else {
        potState = rollOverSurge(potState);
        s.jackpotRollovers++;
      }
    }

    for (const [idx, returned] of byOwner) {
      const pl = players[idx]!;
      pl.balanceMinor += returned;
      roundPlayerReturned += returned;
    }

    // ── per-player bookkeeping and exits ──
    for (const [pl, stake] of staked) {
      const idx = players.indexOf(pl);
      const returned = byOwner.get(idx) ?? 0;
      pl.stakedMinor += stake;
      pl.returnedMinor += returned;
      pl.rounds++;
      const won = returned > stake;
      const factor = won ? pl.profile.onWin : pl.profile.onLoss;
      pl.lossStreak = won ? 0 : pl.lossStreak + 1;
      pl.level = factor === 0 ? 1 : Math.min(pl.profile.levelCap, Math.max(1, pl.level * factor));

      let exit: ExitState | null = null;
      if (pl.balanceMinor < TIER.minStake) exit = 'bust';
      else if (pl.balanceMinor >= pl.startMinor * (1 + pl.takeProfit)) exit = 'tp';
      else if (pl.balanceMinor <= pl.startMinor * (1 - pl.stopLoss)) exit = 'sl';
      else if (rng() < pl.profile.quit + pl.profile.tilt * pl.lossStreak) exit = 'quit';
      if (exit) { pl.state = exit; pl.exitRound = r + 1; }
    }

    // ── aggregate ──
    const roundPlayerStaked = sum([...staked.values()]);
    s.roundStaked[r] = roundPlayerStaked;
    s.roundReturned[r] = roundPlayerReturned;
    s.handleMinor += handleMinor;
    s.playerHandleMinor += roundPlayerStaked;
    s.seedHandleMinor += seedStaked;
    s.playerReturnedMinor += roundPlayerReturned;
    s.seedReturnedMinor += seedReturned;
    s.rakeMinor += settlement.rakeMinor;
    s.houseShareMinor += houseShare;
    s.surgeContribMinor += surgeContrib;
    s.reserveContribMinor += reserveContrib;
    s.reserveOutMinor += reserveOut;
    s.zoneCounts[draw.struckZone]! += 1;
    s.tierCounts[STORM_POWER_LADDER.indexOf(power)]! += 1;
    if (settlement.powerCapped) s.cappedRounds++;
    s.rounds++;

    const houseDelta = houseShare - floatRound.topUpMinor - reserve.backstopMinor;
    s.worstRoundForHouseMinor = Math.min(s.worstRoundForHouseMinor, houseDelta);

    handleEma = updateHandleEma(handleEma, roundPlayerStaked);

    if (collect) {
      s.tableCurve.push(staked.size);
      if (r < CONFIG.tracePrint) {
        s.trace.push({
          round: r + 1, struck: draw.struckZone, tier: power.label,
          multiplier: power.mNum / power.mDen, handleMinor,
          payoutMinor: settlement.lines.reduce((a, l) => a + l.payoutMinor, 0),
          atTable: staked.size, surge: surgeRound, capped: settlement.powerCapped,
        });
      }
    }
    if (active === 0 && waiting === 0) break;
  }

  s.reserveFinalMinor = reserveState.balanceMinor;
  s.floatBalanceMinor = floatState.balanceMinor;
  s.floatPLMinor = s.seedReturnedMinor - s.seedHandleMinor;
  s.diversionMinor = potState.diversionMinor;
  s.operatorNetMinor = s.houseShareMinor - s.jackpotReseedMinor - s.reserveBackstopMinor - s.floatTopUpMinor;
  return s;
}


// ══════════════════════════ 7. THE REPORT ══════════════════════════

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT_ROOT = join(HERE, '..', 'sim-reports');

const cr = (minor: number): string =>
  (minor < 0 ? '-' : '') +
  (Math.abs(minor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cr0 = (minor: number): string =>
  (minor < 0 ? '-' : '') + Math.round(Math.abs(minor) / 100).toLocaleString('en-US');
const pct = (x: number, d = 4): string => (x * 100).toFixed(d) + '%';
const pct1 = (x: number): string => (x * 100).toFixed(1) + '%';
const bar = (n: number, max: number, w = 24): string =>
  '#'.repeat(Math.max(0, Math.min(w, Math.round((n / max) * w)))).padEnd(w, '.');

const lines: string[] = [];
const log = (line = ''): void => { lines.push(line); };

function nextRunDir(): string {
  mkdirSync(REPORT_ROOT, { recursive: true });
  const taken = readdirSync(REPORT_ROOT)
    .map((f) => /^run_(\d+)$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  let n = taken.length ? Math.max(...taken) + 1 : 1;
  for (;;) {
    const dir = join(REPORT_ROOT, `run_${n}`);
    try {
      mkdirSync(dir);
      return dir;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      n++;
    }
  }
}

const EXIT_LABEL: Record<ExitState, string> = {
  tp: 'took profit', sl: 'stop-loss', bust: 'went broke',
  quit: 'lost interest', play: 'still at the table', wait: 'never arrived',
};

function progressionLabel(pr: Profile): string {
  const parts: string[] = [];
  if (pr.onLoss > 1) parts.push(`x${pr.onLoss} after a loss`);
  if (pr.onWin > 1) parts.push(`x${pr.onWin} after a win`);
  return parts.length ? `${parts.join(', ')}, to x${pr.levelCap}` : 'flat';
}

function crowdLabel(c: number): string {
  if (c > 0.5) return 'follows the crowd';
  if (c > 0.05) return 'mildly follows';
  if (c < -0.5) return 'avoids the crowd';
  if (c < -0.05) return 'mildly avoids';
  return 'random';
}

interface RunResult {
  operatorNetMinor: number;
  handleMinor: number;
  playerRtp: number;
  meanSeasonNetMinor: number;
  losingSeasons: number;
  seasons: number;
  allTestsPass: boolean;
}

function report(seed: number, run: number, runs: number): RunResult {
  const profiles = prepareProfiles();
  const theory = theoreticalRtp();
  const digest = configDigest();

  log(`LANDFALL — certification economy simulation   (report ${run} of ${runs})`);
  const repeatArgs = [
    ...process.argv.slice(2).filter((a) => !/^--(seed|runs)=/.test(a)),
    '--runs=1', `--seed=${seed}`,
  ];
  log(`Generated ${new Date().toISOString()}`);
  log(`Reproduce exactly:  pnpm --filter @landfall/core cert-sim -- ${repeatArgs.join(' ')}`);
  const headlineAt = lines.length;

  log('');
  log('==========================================================================');
  log('  PROVENANCE — what this report describes');
  log('==========================================================================');
  log(`Rules version           v${RULES_VERSION}`);
  log(`Economy config digest   ${digest}`);
  log(`Behaviour seed          ${seed}`);
  log(`Table                   ${TIER.name} (${cr0(TIER.minStake)}–${cr0(TIER.maxStake)} credits per round)`);
  log(`Zones / rake / cap      ${ZONE_COUNT} harbours · rake ${pct(RAKE, 2)} of the struck pool · payout cap ${STORM_POWER_MAX_PAYOUT_MULTIPLE}x handle`);
  log(`Rake split              house ${RAKE_SPLIT.house} / surge ${RAKE_SPLIT.surge} / reserve ${RAKE_SPLIT.stormReserve}`);
  log(`Jackpot                 reset adaptive (min ${cr0(SURGE_RESET_MIN)}) · ceiling ${cr0(SURGE_CEILING)} · ~1 round in ${Math.round(1 / SURGE_PROB)}`);
  log('');
  log('Outcomes are drawn by the PRODUCTION RNG (SHA-256 chain + HMAC) and settled');
  log('by the PRODUCTION settlement. Only player behaviour uses a convenience PRNG.');
  log('A digest mismatch against another report means a different game, however');
  log('similar the numbers look.');

  log('');
  log('--- THEORETICAL MODEL ----------------------------------------------------');
  log('Flow                                    Formula                  Value');
  log('--------------------------------------------------------------------------');
  log(`Base pari-mutuel return                 1 - r/K               ${pct(theory.baseReturn).padStart(9)}`);
  log(`Storm Surge (jackpot)                   split.surge*r/K       ${pct(theory.surgeReturn).padStart(9)}`);
  log(`Storm Power (ladder)                    E[M-1]*(1-r)/K        ${pct(theory.stormPowerReturn).padStart(9)}`);
  log('--------------------------------------------------------------------------');
  log(`THEORETICAL RTP                                               ${pct(theory.totalRtp).padStart(9)}`);
  log(`Operator theoretical hold                                     ${pct(theory.operatorHold).padStart(9)}`);
  log('');
  log('Note: the theoretical figure counts the three RAKE-FUNDED flows only. It does');
  log('not count the house jackpot floor re-seed, which is additional operator money');
  log('returning to players, so measured return runs ABOVE theory. See CASH DESK.');

  log('');
  log('--- STORM POWER LADDER (as disclosed to players) -------------------------');
  log('Tier             Multiplier   Actual odds        Exact probability');
  log('--------------------------------------------------------------------------');
  {
    const space = STORM_POWER_LADDER[STORM_POWER_LADDER.length - 1]!.cumBound;
    let prev = 0;
    for (const t of STORM_POWER_LADDER) {
      const count = t.cumBound - prev;
      prev = t.cumBound;
      const p = count / space;
      const m = t.mNum / t.mDen;
      log(`${t.label.padEnd(16)} ${('x' + m).padStart(10)}   ${('1 in ' + Math.round(1 / p).toLocaleString('en-US')).padStart(16)}   ${p.toExponential(3).padStart(12)}`);
    }
  }

  log('');
  log('--- PLAYER PROFILES (as configured) --------------------------------------');
  log('Profile      Share  Bankroll            Bet%   Skip  Harbour choice       Progression');
  for (const pr of profiles) {
    log(
      `${pr.label.padEnd(12)} ${pct1(pr.p).padStart(5)}  ` +
      `${(cr0(pr.bankroll[0]) + '-' + cr0(pr.bankroll[1])).padEnd(18)} ` +
      `${((pr.unit[0] * 100).toFixed(1) + '-' + (pr.unit[1] * 100).toFixed(1)).padStart(5)}  ` +
      `${pct1(pr.skip).padStart(5)}  ${crowdLabel(pr.crowd).padEnd(20)} ${progressionLabel(pr)}`,
    );
  }

  const s = runSeason(profiles, seed, true);

  log('');
  log(`--- ROUND TRACE (first ${s.trace.length} rounds) ------------------------------------`);
  log('  #   Hit  Storm tier        Mult       Handle        Paid out  At table');
  for (const t of s.trace) {
    log(
      `${String(t.round).padStart(3)}.  H${t.struck + 1}   ${t.tier.padEnd(15)} ` +
      `${('x' + t.multiplier).padStart(6)} ${cr0(t.handleMinor).padStart(12)} ` +
      `${cr0(t.payoutMinor).padStart(15)} ${String(t.atTable).padStart(9)}` +
      `${t.surge ? '  JACKPOT' : ''}${t.capped ? '  CAPPED' : ''}`,
    );
  }

  // ── statistical tests ──
  log('');
  log('--- DISTRIBUTION TESTS (GLI-19 §3.2.2, 99% confidence) -------------------');
  const zoneChi = chiSquare(s.zoneCounts, Array(ZONE_COUNT).fill(1 / ZONE_COUNT));
  log(`Struck harbour uniformity   chi2 = ${zoneChi.chi2.toFixed(3)}  df ${zoneChi.df}  ` +
    `critical ${zoneChi.critical.toFixed(3)}   ${zoneChi.pass ? 'PASS' : 'FAIL'}`);
  log(`  observed per harbour      ${s.zoneCounts.map((n, i) => `H${i + 1}:${n}`).join('  ')}`);

  const space = STORM_POWER_LADDER[STORM_POWER_LADDER.length - 1]!.cumBound;
  let prevBound = 0;
  const tierProbs = STORM_POWER_LADDER.map((t) => {
    const p = (t.cumBound - prevBound) / space;
    prevBound = t.cumBound;
    return p;
  });
  const tierChi = chiSquare(s.tierCounts, tierProbs);
  log(`Storm Power tier frequency  chi2 = ${tierChi.chi2.toFixed(3)}  df ${tierChi.df}  ` +
    `critical ${tierChi.critical.toFixed(3)}   ${tierChi.pass ? 'PASS' : 'FAIL'}` +
    (tierChi.pooled ? `   (${tierChi.pooled} sparse tiers pooled)` : ''));

  const surgeObserved = s.surgeRounds / s.rounds;
  const surgeSd = Math.sqrt((SURGE_PROB * (1 - SURGE_PROB)) / s.rounds);
  const surgeZ = Math.abs(surgeObserved - SURGE_PROB) / surgeSd;
  log(`Jackpot trigger rate        observed ${pct(surgeObserved)}  expected ${pct(SURGE_PROB)}  ` +
    `z = ${surgeZ.toFixed(3)}   ${surgeZ <= 2.576 ? 'PASS' : 'FAIL'}`);
  log(`Conservation violations     ${s.conservationViolations}   ` +
    `${s.conservationViolations === 0 ? 'PASS — settlement arithmetic held on every round' : 'FAIL — CERTIFICATION STOPPER'}`);

  // ── RTP with a confidence interval ──
  const bootRng = behaviourRng((seed ^ 0xc0ffee) >>> 0);
  const staked = s.roundStaked.slice(0, s.rounds);
  const returned = s.roundReturned.slice(0, s.rounds);
  const ci = bootstrapRatioCI(returned, staked, Math.max(200, CONFIG.bootstrap), bootRng);

  log('');
  log('--- RETURN TO PLAYER (block bootstrap by round, 99% CI) ------------------');
  log(`Player RTP (measured)       ${pct(ci.point).padStart(10)}   99% CI [${pct(ci.lo)}, ${pct(ci.hi)}]`);
  log(`Theoretical RTP             ${pct(theory.totalRtp).padStart(10)}   ${theory.totalRtp >= ci.lo && theory.totalRtp <= ci.hi ? 'inside the interval' : 'OUTSIDE the interval — see note'}`);
  log(`Resamples                   ${Math.max(200, CONFIG.bootstrap)} rounds-with-replacement`);
  log('');
  log('The interval resamples ROUNDS, not bets. Landfall is pari-mutuel, so returns');
  log('inside a round are strongly dependent — one player\'s salvage is funded by');
  log('another player\'s lost stake. A per-bet interval would treat those as');
  log('independent and report a band several times too narrow.');

  // ── cash desk ──
  const totalReturned = s.playerReturnedMinor + s.seedReturnedMinor;
  log('');
  log('--- CASH DESK ------------------------------------------------------------');
  log(`Rounds settled              ${String(s.rounds).padStart(18)}`);
  log(`Total handle                ${cr(s.handleMinor).padStart(18)}`);
  log(`  of which players          ${cr(s.playerHandleMinor).padStart(18)}   ${pct(s.playerHandleMinor / s.handleMinor, 2)}`);
  log(`  of which house seed       ${cr(s.seedHandleMinor).padStart(18)}   ${pct(s.seedHandleMinor / s.handleMinor, 2)}`);
  log(`Returned to players         ${cr(s.playerReturnedMinor).padStart(18)}`);
  log(`Gross rake (struck pool)    ${cr(s.rakeMinor).padStart(18)}   ${pct(s.rakeMinor / s.handleMinor)} of handle`);
  log(`  house share               ${cr(s.houseShareMinor).padStart(18)}   ${pct(s.houseShareMinor / s.handleMinor)} of handle`);
  log(`  surge share               ${cr(s.surgeContribMinor).padStart(18)}   ${pct(s.surgeContribMinor / s.handleMinor)} of handle`);
  log(`  reserve share             ${cr(s.reserveContribMinor).padStart(18)}   ${pct(s.reserveContribMinor / s.handleMinor)} of handle`);
  log('');
  log('The rake share is NOT the hold. Against it the operator funds three things,');
  log('all of which move money toward players:');
  log(`  less jackpot floor re-seed  ${('-' + cr(s.jackpotReseedMinor)).padStart(16)}   ${pct(s.jackpotReseedMinor / s.handleMinor)} of handle`);
  log(`  less reserve backstop       ${('-' + cr(s.reserveBackstopMinor)).padStart(16)}   ${pct(s.reserveBackstopMinor / s.handleMinor)} of handle`);
  log(`  less liquidity float top-up ${('-' + cr(s.floatTopUpMinor)).padStart(16)}   ${pct(s.floatTopUpMinor / s.handleMinor)} of handle`);
  log('--------------------------------------------------------------------------');
  log(`OPERATOR NET                ${cr(s.operatorNetMinor).padStart(18)}   ${pct(s.operatorNetMinor / s.handleMinor)} of handle`);
  log(`PLAYERS RECEIVE             ${pct(ci.point).padStart(18)}   of everything they staked`);
  log('');
  log(`Total paid out (incl. seed) ${cr(totalReturned).padStart(18)}`);
  log(`Worst single round for the house ${cr(s.worstRoundForHouseMinor).padStart(13)}`);

  // ── reserve, float, jackpot ──
  log('');
  log('--- STORM RESERVE (GLI-19 §A.4.1 bankroll adequacy) ----------------------');
  log(`Opening capitalization      ${cr(stormReserveOpeningFor(TIER.floor)).padStart(18)}`);
  log(`Inflow (rake share)         ${cr(s.reserveContribMinor).padStart(18)}`);
  log(`Outflow (ladder overpay)    ${cr(s.reserveOutMinor).padStart(18)}`);
  log(`House backstop drawn        ${cr(s.reserveBackstopMinor).padStart(18)}   ${pct(s.reserveBackstopMinor / s.handleMinor)} of handle`);
  log(`Minimum balance             ${cr(s.reserveMinBalanceMinor).padStart(18)}   ${s.reserveMinBalanceMinor >= 0 ? 'PASS — never negative' : 'FAIL'}`);
  log(`Closing balance             ${cr(s.reserveFinalMinor).padStart(18)}`);

  log('');
  log('--- STORM SURGE JACKPOT (Order 222 Art. 17) ------------------------------');
  log(`Contributions               ${cr(s.surgeContribMinor).padStart(18)}`);
  log(`Paid to players             ${cr(s.jackpotPaidMinor).padStart(18)}   in ${s.jackpotWins} wins`);
  log(`House floor re-seeds        ${cr(s.jackpotReseedMinor).padStart(18)}`);
  log(`Rolled over (no survivor)   ${String(s.jackpotRollovers).padStart(18)}   Art. 17.3: never cancelled`);
  log(`Ceiling reached in          ${String(s.ceilingHits).padStart(18)} rounds   diversion pool ${cr(s.diversionMinor)}`);

  // ── jackpot affordability: the constraint that decides whether a tier works ──
  //
  // The house re-seeds the pot to its reset value after every win. That is a
  // recurring operator cost of `reset` every `1/SURGE_PROB` rounds, and it has
  // to be paid out of the house share of the rake, which is
  // `split.house * r/K` of handle. Affordability is therefore a hard inequality:
  //
  //     reset * SURGE_PROB  <  split.house * (r/K) * handlePerRound
  //     reset               <  (split.house * r / (K * SURGE_PROB)) * H
  //
  // At production constants that is `reset < 0.25 * H` — a reset worth more than
  // a quarter of a round's handle costs more than the table earns. This check
  // exists because the failure is invisible in any single round and shows up
  // only as a negative operator net at the end of a season.
  const handlePerRound = s.handleMinor / Math.max(1, s.rounds);
  const affordableReset = affordableResetMinor(resetPolicy(handlePerRound));
  const liveReset = surgeResetFor(resetPolicy(handlePerRound));
  const resetAffordable = liveReset <= affordableReset;
  log('');
  log('--- JACKPOT AFFORDABILITY ------------------------------------------------');
  log(`Reset value (at this handle)${cr(liveReset).padStart(18)}   adaptive, rules v3`);
  log(`Handle per round (measured) ${cr(handlePerRound).padStart(18)}`);
  log(`Affordable reset ceiling    ${cr(affordableReset).padStart(18)}   = house share of rake / surge rate`);
  log(`Reset / affordable          ${(liveReset / affordableReset).toFixed(2).padStart(18)}x   ` +
    `${resetAffordable ? 'PASS' : 'FAIL — the re-seed costs more than the table earns'}`);
  if (!resetAffordable) {
    log('');
    log('  The house guarantees a minimum jackpot by topping the pot back up to the');
    log('  reset value after every win. On this table that guarantee is larger than');
    log('  the entire rake share it is funded from, so the operator loses money on');
    log('  every round played. `surgeFloorFor()` returns max(SURGE_MIN_POT_MINOR,');
    log('  20 x minStake), and below a 25-credit minimum bet the flat floor wins —');
    log('  so the per-table scaling the function was written for is inert on exactly');
    log('  the small tiers it was meant to fix.');
  }

  log('');
  log('--- LIQUIDITY FLOAT (G8 ring-fence, GLI-19 §A.7.1) -----------------------');
  log(`House seed staked           ${cr(s.seedHandleMinor).padStart(18)}`);
  log(`House seed returned         ${cr(s.seedReturnedMinor).padStart(18)}`);
  log(`Float profit and loss       ${cr(s.floatPLMinor).padStart(18)}   ${pct(s.floatPLMinor / s.handleMinor)} of handle`);
  log(`Operator capital added      ${cr(s.floatTopUpMinor).padStart(18)}`);
  log(`Closing float balance       ${cr(s.floatBalanceMinor).padStart(18)}`);
  log('');
  log('The float\'s profit is NOT operator revenue: it may fund only future seeds,');
  log('the jackpot or the reserve. A positive figure here is expected — a uniform');
  log('seed is +EV against an imbalanced crowd because the survivor payout is convex');
  log('in the struck pool. That is why it is ring-fenced rather than banked.');

  // ── players ──
  const P = s.players.filter((p) => p.state !== 'wait');
  const net = (p: Player): number => p.balanceMinor - p.startMinor;
  const winners = P.filter((p) => net(p) > 0);

  log('');
  log('--- WHAT HAPPENED TO PLAYERS --------------------------------------------');
  log(`Sat down                    ${String(P.length).padStart(18)}`);
  log(`Brought to the table        ${cr0(sum(P.map((p) => p.startMinor))).padStart(18)} credits`);
  log(`Left holding                ${cr0(sum(P.map((p) => p.balanceMinor))).padStart(18)} credits`);
  log(`Finished ahead              ${String(winners.length).padStart(18)}   ${pct1(winners.length / P.length)}`);
  for (const st of ['tp', 'sl', 'bust', 'quit', 'play'] as ExitState[]) {
    const g = P.filter((p) => p.state === st);
    log(`  ${EXIT_LABEL[st].padEnd(24)} ${String(g.length).padStart(6)}   ${pct1(g.length / P.length).padStart(6)}`);
  }

  log('');
  log('--- RTP BY PROFILE — the skill layer, measured --------------------------');
  log('Profile      Players  Avg bankroll   Rounds   Staked         RTP      Finished ahead');
  const rows: (Profile | null)[] = [...profiles, null];
  for (const pr of rows) {
    const g = pr ? P.filter((p) => p.profile.id === pr.id) : P;
    if (!g.length) continue;
    const st = sum(g.map((p) => p.stakedMinor));
    const rt = sum(g.map((p) => p.returnedMinor));
    log(
      `${(pr ? pr.label : 'ALL').padEnd(12)} ${String(g.length).padStart(7)}  ` +
      `${cr0(sum(g.map((p) => p.startMinor)) / g.length).padStart(12)}  ` +
      `${String(sum(g.map((p) => p.rounds))).padStart(7)}  ${cr0(st).padStart(13)}  ` +
      `${(st ? pct(rt / st, 2) : '-').padStart(8)}  ` +
      `${pct1(g.filter((p) => net(p) > 0).length / g.length).padStart(14)}`,
    );
  }
  log('');
  log('READ THIS TABLE AGAINST THE OPERATOR NET ABOVE. Profiles differ in RTP because');
  log('crowd position redistributes expected value BETWEEN players — standing where');
  log('the crowd is not pays relatively more. What it never does is move value away');
  log('from the house: the operator\'s take is fixed at r/K of handle by the');
  log('pari-mutuel identity, whatever shape the crowd takes. That is the honest form');
  log('of the disclosure GLI-19 §4.6.1(a) requires for a game with a skill layer.');

  log('');
  log('Table population through the season:');
  {
    const peak = Math.max(1, ...s.tableCurve);
    for (let i = 0; i <= 10; i++) {
      const idx = Math.min(s.tableCurve.length - 1, Math.round((i / 10) * (s.tableCurve.length - 1)));
      log(`  round ${String(idx + 1).padStart(6)}  ${bar(s.tableCurve[idx]!, peak, 40)} ${String(s.tableCurve[idx]).padStart(5)}`);
    }
  }

  // ── multi-season risk ──
  const SEASONS = CONFIG.seasons ?? Math.max(12, Math.min(80, Math.round(2_000_000 / (CONFIG.rounds * CONFIG.players / 10))));
  const nets: number[] = [];
  let worstBackstop = 0;
  let seasonsNeedingBackstop = 0;
  let worstReserveMin = Infinity;
  for (let i = 0; i < SEASONS; i++) {
    const r = runSeason(profiles, (seed + i * 7919) >>> 0, false);
    nets.push(r.operatorNetMinor);
    worstBackstop = Math.max(worstBackstop, r.reserveBackstopMinor);
    if (r.reserveBackstopMinor > 0) seasonsNeedingBackstop++;
    worstReserveMin = Math.min(worstReserveMin, r.reserveMinBalanceMinor);
  }
  nets.sort((a, b) => a - b);
  const mean = sum(nets) / SEASONS;
  const sd = Math.sqrt(sum(nets.map((x) => (x - mean) ** 2)) / SEASONS);
  const q = (f: number): number => nets[Math.min(SEASONS - 1, Math.floor(f * SEASONS))]!;
  const losing = nets.filter((x) => x < 0).length;

  log('');
  log(`--- OPERATOR RISK: ${SEASONS} independent seasons of ${CONFIG.rounds} rounds -------------`);
  log(`Mean net per season         ${cr(mean).padStart(18)}`);
  log(`Standard deviation          ${cr(sd).padStart(18)}`);
  log(`Worst season                ${cr(nets[0]!).padStart(18)}`);
  log(`5th percentile              ${cr(q(0.05)).padStart(18)}`);
  log(`Median                      ${cr(q(0.5)).padStart(18)}`);
  log(`95th percentile             ${cr(q(0.95)).padStart(18)}`);
  log(`Seasons in loss             ${String(losing).padStart(18)} of ${SEASONS}   ${pct1(losing / SEASONS)}`);
  log(`Signal-to-noise (mean/sd)   ${(sd === 0 ? 0 : mean / sd).toFixed(3).padStart(18)}`);
  log('');
  log(`Seasons needing a backstop  ${String(seasonsNeedingBackstop).padStart(18)} of ${SEASONS}`);
  log(`Largest backstop in a season ${cr(worstBackstop).padStart(17)}`);
  log(`Lowest reserve balance seen ${cr(worstReserveMin === Infinity ? 0 : worstReserveMin).padStart(18)}   ${worstReserveMin >= 0 ? 'PASS — never negative' : 'FAIL'}`);
  log('');
  log('The base game carries NO payout liability: settlement redistributes money');
  log('already staked in the round, so the house can never owe more than it collected.');
  log('Everything above is exposure to the ladder reserve and the jackpot re-seed,');
  log('which are the only places operator money is genuinely at risk.');

  const allTestsPass =
    zoneChi.pass && tierChi.pass && surgeZ <= 2.576 &&
    s.conservationViolations === 0 && s.reserveMinBalanceMinor >= 0 && worstReserveMin >= 0 &&
    resetAffordable && s.operatorNetMinor > 0;

  log('');
  log('==========================================================================');
  log(`  VERDICT: ${allTestsPass ? 'all statistical and integrity checks PASSED' : 'ONE OR MORE CHECKS FAILED — investigate before submission'}`);
  log('==========================================================================');

  lines.splice(
    headlineAt, 0,
    '',
    `Players receive          ${pct(ci.point).padStart(16)}   99% CI [${pct(ci.lo)}, ${pct(ci.hi)}]`,
    `Operator net             ${pct(s.operatorNetMinor / s.handleMinor).padStart(16)}   of ${cr0(s.handleMinor)} credits handled`,
    `Checks                   ${(allTestsPass ? 'ALL PASS' : 'FAILURES').padStart(16)}   over ${s.rounds} rounds and ${SEASONS} risk seasons`,
  );

  return {
    operatorNetMinor: s.operatorNetMinor,
    handleMinor: s.handleMinor,
    playerRtp: ci.point,
    meanSeasonNetMinor: mean,
    losingSeasons: losing,
    seasons: SEASONS,
    allTestsPass,
  };
}

function main(): void {
  const runs = Math.max(1, Math.floor(CONFIG.runs));
  const dir = CONFIG.saveReport ? nextRunDir() : null;
  if (dir) process.stdout.write(`Reports: ${dir}\n`);

  const done: (RunResult & { seed: number; file: string })[] = [];
  let anyFailure = false;
  for (let i = 1; i <= runs; i++) {
    const seed = CONFIG.seed == null ? Math.floor(Math.random() * 2 ** 32) : (CONFIG.seed + i - 1) >>> 0;
    process.stdout.write(`  report ${i}/${runs}: `);
    lines.length = 0;
    const r = report(seed, i, runs);
    done.push({ ...r, seed, file: `report_${i}.txt` });
    anyFailure ||= !r.allTestsPass;
    const text = lines.join('\n') + '\n';
    if (dir) writeFileSync(join(dir, `report_${i}.txt`), text, 'utf8');
    process.stdout.write(
      `RTP ${pct(r.playerRtp, 3)} · operator net ${pct(r.operatorNetMinor / r.handleMinor, 3)} of handle · ` +
      `${r.allTestsPass ? 'all checks pass' : 'CHECKS FAILED'}${dir ? `  -> report_${i}.txt` : ''}\n`,
    );
    if (!dir) process.stdout.write(text);
  }

  const summary = [
    `LANDFALL — certification simulation summary${dir ? ' — ' + dir.split('/').pop() : ''}`,
    `Generated ${new Date().toISOString()}`,
    `Config digest ${configDigest()}  ·  rules v${RULES_VERSION}  ·  table ${TIER.name}`,
    `Each report is one independent season: ${CONFIG.players} players, ${CONFIG.rounds} rounds.`,
    '',
    'Report          Seed          Player RTP    Operator net    Checks',
    '---------------------------------------------------------------------',
    ...done.map((r) =>
      `${r.file.padEnd(15)} ${String(r.seed).padStart(11)}  ${pct(r.playerRtp, 3).padStart(11)}  ` +
      `${pct(r.operatorNetMinor / r.handleMinor, 3).padStart(13)}    ${r.allTestsPass ? 'pass' : 'FAIL'}`),
    '---------------------------------------------------------------------',
    `Mean player RTP  ${pct(sum(done.map((r) => r.playerRtp)) / done.length, 3).padStart(26)}`,
    `Mean operator net${pct(sum(done.map((r) => r.operatorNetMinor / r.handleMinor)) / done.length, 3).padStart(26)}`,
    '',
  ].join('\n');
  if (dir) writeFileSync(join(dir, 'summary.txt'), summary, 'utf8');
  process.stdout.write('\n' + summary);
  if (anyFailure) process.exitCode = 1;
}

main();
