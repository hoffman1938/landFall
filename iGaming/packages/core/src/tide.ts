/**
 * Tide band computation with hysteresis (remediation B2, anti-probing).
 *
 * Bands are ratio-of-average buckets. Without hysteresis, a prober could
 * binary-search a zone's exact pool by nudging a min-stake on/off and watching
 * the band flip at the threshold. With hysteresis, a band only changes after
 * the underlying ratio crosses the threshold by a margin (a fraction of the
 * band's width), so the flip point depends on the direction of approach and
 * the prober can never localize the pool below ~band resolution — the probing
 * test in core/test/tide.test.ts asserts this.
 */
import { HOUSE_SEED_MINOR } from './constants.js';
import type { TideBand } from './messages.js';

/** Ratio-of-average thresholds: light|medium at 0.75, medium|heavy at 1.25, heavy|packed at 1.8. */
export const TIDE_BAND_THRESHOLDS = [0.75, 1.25, 1.8] as const;

/** Hysteresis margin as a fraction of the adjacent band's width. */
export const TIDE_BAND_HYSTERESIS = 0.1;

const BANDS: TideBand[] = ['light', 'medium', 'heavy', 'packed'];

/** Width of the band interval above threshold i (for margin sizing). */
function bandWidth(i: number): number {
  const t = TIDE_BAND_THRESHOLDS;
  if (i + 1 < t.length) return t[i + 1]! - t[i]!;
  return t[t.length - 1]! - t[t.length - 2]!; // packed: reuse the last finite width
}

function rawBandIndex(ratio: number): number {
  const t = TIDE_BAND_THRESHOLDS;
  let idx = 0;
  while (idx < t.length && ratio >= t[idx]!) idx++;
  return idx;
}

/**
 * Compute one zone's band with hysteresis against its previously published band.
 * `seed` (only house money present) is exact, never hysteretic: it is a factual
 * "no player anchors here yet" statement, not a magnitude report.
 */
export function tideBandFor(
  amountMinor: number,
  avgMinor: number,
  prevBand: TideBand | null,
  houseSeedMinor: number = HOUSE_SEED_MINOR,
): TideBand {
  if (amountMinor <= houseSeedMinor) return 'seed';
  const ratio = amountMinor / Math.max(1, avgMinor);
  const raw = rawBandIndex(ratio);
  if (prevBand === null || prevBand === 'seed') return BANDS[raw]!;
  const prev = BANDS.indexOf(prevBand);
  if (prev === -1) return BANDS[raw]!;
  if (raw === prev) return prevBand;
  if (raw > prev) {
    // Moving up: must clear the boundary above prev by the margin.
    const t = TIDE_BAND_THRESHOLDS[prev]!;
    const margin = TIDE_BAND_HYSTERESIS * bandWidth(prev);
    if (ratio < t + margin) return prevBand;
    // Cleared at least one boundary with margin; intermediate boundaries below
    // the raw band were crossed outright — land on the raw band.
    return BANDS[raw]!;
  }
  // Moving down: must clear the boundary below prev by the margin.
  const t = TIDE_BAND_THRESHOLDS[prev - 1]!;
  const margin = TIDE_BAND_HYSTERESIS * bandWidth(prev - 1);
  if (ratio > t - margin) return prevBand;
  return BANDS[raw]!;
}

/** Compute all zones' bands with hysteresis against the previously published bands. */
export function computeTideBands(
  totalsMinor: readonly number[],
  prevBands: readonly TideBand[] | null,
  houseSeedMinor: number = HOUSE_SEED_MINOR,
): TideBand[] {
  const total = totalsMinor.reduce((a, n) => a + n, 0);
  const avg = Math.max(1, total / totalsMinor.length);
  return totalsMinor.map((amount, zone) =>
    tideBandFor(amount, avg, prevBands?.[zone] ?? null, houseSeedMinor),
  );
}

/**
 * Payout expectation band (remediation D4) — derived from the PUBLIC tide
 * report only, so it grants no informational edge to anyone: representative
 * ratio-of-average per band, mid-interval. The absolute average pool cancels
 * out of the survivor-gain formula, so bands alone suffice.
 */
export const TIDE_BAND_RATIO_ESTIMATE: Record<TideBand, number> = {
  seed: 0.25, // house seed only — well under the light|medium boundary
  light: 0.5, // (0, 0.75) midpoint-ish
  medium: 1.0, // [0.75, 1.25)
  heavy: 1.5, // [1.25, 1.8)
  packed: 2.2, // [1.8, ∞) — representative
};

export interface PayoutExpectation {
  /** Gain as a fraction of stake if the LIGHTEST other cove is struck. */
  minGain: number;
  /** Gain as a fraction of stake if the HEAVIEST other cove is struck. */
  maxGain: number;
}

/**
 * If cove j (≠ yours) is struck, a survivor's gain fraction at Storm Power ×1 is
 *   (1 − rake) × P_j / (T − P_j)
 * which is scale-invariant in the band ratios: r_j / (Σr − r_j). Returns the
 * min/max over the coves you would survive; null when no other cove exists.
 * The caller freezes it alongside the frozen tide report — same input, same output.
 */
export function payoutExpectationGains(
  bands: readonly TideBand[],
  myZone: number | null,
  rake: number,
): number[] {
  const ratios = bands.map((b) => TIDE_BAND_RATIO_ESTIMATE[b]);
  const sum = ratios.reduce((a, b) => a + b, 0);
  return ratios
    .filter((_, zone) => zone !== myZone)
    .map((r) => ((1 - rake) * r) / (sum - r));
}

export function payoutExpectationRange(
  bands: readonly TideBand[],
  myZone: number | null,
  rake: number,
): PayoutExpectation | null {
  const gains = payoutExpectationGains(bands, myZone, rake);
  if (gains.length === 0) return null;
  return { minGain: Math.min(...gains), maxGain: Math.max(...gains) };
}
