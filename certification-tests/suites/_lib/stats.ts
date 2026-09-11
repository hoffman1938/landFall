/**
 * Statistical helpers for the certification suites.
 *
 * Deliberately small, dependency-free and readable: a laboratory reviewing this
 * pack has to be able to satisfy itself that the statistics are the statistics
 * they are labelled as, and an import of somebody's stats package does not help
 * with that. Everything here is a published formula with its source named.
 */

// ---------------------------------------------------------------------------
// Chi-square
// ---------------------------------------------------------------------------

/**
 * Upper-tail probability of the chi-square distribution, P(X > x | df).
 *
 * Computed from the regularised upper incomplete gamma Q(df/2, x/2) using the
 * standard pairing: the series expansion for small x and the Lentz continued
 * fraction for large x (Numerical Recipes §6.2). Accurate to ~1e-12 across the
 * range these suites use, which is far beyond what a 99% decision needs.
 */
export function chiSquareUpperTail(x: number, df: number): number {
  if (x <= 0) return 1;
  return gammaQ(df / 2, x / 2);
}

function lnGamma(z: number): number {
  // Lanczos approximation, g = 7, n = 9.
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const zz = z - 1;
  let a = c[0]!;
  const t = zz + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (zz + i);
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised lower incomplete gamma P(a, x), by series. */
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 0; n < 1000; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

/** Regularised upper incomplete gamma Q(a, x) = 1 − P(a, x), by continued fraction. */
function gammaQ(a: number, x: number): number {
  if (x < a + 1) return 1 - gammaP(a, x);
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/**
 * The 99th-percentile critical value of chi-square with `df` degrees of
 * freedom — the threshold §3.2.2's "99% confidence level" sets. Found by
 * bisection on the tail function above, so the table cannot be mistyped.
 */
export function criticalChiSquare(df: number, alpha = 0.01): number {
  let lo = 0;
  let hi = 10 * (df + 10);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (chiSquareUpperTail(mid, df) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Two-sided normal tail probability, P(|Z| > |z|). */
export function normalTwoSided(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 applied to erf.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

// ---------------------------------------------------------------------------
// Seed streams
// ---------------------------------------------------------------------------

import { chainCommitment, chainValue, roundSeed, sha256Hex } from '@landfall/core';

export interface SeededRound {
  seedHex: string;
  roundId: number;
}

/**
 * A stream of (seed, roundId) pairs drawn from a REAL pre-committed hash chain,
 * exactly as the game consumes them.
 *
 * This matters more than it looks. Testing `drawZone` against arbitrary random
 * hex would test the HMAC; testing it against the chain tests the whole
 * construction the game actually runs, including the fact that consecutive
 * rounds use consecutive chain links, which is where a correlation between
 * successive outcomes would appear if one existed.
 *
 * `label` seeds the terminal secret deterministically, so every figure in this
 * pack is reproducible from the label alone.
 */
export function* seasonSeeds(label: string, rounds: number): Generator<SeededRound> {
  const terminal = sha256Hex(`landfall-certification:${label}`);
  /*
   * One chain per SEASON rounds, faithful to the shipped construction (a season
   * is finite and rolls over — server/src/chain.ts).
   *
   * WALKED ONCE, NOT PER ROUND. `roundSeed(terminal, L, i)` is SHA256^(L−i), so
   * asking for every round in order costs O(L²) hashes — 200 million for a
   * 20,000-round season, which is minutes of CPU for a test that should take
   * seconds. Hashing UP from the terminal secret produces the same links in
   * reverse (s_L = terminal, s_{L−1} = SHA(s_L), …) in O(L), and the assertion
   * below pins the two constructions together so the fast path cannot drift
   * from the one the server uses.
   */
  const SEASON = 20_000;
  let produced = 0;
  let season = 0;
  while (produced < rounds) {
    const seasonTerminal = sha256Hex(`${terminal}:${season}`);
    const take = Math.min(SEASON, rounds - produced);
    // links[k] = SHA256^k(terminal) = the seed for round SEASON − k.
    const links: string[] = new Array<string>(SEASON);
    links[0] = seasonTerminal;
    for (let k = 1; k < SEASON; k++) links[k] = sha256Hex2(links[k - 1]!);
    if (links[SEASON - 1] !== roundSeed(seasonTerminal, SEASON, 1)) {
      throw new Error('seed chain walk disagrees with the shipped roundSeed');
    }
    if (chainCommitment(seasonTerminal, SEASON) !== sha256Hex2(links[SEASON - 1]!)) {
      throw new Error('seed chain commitment disagrees with the shipped chainCommitment');
    }
    for (let i = 1; i <= take; i++) {
      yield { seedHex: links[SEASON - i]!, roundId: produced + i };
      produced += 1;
    }
    season += 1;
  }
}

/** SHA-256 of a hex string's BYTES (not of its text) — one chain link. */
function sha256Hex2(hex: string): string {
  return chainValue(hex, 1);
}

/** Collect a stream into an array — convenient for the multi-pass tests. */
export function collect<T>(gen: Generator<T>): T[] {
  return [...gen];
}
