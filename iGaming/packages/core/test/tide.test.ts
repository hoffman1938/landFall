import { describe, expect, it } from 'vitest';
import {
  RAKE,
  TIDE_BAND_HYSTERESIS,
  TIDE_BAND_RATIO_ESTIMATE,
  TIDE_BAND_THRESHOLDS,
  ZONE_COUNT,
  computeTideBands,
  payoutExpectationRange,
  type TideBand,
} from '../src/index.js';

/**
 * B2 — anti-probing. A probing account nudges a min-stake on/off (or up/down)
 * and watches for the target zone's band to flip; the flip points bound the
 * hidden pool. With hysteresis the upward flip needs ratio > t + m and the
 * downward flip needs ratio < t − m, so the tightest interval any probe
 * sequence can pin is ≥ margin×avg wide — band-scale, never stake-scale.
 */
const SEED_MINOR = 50_00;

function bandsFor(totals: number[], prev: TideBand[] | null): TideBand[] {
  return computeTideBands(totals, prev, SEED_MINOR);
}

/**
 * Zone 0 = x, zones 1–5 = 10,000 each. ratio(x) = 6x/(x+50,000); this inverts
 * it so tests can place zone 0 at an exact ratio of the round average.
 */
function zone0ForRatio(ratio: number): number {
  return Math.round((ratio * 50_000) / (ZONE_COUNT - ratio));
}

function totalsWithZone0(x: number): number[] {
  return [x, 10_000, 10_000, 10_000, 10_000, 10_000];
}

describe('tide band hysteresis (anti-probing)', () => {
  it('reports plain ratio bands on the first report of a round', () => {
    // sum 66,000, avg 11,000 → ratios 0.909, 0.636, 1.364, 1.818, 0.818, seed-floor
    const totals = [10_000, 7_000, 15_000, 20_000, 9_000, 5_000];
    const bands = bandsFor(totals, null);
    expect(bands).toEqual(['medium', 'light', 'heavy', 'packed', 'medium', 'seed']);
  });

  it('does not flip a band on a sub-margin crossing (up or down)', () => {
    // light|medium threshold 0.75, margin = 10% of the medium band width (0.5) = 0.05.
    const first = bandsFor(totalsWithZone0(zone0ForRatio(0.74)), null);
    expect(first[0]).toBe('light');
    // Cross the threshold by less than the margin (0.78 < 0.80): stays light.
    const second = bandsFor(totalsWithZone0(zone0ForRatio(0.78)), first);
    expect(second[0]).toBe('light');
    // Clear the margin decisively (0.90 > 0.80): flips to medium.
    const third = bandsFor(totalsWithZone0(zone0ForRatio(0.9)), second);
    expect(third[0]).toBe('medium');
    // Dip just below the threshold (0.73 > 0.70 down-margin): stays medium.
    const fourth = bandsFor(totalsWithZone0(zone0ForRatio(0.73)), third);
    expect(fourth[0]).toBe('medium');
    // Only a decisive drop (0.65 < 0.70) releases the band back to light.
    const fifth = bandsFor(totalsWithZone0(zone0ForRatio(0.65)), fourth);
    expect(fifth[0]).toBe('light');
  });

  it('a binary-searching prober cannot localize a pool below band resolution', () => {
    // Hidden pool P in zone 0 (below the light|medium threshold); the prober
    // adds their own stake q to zone 0 and binary-searches the smallest q that
    // flips the published band — the classic exact-total extraction attack.
    const hidden = 6_500;
    const others = [10_000, 10_000, 10_000, 10_000, 10_000];

    let prev: TideBand[] | null = null;
    const publish = (q: number): TideBand => {
      const totals = [hidden + q, ...others];
      const bands = bandsFor(totals, prev);
      prev = bands;
      return bands[0]!;
    };

    // Binary search with a fresh probe sequence per iteration (cancel/re-anchor).
    let lo = 0;
    let hi = 20_000;
    for (let i = 0; i < 60; i++) {
      const mid = Math.floor((lo + hi) / 2);
      prev = null;
      publish(0);
      const band = publish(mid);
      if (band !== 'light' && band !== 'seed') hi = mid;
      else lo = mid;
    }
    const qFlip = hi;

    // The prober models a raw threshold t=0.75 and solves P̂ = 0.75×avg − qFlip.
    // The hysteretic flip actually required t+m, so the estimate is off by the
    // margin — band-scale uncertainty no probe count can shrink.
    const totalsAtFlip = [hidden + qFlip, ...others];
    const T = totalsAtFlip.reduce((a, b) => a + b, 0);
    const avg = T / ZONE_COUNT;
    const t = TIDE_BAND_THRESHOLDS[0]!;
    const margin = TIDE_BAND_HYSTERESIS * (TIDE_BAND_THRESHOLDS[1]! - TIDE_BAND_THRESHOLDS[0]!);

    // The margin hides a pool interval of margin×avg — assert it is band-scale
    // (> 4% of the average pool), not stake-scale.
    expect(margin * avg).toBeGreaterThan(0.04 * avg);
    // And the naive estimate really is wrong by ~margin×avg:
    const naiveEstimate = t * avg - qFlip;
    expect(Math.abs(naiveEstimate - hidden)).toBeGreaterThan(0.03 * avg);
    // Sanity: the flip point corresponds to ratio ≈ t+m, not t.
    const flipRatio = (hidden + qFlip) / avg;
    expect(flipRatio).toBeGreaterThan(t + margin - 0.01);
  });
});

/**
 * D4 — payout expectation band. Hand-computed against the band arithmetic:
 * gain if cove j struck = (1−rake) × r_j / (Σr − r_j) at Storm Power ×1.
 */
describe('payout expectation range (D4)', () => {
  it('matches hand-computed band arithmetic', () => {
    // Bands: my cove medium; others: light, medium, heavy, packed, seed.
    const bands: TideBand[] = ['medium', 'light', 'medium', 'heavy', 'packed', 'seed'];
    const myZone = 0;
    const r = TIDE_BAND_RATIO_ESTIMATE;
    // Σr = 1.0 + 0.5 + 1.0 + 1.5 + 2.2 + 0.25 = 6.45
    const sum = r.medium + r.light + r.medium + r.heavy + r.packed + r.seed;
    expect(sum).toBeCloseTo(6.45, 10);
    const range = payoutExpectationRange(bands, myZone, RAKE)!;
    // Lightest other cove = seed (0.25): 0.88 × 0.25/(6.45 − 0.25) = 0.0354838…
    expect(range.minGain).toBeCloseTo((0.88 * 0.25) / 6.2, 10);
    // Heaviest other cove = packed (2.2): 0.88 × 2.2/(6.45 − 2.2) = 0.4555294…
    expect(range.maxGain).toBeCloseTo((0.88 * 2.2) / 4.25, 10);
  });

  it('is null when there is no other cove, and covers all zones when unanchored', () => {
    expect(payoutExpectationRange(['medium'], 0, RAKE)).toBeNull();
    const bands: TideBand[] = ['medium', 'medium', 'medium', 'medium', 'medium', 'medium'];
    const all = payoutExpectationRange(bands, null, RAKE)!;
    // Symmetric: every cove pays 0.88 × 1/(6−1) = 0.176.
    expect(all.minGain).toBeCloseTo(0.176, 10);
    expect(all.maxGain).toBeCloseTo(0.176, 10);
  });
});
