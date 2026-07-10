import { describe, expect, it } from 'vitest';
import { RAKE, ZONE_COUNT, settleRound, type StakeEntry } from '../src/index.js';

function mkStakes(perZoneMinor: number[][], seedPerZone = 0): StakeEntry[] {
  const out: StakeEntry[] = [];
  perZoneMinor.forEach((zone, zi) => {
    if (seedPerZone > 0) {
      out.push({ id: `house-${zi}`, zone: zi, amountMinor: seedPerZone, isHouseSeed: true });
    }
    zone.forEach((amt, pi) =>
      out.push({ id: `p-${zi}-${pi}`, zone: zi, amountMinor: amt, isHouseSeed: false }),
    );
  });
  return out;
}

/** Deterministic PRNG for reproducible fuzzing (test-only; production draw is HMAC-based). */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32);
}

describe('pari-mutuel settlement', () => {
  it('worked example from mathematical-model.md §8', () => {
    // Pools: 130/90/250/50/65/215 credits with a 50.00-credit house seed per zone.
    const stakes = mkStakes([[80_00], [40_00], [180_00], [], [15_00], [165_00]], 50_00);
    // The documented observer: 20.00 staked on zone 2 (z2 total = 50 seed + 180 + 20 = 250).
    stakes.push({ id: 'doc-player', zone: 2, amountMinor: 20_00, isHouseSeed: false });
    const r = settleRound(stakes, 1, RAKE);
    expect(r.struckPoolMinor).toBe(90_00);
    expect(r.rakeMinor).toBe(Math.floor(90_00 * RAKE)); // 5.40
    const doc = r.lines.find((l) => l.id === 'doc-player')!;
    // 20 + 84.60 × (20/710) = 22.38 — exact under largest-remainder (verified externally).
    expect(doc.payoutMinor).toBe(22_38);
  });

  it('conserves every minor unit across 5k fuzzed rounds', () => {
    const rand = lcg(12345);
    for (let trial = 0; trial < 5_000; trial++) {
      const perZone: number[][] = Array.from({ length: ZONE_COUNT }, () =>
        Array.from({ length: Math.floor(rand() * 5) }, () => 1_00 + Math.floor(rand() * 499_00)),
      );
      const stakes = mkStakes(perZone, 50_00);
      const struck = Math.floor(rand() * ZONE_COUNT);
      const r = settleRound(stakes, struck, RAKE); // throws internally on violation
      const handle = stakes.reduce((a, s) => a + s.amountMinor, 0);
      const paid = r.lines.reduce((a, l) => a + l.payoutMinor, 0);
      expect(paid + r.rakeMinor).toBe(handle);
    }
  });

  it('distributes rounding remainders by largest fractional remainder (no house dust)', () => {
    // struck pool 100 minor units, rake 6 -> 94 distributable across 3 equal survivors:
    // 94/3 = 31.33..; floors 31+31+31=93, one leftover unit goes to lowest id on tie.
    const stakes: StakeEntry[] = [
      { id: 's-a', zone: 1, amountMinor: 100, isHouseSeed: false },
      { id: 's-b', zone: 2, amountMinor: 100, isHouseSeed: false },
      { id: 's-c', zone: 3, amountMinor: 100, isHouseSeed: false },
      { id: 'x', zone: 0, amountMinor: 100, isHouseSeed: false },
    ];
    const r = settleRound(stakes, 0, RAKE);
    const shares = r.lines.filter((l) => l.outcome === 'SAFE').map((l) => l.salvageMinor);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(94);
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
  });

  it('matches the per-player EV formula on scripted pools (math-model §4)', () => {
    // Pools (minor): whale zone 0 = 60000, zones 1-5 = 4000 each; observer stake 1000 in zone 1.
    // EV_i = (S/K) [ (1-r) * Σ_{j≠i} P_j/(T-P_j) − 1 ]  — compute empirically over all K strikes.
    const perZone = [[59_000], [3_000], [4_000], [4_000], [4_000], [4_000]];
    const stakes = mkStakes(perZone, 0);
    stakes.push({ id: 'obs', zone: 1, amountMinor: 1_000, isHouseSeed: false });
    const T = stakes.reduce((a, s) => a + s.amountMinor, 0);
    const pools = Array.from({ length: ZONE_COUNT }, (_, z) =>
      stakes.filter((s) => s.zone === z).reduce((a, s) => a + s.amountMinor, 0),
    );

    let empiricalNet = 0;
    for (let z = 0; z < ZONE_COUNT; z++) {
      const r = settleRound(stakes, z, RAKE);
      const line = r.lines.find((l) => l.id === 'obs')!;
      empiricalNet += line.payoutMinor - 1_000;
    }
    const empiricalEV = empiricalNet / ZONE_COUNT;

    const sum = pools.reduce((a, p, j) => (j === 1 ? a : a + p / (T - p)), 0);
    const analyticEV = (1_000 / ZONE_COUNT) * ((1 - RAKE) * sum - 1);
    // Integer rounding causes sub-unit deviation only.
    expect(Math.abs(empiricalEV - analyticEV)).toBeLessThan(1);
  });

  it('handles the degenerate no-survivor case without violating conservation', () => {
    const stakes: StakeEntry[] = [{ id: 'only', zone: 2, amountMinor: 500, isHouseSeed: false }];
    const r = settleRound(stakes, 2, RAKE);
    expect(r.lines[0]!.outcome).toBe('WRECKED');
    expect(r.rakeMinor).toBe(500);
  });
});
