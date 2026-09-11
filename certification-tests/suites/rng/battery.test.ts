/**
 * GLI-19 §3.2.2 STATISTICAL ANALYSIS — the seven named tests, applied to the
 * FINAL OUTCOME OUTPUT and evaluated collectively at a 99% confidence level.
 *
 *   a) Total Distribution / Chi-square   e) Interplay Correlation
 *   b) Overlaps                          f) Serial Correlation
 *   c) Coupon Collector                  g) Duplicates
 *   d) Runs
 *
 * HOW "COLLECTIVELY AT 99%" IS READ HERE, and why it is not "every test passes".
 *
 * A single seeded run of seven tests at α = 0.01 has roughly a 7% chance of at
 * least one rejection even against a perfect source. A suite that demands seven
 * passes is therefore not testing at 99% confidence — it is testing at about
 * 93%, and it will fail intermittently on correct code, which is worse than
 * useless because the failures get ignored.
 *
 * So the battery runs over MANY INDEPENDENT STREAMS and tests the REJECTION RATE
 * against the 1% the level implies. That is the collective reading, it is stable,
 * and it detects a genuinely broken source far more sharply than a single run:
 * a source with a real defect rejects in most streams, not one in a hundred.
 *
 * The per-stream statistics are also printed by
 * `simulations/rng-evidence.ts` so the laboratory can see the distribution
 * rather than only the verdict.
 */
import { describe, expect, it } from 'vitest';
import { ZONE_COUNT, drawZone } from '@landfall/core';
import { chiSquareUpperTail, normalTwoSided, seasonSeeds } from '../_lib/stats';

/** Independent streams. Enough that a 1% rate is distinguishable from 20%. */
const STREAMS = 20;
/** Draws per stream. */
const PER_STREAM = 12_000;
/** The level §3.2.2 names. */
const ALPHA = 0.01;

/** One stream of final harbour outcomes, from the production chain and draw. */
function harbourStream(label: string, n: number): number[] {
  const out: number[] = [];
  for (const { seedHex, roundId } of seasonSeeds(label, n)) {
    out.push(drawZone(seedHex, roundId, ZONE_COUNT).struckZone);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The seven tests. Each returns a p-value.
// ---------------------------------------------------------------------------

/** (a) Total Distribution — are the six outcomes equally frequent? */
function totalDistribution(xs: number[]): number {
  const counts = new Array<number>(ZONE_COUNT).fill(0);
  for (const x of xs) counts[x]! += 1;
  const e = xs.length / ZONE_COUNT;
  const chi2 = counts.reduce((a, c) => a + (c - e) ** 2 / e, 0);
  return chiSquareUpperTail(chi2, ZONE_COUNT - 1);
}

/**
 * (b) Overlaps — the distribution of overlapping PAIRS. With 6 outcomes there
 * are 36 ordered pairs, each expected at 1/36. This is the test that catches a
 * source where each value is fine alone but the transition matrix is not.
 */
function overlaps(xs: number[]): number {
  const cells = ZONE_COUNT * ZONE_COUNT;
  const counts = new Array<number>(cells).fill(0);
  for (let i = 1; i < xs.length; i++) counts[xs[i - 1]! * ZONE_COUNT + xs[i]!]! += 1;
  const n = xs.length - 1;
  const e = n / cells;
  const chi2 = counts.reduce((a, c) => a + (c - e) ** 2 / e, 0);
  return chiSquareUpperTail(chi2, cells - 1);
}

/**
 * (c) Coupon Collector — how many draws to see all six outcomes, repeatedly.
 * Compared against the exact distribution of the collection time, truncated and
 * pooled in the tail. Sensitive to a source that starves one outcome.
 */
function couponCollector(xs: number[]): number {
  const lengths: number[] = [];
  let seen = new Set<number>();
  let count = 0;
  for (const x of xs) {
    count += 1;
    seen.add(x);
    if (seen.size === ZONE_COUNT) {
      lengths.push(count);
      seen = new Set<number>();
      count = 0;
    }
  }
  if (lengths.length < 30) return 1; // not enough cycles to say anything

  /*
   * Exact probability that a collection takes exactly t draws, by inclusion
   * exclusion: P(T ≤ t) = Σ_{j} (−1)^j C(k−1, j) ((k−j)/k)^t for the last
   * coupon. Using the standard surjection form here instead:
   *   P(T ≤ t) = Σ_{j=0..k} (−1)^j C(k, j) (1 − j/k)^t
   */
  const k = ZONE_COUNT;
  const cdf = (t: number): number => {
    let s = 0;
    for (let j = 0; j <= k; j++) {
      s += (j % 2 === 0 ? 1 : -1) * binomial(k, j) * Math.pow(1 - j / k, t);
    }
    return Math.max(0, Math.min(1, s));
  };

  // Bucket by collection length, pooling the tail so every cell expects ≥ 5.
  const maxT = 40;
  const buckets = new Array<number>(maxT - k + 2).fill(0);
  for (const len of lengths) buckets[Math.min(len, maxT) - k]! += 1;
  const probs = buckets.map((_, i) => {
    const t = i + k;
    return t >= maxT ? 1 - cdf(maxT - 1) : cdf(t) - cdf(t - 1);
  });

  const obs: number[] = [];
  const exp: number[] = [];
  let po = 0;
  let pe = 0;
  probs.forEach((p, i) => {
    const e = p * lengths.length;
    if (e >= 5) {
      obs.push(buckets[i]!);
      exp.push(e);
    } else {
      po += buckets[i]!;
      pe += e;
    }
  });
  if (pe > 0) {
    obs.push(po);
    exp.push(pe);
  }
  const chi2 = obs.reduce((a, o, i) => a + (o - exp[i]!) ** 2 / exp[i]!, 0);
  return chiSquareUpperTail(chi2, obs.length - 1);
}

function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/**
 * (d) Runs — the Wald–Wolfowitz runs test on a binary recoding of the sequence.
 *
 * WHY A BINARY RECODING RATHER THAN RUNS UP AND DOWN. The textbook runs-up-and-
 * down statistic (Knuth, TAOCP vol. 2 §3.3.2.G: mean (2n−1)/3, variance
 * (16n−29)/90) is derived for n DISTINCT values from a continuous distribution.
 * The harbour alphabet has six symbols, so about one adjacent pair in six is a
 * tie; dropping ties changes the length of the sign sequence and its dependence
 * structure, and the continuous-case moments no longer describe it. Applied
 * anyway it rejects a perfectly good source in essentially every stream — which
 * is exactly what the first draft of this file did, and is the reason the
 * comment is here rather than a formula being quietly swapped.
 *
 * The Wald–Wolfowitz form has EXACT moments for a finite binary sequence and no
 * tie problem at all. Splitting the six harbours into the low three and the high
 * three is the natural dichotomy, is balanced by construction, and preserves the
 * property the test exists to find: clustering or alternation in the order
 * outcomes arrive, which the marginal distribution cannot see.
 *
 *   R = number of runs,  n₁ ones, n₂ zeros, n = n₁ + n₂
 *   E[R]   = 2n₁n₂/n + 1
 *   Var[R] = 2n₁n₂(2n₁n₂ − n) / (n²(n − 1))
 */
function runsTest(xs: number[]): number {
  const bits = xs.map((x) => (x >= ZONE_COUNT / 2 ? 1 : 0));
  const n1 = bits.filter((b) => b === 1).length;
  const n2 = bits.length - n1;
  if (n1 === 0 || n2 === 0) return 0;
  let runs = 1;
  for (let i = 1; i < bits.length; i++) if (bits[i] !== bits[i - 1]) runs += 1;
  const n = bits.length;
  const mean = (2 * n1 * n2) / n + 1;
  const variance = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
  return normalTwoSided((runs - mean) / Math.sqrt(variance));
}

/**
 * (e) Interplay Correlation — do the OTHER values drawn in the same round carry
 * information about the harbour? This is the one test in the battery that is
 * specific to Landfall's design: a single HMAC digest is sliced into the
 * harbour, the jackpot trigger, the jackpot winner roll, the multiplier tier and
 * the cosmetic weather. If those slices were correlated, announcing the jackpot
 * bit before betting — which the game does — would leak the harbour.
 */
function interplay(label: string, n: number): number {
  // 6 harbours × 2 surge states.
  const counts = new Array<number>(ZONE_COUNT * 2).fill(0);
  for (const { seedHex, roundId } of seasonSeeds(label, n)) {
    const d = drawZone(seedHex, roundId, ZONE_COUNT);
    const surgeHigh = d.uSurge >= 0.5 ? 1 : 0;
    counts[d.struckZone * 2 + surgeHigh]! += 1;
  }
  // Independence test on the 6×2 contingency table.
  const rowTotals = new Array<number>(ZONE_COUNT).fill(0);
  const colTotals = [0, 0];
  for (let z = 0; z < ZONE_COUNT; z++) {
    for (let c = 0; c < 2; c++) {
      rowTotals[z]! += counts[z * 2 + c]!;
      colTotals[c]! += counts[z * 2 + c]!;
    }
  }
  let chi2 = 0;
  for (let z = 0; z < ZONE_COUNT; z++) {
    for (let c = 0; c < 2; c++) {
      const e = (rowTotals[z]! * colTotals[c]!) / n;
      chi2 += (counts[z * 2 + c]! - e) ** 2 / e;
    }
  }
  return chiSquareUpperTail(chi2, (ZONE_COUNT - 1) * (2 - 1));
}

/**
 * (f) Serial Correlation — lag-1 autocorrelation of the outcome sequence. For
 * independent draws the coefficient is asymptotically N(0, 1/n).
 */
function serialCorrelation(xs: number[], lag = 1): number {
  const n = xs.length - lag;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) num += (xs[i]! - mean) * (xs[i + lag]! - mean);
  for (const x of xs) den += (x - mean) ** 2;
  const r = num / den;
  return normalTwoSided(r * Math.sqrt(n));
}

/**
 * (g) Duplicates — how often a draw repeats the previous one. Expected 1/6;
 * a Bernoulli z-test. Catches both a sticky source and one that avoids repeats,
 * which a chi-square on the marginal distribution cannot see at all.
 */
function duplicates(xs: number[]): number {
  let dup = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] === xs[i - 1]) dup += 1;
  const n = xs.length - 1;
  const p = 1 / ZONE_COUNT;
  return normalTwoSided((dup - n * p) / Math.sqrt(n * p * (1 - p)));
}

// ---------------------------------------------------------------------------

describe('GLI-19 §3.2.2 — the seven-test battery, collectively at 99%', () => {
  const results = new Map<string, number[]>();

  it('runs all seven tests over independent streams', () => {
    const names = [
      'total distribution',
      'overlaps',
      'coupon collector',
      'runs',
      'interplay correlation',
      'serial correlation',
      'duplicates',
    ];
    for (const n of names) results.set(n, []);

    for (let s = 0; s < STREAMS; s++) {
      const label = `battery-${s}`;
      const xs = harbourStream(label, PER_STREAM);
      results.get('total distribution')!.push(totalDistribution(xs));
      results.get('overlaps')!.push(overlaps(xs));
      results.get('coupon collector')!.push(couponCollector(xs));
      results.get('runs')!.push(runsTest(xs));
      results.get('interplay correlation')!.push(interplay(label, PER_STREAM));
      results.get('serial correlation')!.push(serialCorrelation(xs));
      results.get('duplicates')!.push(duplicates(xs));
    }

    for (const [, ps] of results) {
      expect(ps).toHaveLength(STREAMS);
      for (const p of ps) {
        expect(Number.isFinite(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  /**
   * THE COLLECTIVE VERDICT. Across 7 tests × 20 streams = 140 decisions at
   * α = 0.01, the expected number of rejections is 1.4. A source with a real
   * defect produces a rejection rate an order of magnitude higher, so the
   * threshold is set where it separates those two cases rather than where it
   * would flag ordinary sampling noise.
   */
  it('the rejection rate is consistent with the 1% the level implies', () => {
    const all = [...results.values()].flat();
    expect(all.length).toBe(7 * STREAMS);
    const rejections = all.filter((p) => p < ALPHA).length;
    const expected = all.length * ALPHA;
    // Poisson upper bound at roughly the 99.9th percentile of Poisson(1.4).
    const ceiling = Math.max(6, Math.ceil(expected + 4 * Math.sqrt(expected)));
    expect(
      rejections,
      `${rejections} rejections in ${all.length} decisions (expected ~${expected.toFixed(1)})`,
    ).toBeLessThanOrEqual(ceiling);
  });

  /**
   * …and no single test may be systematically broken. A source that fails one
   * of the seven in most streams while passing the rest would hide inside an
   * acceptable aggregate rate, so each test is also checked on its own.
   */
  it('no individual test rejects in more than a small minority of streams', () => {
    for (const [name, ps] of results) {
      const rejections = ps.filter((p) => p < ALPHA).length;
      expect(rejections, `${name}: ${rejections}/${STREAMS} streams rejected`).toBeLessThanOrEqual(
        3,
      );
    }
  });

  /**
   * The p-values themselves should be roughly uniform on (0,1) — that is what
   * "correctly calibrated test against a random source" means, and it is a
   * stronger statement than any individual pass. A Kolmogorov–Smirnov check
   * against the uniform, at a deliberately loose threshold given 140 points.
   */
  it('the p-values are consistent with a uniform distribution', () => {
    const ps = [...results.values()].flat().sort((a, b) => a - b);
    const n = ps.length;
    let d = 0;
    ps.forEach((p, i) => {
      d = Math.max(d, Math.abs((i + 1) / n - p), Math.abs(p - i / n));
    });
    // Asymptotic KS critical value at α = 0.01 is 1.63/√n.
    const critical = 1.63 / Math.sqrt(n);
    expect(d, `KS statistic ${d.toFixed(4)} vs critical ${critical.toFixed(4)}`).toBeLessThan(
      critical,
    );
  });
});
