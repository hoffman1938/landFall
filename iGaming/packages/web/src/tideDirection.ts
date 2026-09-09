/**
 * The Tide Report, reduced to one direction.
 *
 * ============================================================================
 * WHAT THIS IS AND IS NOT SAYING
 * ============================================================================
 * A tide report reports where the OTHER PLAYERS are. It has never reported
 * where the storm will go, and it cannot: the draw is uniform, independent of
 * the pools, and computed from a seed committed before anyone bet.
 *
 * The redesign brief asks for a beginner card shaped
 *
 *      TIDE REPORT
 *      Storm activity:  ← WEST
 *
 * and, four lines later, forbids ever presenting a tide report as a prediction.
 * Those two things cannot both be honoured with the word "storm" in the
 * headline, so the card keeps the SHAPE — one headline, one direction, one
 * arrow, a `DETAILS` disclosure — and says the true thing instead:
 *
 *      TIDE REPORT
 *      Crowd building:  ← WEST
 *      Where players are betting. The storm ignores it.
 *
 * That is worth reading, because where the crowd sits genuinely changes what a
 * survivor is paid. It is just not worth reading as a forecast, and the copy
 * says so in the same breath rather than in a footnote.
 *
 * Geometry comes from `coveLayout.ts`, which is the same source the board and
 * the harbor cards use — the direction on the card is the direction on screen.
 */
import { ZONE_COUNT, type TideBand, type TideReportEntry } from '@landfall/core';

export type TideAxis = 'WEST' | 'EAST' | 'NORTH' | 'SOUTH' | 'EVEN';

export interface TideDirection {
  axis: TideAxis;
  /** Arrow pointing the way the card names, for the beginner headline. */
  arrow: string;
  /** 0..1 — how lopsided the table is. Drives the bar, never a probability. */
  strength: number;
  /** Harbor indices making up the named side, for the board's highlight. */
  zones: number[];
  /** Plain-language headline, ≤ 3 words. */
  headline: string;
}

/**
 * Relative crowd weight of a band. These are the SAME representative ratios
 * core/tide.ts already publishes for the payout estimate, so the card and the
 * estimate can never tell different stories about the same report.
 */
const BAND_WEIGHT: Record<TideBand, number> = {
  seed: 0.25,
  light: 0.5,
  medium: 1.0,
  heavy: 1.5,
  packed: 2.2,
};

/**
 * Board geometry, mirrored from `coveLayout.ts`:
 *
 *   harbor 1 · 2      north row      (west, east)
 *   harbor 3 · 4      middle row     (west, east)
 *   harbor 5 · 6      south row      (west, east)
 *
 * Both the landscape and the portrait layouts use this ordering, which is why a
 * player moving between phone and desktop finds "west" in the same place.
 */
const WEST = [0, 2, 4];
const EAST = [1, 3, 5];
const NORTH = [0, 1];
const SOUTH = [4, 5];

/** Below this the table is genuinely even and the card says so. */
const EVEN_THRESHOLD = 0.12;

function massOf(weights: readonly number[], zones: readonly number[]): number {
  return zones.reduce((sum, zone) => sum + (weights[zone] ?? 0), 0);
}

/**
 * Reduce a published tide report to the one direction worth a headline.
 *
 * Returns `EVEN` whenever no side is meaningfully ahead — a card that always
 * names a winner would be inventing a signal out of noise, which is the exact
 * failure mode the "information, never a prediction" rule exists to prevent.
 */
export function tideDirection(entries: readonly TideReportEntry[] | undefined): TideDirection {
  const even: TideDirection = {
    axis: 'EVEN',
    arrow: '=',
    strength: 0,
    zones: [],
    headline: 'Evenly spread',
  };
  if (!entries || entries.length === 0) return even;

  const weights = new Array<number>(ZONE_COUNT).fill(0);
  for (const entry of entries) {
    if (entry.zone < 0 || entry.zone >= ZONE_COUNT) continue;
    weights[entry.zone] = BAND_WEIGHT[entry.band] ?? 0;
  }
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return even;

  // Two independent axes; the more lopsided one gets the headline. Comparing
  // east/west against north/south directly would be unfair to the vertical
  // axis, which has four harbors in play and two on each named side.
  const westShare = massOf(weights, WEST) / total;
  const eastShare = 1 - westShare;
  const northMass = massOf(weights, NORTH);
  const southMass = massOf(weights, SOUTH);
  const vertical = northMass + southMass;
  const northShare = vertical > 0 ? northMass / vertical : 0.5;

  const horizontalLean = Math.abs(westShare - 0.5) * 2;
  const verticalLean = vertical > 0 ? Math.abs(northShare - 0.5) * 2 : 0;

  if (Math.max(horizontalLean, verticalLean) < EVEN_THRESHOLD) return even;

  if (horizontalLean >= verticalLean) {
    const west = westShare > eastShare;
    return {
      axis: west ? 'WEST' : 'EAST',
      arrow: west ? '←' : '→',
      strength: Math.min(1, horizontalLean),
      zones: west ? [...WEST] : [...EAST],
      headline: 'Crowd building',
    };
  }
  const north = northShare > 0.5;
  return {
    axis: north ? 'NORTH' : 'SOUTH',
    arrow: north ? '↑' : '↓',
    strength: Math.min(1, verticalLean),
    zones: north ? [...NORTH] : [...SOUTH],
    headline: 'Crowd building',
  };
}

/**
 * The one-line reading for the beginner card. Kept here rather than in the
 * component so the wording is testable and translatable in one place.
 */
export function tideSentence(direction: TideDirection): string {
  if (direction.axis === 'EVEN') {
    return 'Players are spread evenly across the six harbors.';
  }
  const heavy = direction.strength > 0.45 ? 'Most' : 'More';
  return `${heavy} of the money is sitting in the ${direction.axis.toLowerCase()} harbors.`;
}

/**
 * The disclaimer, stated on the card itself and never in a footnote. It is one
 * sentence because a beginner will read one sentence.
 */
export const TIDE_DISCLAIMER = 'Where players are betting — not where the storm will hit.';
