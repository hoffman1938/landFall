import { describe, expect, it } from 'vitest';
import { RAKE, ZONE_COUNT } from '@landfall/core';
import { settleRound, type StakeEntry } from '@landfall/core';
import type { FleetPlanPublic, PoolsState, TideReport } from '@landfall/core';
import { crowdCells, harborOutcomes, outcomeRange, stakeByZone } from '../src/payoutPreview';

const pools = (totals: number[]): PoolsState => ({
  totalsMinor: totals,
  boatCounts: totals.map(() => 1),
});

const focus = (zone: number, stakeMinor: number): FleetPlanPublic => ({
  mode: 'FOCUS',
  primaryZone: zone,
  secondaryZone: null,
  stakeMinor,
});

describe('per-harbor payout preview', () => {
  it('splits a FOCUS stake onto one harbor and a SPLIT 70/30 with the primary floored', () => {
    expect(stakeByZone(focus(2, 500))).toEqual([0, 0, 500, 0, 0, 0]);
    expect(
      stakeByZone({ mode: 'SPLIT', primaryZone: 0, secondaryZone: 3, stakeMinor: 501 }),
    ).toEqual([350, 0, 0, 151, 0, 0]);
  });

  it('returns null until the lock snapshot publishes exact pools', () => {
    expect(harborOutcomes({ pools: null, fleet: focus(0, 500), rakeBp: 1200 })).toBeNull();
    expect(
      harborOutcomes({ pools: pools([1, 2, 3]), fleet: focus(0, 500), rakeBp: 1200 }),
    ).toBeNull();
  });

  it('loses exactly the stake on your own harbor and pays a share on every other', () => {
    const rows = harborOutcomes({
      pools: pools([5000, 3000, 3000, 3000, 3000, 3000]),
      fleet: focus(0, 1000),
      rakeBp: 1200,
    })!;
    expect(rows).toHaveLength(ZONE_COUNT);
    expect(rows[0]!.netMinor).toBe(-1000);
    for (const row of rows.slice(1)) expect(row.netMinor).toBeGreaterThan(0);
    // A crowded harbor hands out more than a quiet one.
    const crowded = harborOutcomes({
      pools: pools([1000, 9000, 3000, 3000, 3000, 3000]),
      fleet: focus(0, 1000),
      rakeBp: 1200,
    })!;
    expect(crowded[1]!.netMinor).toBeGreaterThan(crowded[2]!.netMinor);
  });

  it('matches what settleRound actually pays, to within the leftover-unit pass', () => {
    // Three real fleets plus a house seed on every harbor, then settle for real
    // and compare each harbor's preview against the paid net.
    const stakes: StakeEntry[] = [
      { id: 'me', zone: 1, amountMinor: 700, isHouseSeed: false },
      { id: 'a', zone: 3, amountMinor: 2500, isHouseSeed: false },
      { id: 'b', zone: 3, amountMinor: 1300, isHouseSeed: false },
      ...Array.from({ length: ZONE_COUNT }, (_, zone) => ({
        id: `seed-${zone}`,
        zone,
        amountMinor: 400,
        isHouseSeed: true,
      })),
    ];
    const totals = Array.from({ length: ZONE_COUNT }, (_, zone) =>
      stakes.filter((s) => s.zone === zone).reduce((a, s) => a + s.amountMinor, 0),
    );
    const preview = harborOutcomes({
      pools: pools(totals),
      fleet: focus(1, 700),
      rakeBp: Math.round(RAKE * 10_000),
    })!;

    for (let struck = 0; struck < ZONE_COUNT; struck++) {
      const settled = settleRound(stakes, struck, RAKE);
      const mine = settled.lines.find((l) => l.id === 'me')!;
      const paidNet = mine.payoutMinor - mine.amountMinor;
      const previewed = preview[struck]!.netMinor;
      // Preview floors its share; settlement's largest-remainder pass may add
      // one minor unit on top. Never more, and never in the other direction.
      expect(paidNet - previewed).toBeGreaterThanOrEqual(0);
      expect(paidNet - previewed).toBeLessThanOrEqual(1);
    }
  });

  it('falls back to the core rake when the room did not publish one', () => {
    const withRake = harborOutcomes({
      pools: pools([4000, 2000, 2000, 2000, 2000, 2000]),
      fleet: focus(0, 1000),
      rakeBp: Math.round(RAKE * 10_000),
    })!;
    const without = harborOutcomes({
      pools: pools([4000, 2000, 2000, 2000, 2000, 2000]),
      fleet: focus(0, 1000),
      rakeBp: null,
    })!;
    expect(without).toEqual(withRake);
  });

  it('previews nothing but the crowd when the player has no bet', () => {
    const rows = harborOutcomes({
      pools: pools([4000, 2000, 2000, 2000, 2000, 2000]),
      fleet: null,
      rakeBp: 1200,
    })!;
    expect(rows.every((r) => r.netMinor === 0)).toBe(true);
    expect(rows[0]!.crowdFraction).toBeCloseTo(4000 / 14000);
  });

  it('reports the round-best and round-worst outcome for the rail', () => {
    const rows = harborOutcomes({
      pools: pools([1000, 9000, 3000, 3000, 3000, 3000]),
      fleet: focus(0, 1000),
      rakeBp: 1200,
    });
    const range = outcomeRange(rows)!;
    expect(range.worst).toBe(-1000);
    expect(range.best).toBe(rows![1]!.netMinor);
    expect(outcomeRange(null)).toBeNull();
  });
});

describe('crowd meter', () => {
  const report = (bands: string[]): TideReport => ({
    entries: bands.map((band, zone) => ({
      zone,
      band: band as TideReport['entries'][number]['band'],
      trend: 'stable',
      boatCount: zone,
    })),
    generatedAt: 0,
    frozen: false,
  });

  it('orders cells by harbor and grows with the band', () => {
    const cells = crowdCells(report(['seed', 'light', 'medium', 'heavy', 'packed', 'light']))!;
    expect(cells.map((c) => c.zone)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(cells[0]!.fill).toBeLessThan(cells[1]!.fill);
    expect(cells[3]!.fill).toBeLessThan(cells[4]!.fill);
    expect(cells[4]!.word).toBe('Full');
  });

  it('refuses a partial report rather than drawing a harbor as empty', () => {
    expect(crowdCells(null)).toBeNull();
    expect(crowdCells(report(['seed', 'light', 'medium']))).toBeNull();
  });
});
