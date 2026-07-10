import { describe, expect, it } from 'vitest';
import {
  RAKE,
  STORM_POWER_LADDER,
  ZONE_COUNT,
  drawZone,
  roundSeed,
  settleRound,
  stormPowerFromRoll,
  type StakeEntry,
} from '../src/index.js';

const SPACE = 2 ** 20;

describe('storm power ladder', () => {
  it('probabilities fill the 20-bit space exactly and E[M] = 1 EXACTLY', () => {
    let prev = 0;
    // Exact expected value computed in integer space: sum(count_i * mNum_i / mDen_i).
    // All mDen are 1 or 2, so double-precision arithmetic here is exact.
    let ev = 0;
    for (const tier of STORM_POWER_LADDER) {
      const count = tier.cumBound - prev;
      expect(count).toBeGreaterThan(0);
      ev += (count * tier.mNum) / tier.mDen;
      prev = tier.cumBound;
    }
    expect(prev).toBe(SPACE); // ladder covers the space exactly
    expect(ev).toBe(SPACE); // E[M] = 1 exactly — house edge untouched by the ladder
  });

  it('maps rolls to tiers by cumulative bounds (boundary-exact)', () => {
    expect(stormPowerFromRoll(0).label).toBe('Category 1');
    for (let i = 0; i < STORM_POWER_LADDER.length; i++) {
      const tier = STORM_POWER_LADDER[i]!;
      expect(stormPowerFromRoll(tier.cumBound - 1).label).toBe(tier.label);
      if (i + 1 < STORM_POWER_LADDER.length) {
        expect(stormPowerFromRoll(tier.cumBound).label).toBe(STORM_POWER_LADDER[i + 1]!.label);
      }
    }
    expect(stormPowerFromRoll(SPACE - 1).label).toBe('PERFECT STORM');
  });

  it('empirical tier frequencies match the ladder (60k draws)', () => {
    const seed = roundSeed('c'.repeat(64), 100, 1);
    const counts = new Map<string, number>();
    const N = 60_000;
    for (let i = 0; i < N; i++) {
      const t = stormPowerFromRoll(drawZone(seed, i, ZONE_COUNT).stormPowerRoll);
      counts.set(t.label, (counts.get(t.label) ?? 0) + 1);
    }
    // Common tiers within loose bands; rare tiers just non-negative.
    expect((counts.get('Category 1') ?? 0) / N).toBeGreaterThan(0.68);
    expect((counts.get('Category 1') ?? 0) / N).toBeLessThan(0.72);
    expect((counts.get('Category 3') ?? 0) / N).toBeGreaterThan(0.09);
    expect((counts.get('Category 3') ?? 0) / N).toBeLessThan(0.11);
  });
});

describe('settlement with storm power', () => {
  const stakes: StakeEntry[] = [
    { id: 'h0', zone: 0, amountMinor: 5000, isHouseSeed: true },
    { id: 'h1', zone: 1, amountMinor: 5000, isHouseSeed: true },
    { id: 'a', zone: 0, amountMinor: 10_000, isHouseSeed: false },
    { id: 'b', zone: 1, amountMinor: 2_000, isHouseSeed: false },
    { id: 'c', zone: 2, amountMinor: 1_00, isHouseSeed: false }, // the 1-credit dreamer
  ];

  it('multiplies salvage exactly and reports the house delta (×25)', () => {
    const r = settleRound(stakes, 0, RAKE, { mNum: 25, mDen: 1 });
    // struck pool 15000, rake 900, distributable 14100, salvage total 352500
    expect(r.salvageTotalMinor).toBe(352_500);
    expect(r.houseDeltaMinor).toBe(352_500 - 14_100);
    // 1-credit stake: share = 352500 × 100/7100 ≈ 4965 → ~49.65 credits from 1.00
    const c = r.lines.find((l) => l.id === 'c')!;
    expect(c.payoutMinor).toBeGreaterThan(4_900);
    // conservation with delta holds (asserted internally, checked explicitly here);
    // handle = 5000+5000+10000+2000+100 = 22100
    const paid = r.lines.reduce((s, l) => s + l.payoutMinor, 0);
    expect(paid + r.rakeMinor).toBe(22_100 + r.houseDeltaMinor);
  });

  it('halves salvage on Category 1 (×0.5) with negative house delta, wins stay wins', () => {
    const r = settleRound(stakes, 0, RAKE, { mNum: 1, mDen: 2 });
    expect(r.salvageTotalMinor).toBe(7_050);
    expect(r.houseDeltaMinor).toBe(7_050 - 14_100);
    for (const l of r.lines) {
      if (l.outcome === 'SAFE') expect(l.payoutMinor).toBeGreaterThan(l.amountMinor); // still net-positive
    }
  });

  it('default power ×1 keeps the original identity (zero delta)', () => {
    const r = settleRound(stakes, 0, RAKE);
    expect(r.houseDeltaMinor).toBe(0);
    expect(r.salvageTotalMinor).toBe(r.distributedMinor);
  });

  it('conserves under fuzz across all tiers', () => {
    let s = 424242;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32);
    for (let trial = 0; trial < 2_000; trial++) {
      const fz: StakeEntry[] = [];
      for (let z = 0; z < ZONE_COUNT; z++) {
        fz.push({ id: `hs-${z}`, zone: z, amountMinor: 5000, isHouseSeed: true });
        const n = Math.floor(rnd() * 4);
        for (let i = 0; i < n; i++) {
          fz.push({ id: `p-${z}-${i}`, zone: z, amountMinor: 100 + Math.floor(rnd() * 499_900), isHouseSeed: false });
        }
      }
      const tier = STORM_POWER_LADDER[Math.floor(rnd() * STORM_POWER_LADDER.length)]!;
      // settleRound throws on conservation violation — fuzz passes if no throw
      settleRound(fz, Math.floor(rnd() * ZONE_COUNT), RAKE, { mNum: tier.mNum, mDen: tier.mDen });
    }
  });
});
