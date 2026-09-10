/**
 * What each harbor is worth to YOU — the number the game never showed.
 *
 * LANDFALL is pari-mutuel: the storm's target is a flat 1/6, but the *size* of
 * a win is decided by how the room's money is spread across the six harbors.
 * Until now the player learned that only after the fact, as an unexplained
 * "+0.08" or "+12.40" on an identical 5.00 bet. That is the single largest
 * comprehension gap in the game, and it is entirely a presentation gap: the
 * server already publishes everything needed to state the answer exactly.
 *
 * Two windows, two honest answers:
 *
 *   ANCHOR_OPEN  exact pools are deliberately hidden (anti-probing, tide.ts),
 *                so the board shows the banded crowd meter the server does
 *                publish — relative, never a number.
 *   LOCKED_STORM the lock snapshot publishes exact pools, so every harbor can
 *                show precisely what it pays you if the storm picks it. Six
 *                concrete outcomes, one of which is about to be true.
 *
 * The arithmetic below mirrors `settleRound()` in @landfall/core exactly, with
 * one documented exception: settlement floors every survivor's share and then
 * hands out the leftover minor units by largest fractional remainder, which
 * this module cannot reproduce without the full stake list. A preview is
 * therefore the floored share and can land one minor unit (0.01 credits) below
 * the paid amount, never above. `previewIsLowerBound` states that in one place.
 *
 * Storm Power is NOT applied: its ladder floor is x1 (constants.ts) and the
 * liability cap can never clamp below the x1 base (settlement.ts), so every
 * number here is a floor that a revealed Share x can only raise. That is what
 * makes "at least" the correct word in the UI rather than a hedge.
 */
import { RAKE, SPLIT_PRIMARY_PERCENT, ZONE_COUNT } from '@landfall/core';
import type { FleetPlanPublic, PoolsState, TideBand, TideReport } from '@landfall/core';

/** Preview shares are floored; settlement's remainder pass may add one unit. */
export const previewIsLowerBound = true;

export interface HarborOutcome {
  zone: number;
  /** Total staked on this harbor, house seed included — the bank if it is hit. */
  bankMinor: number;
  /** This harbor's share of the whole room, 0..1 — drives the crowd bar. */
  crowdFraction: number;
  /** Your stake sitting on this harbor. */
  yourStakeMinor: number;
  /** Your signed net change if the storm hits THIS harbor, at Storm Power x1. */
  netMinor: number;
}

/** Your stake per harbor, from the acknowledged order. Zero-filled, length 6. */
export function stakeByZone(fleet: FleetPlanPublic | null | undefined): number[] {
  const stakes = new Array<number>(ZONE_COUNT).fill(0);
  if (!fleet || !Number.isSafeInteger(fleet.stakeMinor) || fleet.stakeMinor <= 0) return stakes;
  const inRange = (z: number) => Number.isInteger(z) && z >= 0 && z < ZONE_COUNT;
  if (!inRange(fleet.primaryZone)) return stakes;
  if (fleet.mode !== 'SPLIT' || fleet.secondaryZone === null || !inRange(fleet.secondaryZone)) {
    stakes[fleet.primaryZone] = fleet.stakeMinor;
    return stakes;
  }
  // Matches coordinator.fleetStakes: the primary floors, the secondary takes
  // the remainder, so an odd-credit split previews the way it settles.
  const primary = Math.floor((fleet.stakeMinor * SPLIT_PRIMARY_PERCENT) / 100);
  stakes[fleet.primaryZone] = (stakes[fleet.primaryZone] ?? 0) + primary;
  stakes[fleet.secondaryZone] = (stakes[fleet.secondaryZone] ?? 0) + fleet.stakeMinor - primary;
  return stakes;
}

/**
 * One row per harbor: its bank, its share of the room, and your net if it is
 * the one struck. `rakeBp` is the room's published rake in basis points.
 */
export function harborOutcomes(input: {
  pools: PoolsState | null;
  fleet: FleetPlanPublic | null;
  rakeBp?: number | null;
}): HarborOutcome[] | null {
  const totals = input.pools?.totalsMinor;
  if (!totals || totals.length !== ZONE_COUNT || totals.some((t) => !Number.isFinite(t) || t < 0)) {
    return null;
  }
  const rake =
    typeof input.rakeBp === 'number' && Number.isFinite(input.rakeBp) && input.rakeBp >= 0
      ? input.rakeBp / 10_000
      : RAKE;
  const handle = totals.reduce((a, b) => a + b, 0);
  const yours = stakeByZone(input.fleet);
  const yourTotal = yours.reduce((a, b) => a + b, 0);

  return totals.map((bankMinor, zone) => {
    const survivorPool = handle - bankMinor;
    const yourSurviving = yourTotal - yours[zone]!;
    const distributable = bankMinor - Math.floor(bankMinor * rake);
    const salvage =
      survivorPool > 0 && yourSurviving > 0
        ? Math.floor((distributable * yourSurviving) / survivorPool)
        : 0;
    return {
      zone,
      bankMinor,
      crowdFraction: handle > 0 ? bankMinor / handle : 0,
      yourStakeMinor: yours[zone]!,
      netMinor: salvage - yours[zone]!,
    };
  });
}

/** The best and worst this round can end for you, across all six harbors. */
export function outcomeRange(
  outcomes: HarborOutcome[] | null,
): { best: number; worst: number } | null {
  if (!outcomes || outcomes.length === 0) return null;
  const nets = outcomes.map((o) => o.netMinor);
  return { best: Math.max(...nets), worst: Math.min(...nets) };
}

/* ------------------------------ crowd meter ------------------------------ */

/**
 * Live-window crowd, from the banded tide report. Bands, not numbers: the
 * server hides exact pools while bets are open on purpose, and a meter that
 * implied precision it does not have would be worse than no meter at all.
 */
export const CROWD_FILL: Record<TideBand, number> = {
  seed: 0.08,
  light: 0.3,
  medium: 0.55,
  heavy: 0.8,
  packed: 1,
};

export const CROWD_WORD: Record<TideBand, string> = {
  seed: 'Empty',
  light: 'Low',
  medium: 'Medium',
  heavy: 'High',
  packed: 'Full',
};

export interface CrowdCell {
  zone: number;
  band: TideBand;
  fill: number;
  word: string;
  boatCount: number;
  /** The report is frozen during Blind Fog; say so rather than showing stale movement. */
  frozen: boolean;
}

export function crowdCells(report: TideReport | null): CrowdCell[] | null {
  if (!report || !Array.isArray(report.entries) || report.entries.length === 0) return null;
  const cells: CrowdCell[] = [];
  for (let zone = 0; zone < ZONE_COUNT; zone++) {
    const entry = report.entries.find((e) => e.zone === zone);
    if (!entry) return null;
    const band = entry.band;
    cells.push({
      zone,
      band,
      fill: CROWD_FILL[band] ?? 0,
      word: CROWD_WORD[band] ?? '',
      boatCount: entry.boatCount,
      frozen: report.frozen === true,
    });
  }
  return cells;
}
