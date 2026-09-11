import { describe, expect, it } from 'vitest';
import {
  RAKE,
  RAKE_SPLIT,
  ZONE_COUNT,
  settleRound,
  validateRakeConfig,
  type StakeEntry,
} from '../src/index.js';

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
    expect(r.rakeMinor).toBe(Math.floor(90_00 * RAKE)); // 10.80
    const doc = r.lines.find((l) => l.id === 'doc-player')!;
    // 20 + 79.20 × (20/710) = 22.23 — exact under largest-remainder (verified externally).
    expect(doc.payoutMinor).toBe(22_23);
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
    // struck pool 100 minor units, rake 12 -> 88 distributable across 3 equal survivors:
    // 88/3 = 29.33..; floors 29+29+29=87, one leftover unit goes to lowest id on tie.
    const stakes: StakeEntry[] = [
      { id: 's-a', zone: 1, amountMinor: 100, isHouseSeed: false },
      { id: 's-b', zone: 2, amountMinor: 100, isHouseSeed: false },
      { id: 's-c', zone: 3, amountMinor: 100, isHouseSeed: false },
      { id: 'x', zone: 0, amountMinor: 100, isHouseSeed: false },
    ];
    const r = settleRound(stakes, 0, RAKE);
    const shares = r.lines.filter((l) => l.outcome === 'SAFE').map((l) => l.salvageMinor);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(88);
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

  /**
   * NOBODY SURVIVED — every stake sat on the harbour the storm hit.
   *
   * This used to book the whole struck pool as rake: a 100% hold on that round,
   * defended as unreachable because the house seeds every harbour. The defence
   * did not hold. `resolveRoomConfig` accepts a room with `seedMinor: 0` — a
   * legitimate pure player-versus-player table, and the cleanest configuration
   * there is under GLI-19 §A.7.1 — and in such a room a crowd that all picks the
   * same harbour reaches exactly this branch. Against a §4.7.1 floor of 75%, it
   * returned nothing.
   *
   * There is no survivor pool, so the pari-mutuel rule has nothing to say and
   * there is nobody to redistribute to. Destroying 88% of the pool and banking
   * 12% expresses no rule at all. The round is a no-op and every bet is returned,
   * which is also what `INTERRUPTION_RULES` already promises for a round that
   * cannot be settled.
   */
  it('returns every bet when no harbour survives, and takes no rake', () => {
    const stakes: StakeEntry[] = [
      { id: 'only', zone: 2, amountMinor: 500, isHouseSeed: false },
      { id: 'also', zone: 2, amountMinor: 1_234, isHouseSeed: false },
    ];
    const r = settleRound(stakes, 2, RAKE);
    expect(r.allStakesRefunded).toBe(true);
    expect(r.rakeMinor).toBe(0);
    expect(r.houseDeltaMinor).toBe(0);
    for (const line of r.lines) expect(line.payoutMinor).toBe(line.amountMinor);
    // Conservation still holds, and the round returns exactly 100%.
    const paid = r.lines.reduce((a, l) => a + l.payoutMinor, 0);
    expect(paid).toBe(1_734);
  });
});

describe('rake restructure (A1)', () => {
  it('holds RAKE/K of handle in expectation over simulated rounds', () => {
    // Expected hold: E[rake] = RAKE × E[P_struck] = RAKE × T/K under the uniform
    // strike. Summing the rake over all K equally likely strike zones makes the
    // expectation exact up to one floor per zone.
    const rand = lcg(777);
    for (let trial = 0; trial < 500; trial++) {
      const perZone: number[][] = Array.from({ length: ZONE_COUNT }, () =>
        Array.from({ length: Math.floor(rand() * 5) }, () => 1_00 + Math.floor(rand() * 499_00)),
      );
      const stakes = mkStakes(perZone, 50_00);
      const handle = stakes.reduce((a, s) => a + s.amountMinor, 0);
      let rakeSum = 0;
      for (let z = 0; z < ZONE_COUNT; z++) rakeSum += settleRound(stakes, z, RAKE).rakeMinor;
      expect(Math.abs(rakeSum - handle * RAKE)).toBeLessThanOrEqual(ZONE_COUNT);
    }
  });

  it('passes survivors exactly (1−RAKE) of the struck pool at ×1', () => {
    const rand = lcg(888);
    for (let trial = 0; trial < 500; trial++) {
      const perZone: number[][] = Array.from({ length: ZONE_COUNT }, () =>
        Array.from({ length: 1 + Math.floor(rand() * 4) }, () => 1_00 + Math.floor(rand() * 99_00)),
      );
      const stakes = mkStakes(perZone, 50_00);
      const struck = Math.floor(rand() * ZONE_COUNT);
      const r = settleRound(stakes, struck, RAKE);
      expect(r.salvageTotalMinor).toBe(r.struckPoolMinor - Math.floor(r.struckPoolMinor * RAKE));
    }
  });

  it('validates rake and split configs (room/env overrides)', () => {
    expect(() => validateRakeConfig(RAKE, RAKE_SPLIT)).not.toThrow();
    expect(() => validateRakeConfig(0.06, RAKE_SPLIT)).not.toThrow();
    expect(() => validateRakeConfig(0.2, RAKE_SPLIT)).not.toThrow();
    expect(() => validateRakeConfig(0.05, RAKE_SPLIT)).toThrow(/outside/);
    expect(() => validateRakeConfig(0.21, RAKE_SPLIT)).toThrow(/outside/);
    expect(() => validateRakeConfig(NaN, RAKE_SPLIT)).toThrow(/outside/);
    expect(() =>
      validateRakeConfig(RAKE, { house: 0.5, surge: 0.3, stormReserve: 0.3 }),
    ).toThrow(/sum to 1/);
    expect(() =>
      validateRakeConfig(RAKE, { house: 1.2, surge: -0.1, stormReserve: -0.1 }),
    ).toThrow(/non-negative/);
  });

  it('split fractions sum to 1 (the shipped default)', () => {
    expect(RAKE_SPLIT.house + RAKE_SPLIT.surge + RAKE_SPLIT.stormReserve).toBe(1);
  });
});
