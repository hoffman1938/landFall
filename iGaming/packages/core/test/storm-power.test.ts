import { describe, expect, it } from 'vitest';
import {
  RAKE,
  RAKE_SPLIT,
  STORM_POWER_LADDER,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  ZONE_COUNT,
  drawZone,
  roundSeed,
  settleRound,
  stormPowerFromRoll,
  type StakeEntry,
} from '../src/index.js';

const SPACE = 2 ** 20;

describe('storm power ladder v2', () => {
  it('probabilities fill the 20-bit space exactly and no tier is below ×1', () => {
    let prev = 0;
    for (const tier of STORM_POWER_LADDER) {
      const count = tier.cumBound - prev;
      expect(count).toBeGreaterThan(0);
      // Floor is ×1: a survivor's salvage is never reduced (A2).
      expect(tier.mNum).toBeGreaterThanOrEqual(tier.mDen);
      prev = tier.cumBound;
    }
    expect(prev).toBe(SPACE); // ladder covers the space exactly
  });

  it('expected overpayment is funded by the Storm Reserve (exact integer arithmetic)', () => {
    // Funding invariant (A2, replaces E[M]=1):
    //   E[M−1] × E[distributable] ≤ stormReserve share of expected rake
    // With E[P_struck] = T/K and distributable = (1−RAKE)·P_struck this reduces to
    //   E[M−1] × (1−RAKE) ≤ RAKE_SPLIT.stormReserve × RAKE
    // Checked exactly with BigInt cross-multiplication — no floats.
    //   LHS: Σ count_i (mNum_i − mDen_i)/mDen_i  as a fraction lhsNum/lhsDen
    //   RHS: (reserveNum/reserveDen)(rakeNum/rakeDen)/((rakeDen−rakeNum)/rakeDen) × 2^20
    let lhsNum = 0n;
    let lhsDen = 1n;
    let prev = 0;
    for (const tier of STORM_POWER_LADDER) {
      const count = BigInt(tier.cumBound - prev);
      const num = count * BigInt(tier.mNum - tier.mDen);
      const den = BigInt(tier.mDen);
      lhsNum = lhsNum * den + num * lhsDen;
      lhsDen *= den;
      prev = tier.cumBound;
    }
    // Constants as exact integer ratios (both are round decimal fractions).
    const rakeNum = BigInt(Math.round(RAKE * 10_000));
    const rakeDen = 10_000n;
    const reserveNum = BigInt(Math.round(RAKE_SPLIT.stormReserve * 10_000));
    const reserveDen = 10_000n;
    // lhsNum/lhsDen ≤ reserveNum·rakeNum·2^20 / (reserveDen·(rakeDen−rakeNum))
    const lhs = lhsNum * reserveDen * (rakeDen - rakeNum);
    const rhs = reserveNum * rakeNum * BigInt(SPACE) * lhsDen;
    expect(lhs <= rhs).toBe(true);
    // ...and the budget is actually used (the ladder is not degenerate ×1-only):
    // at least 99% utilization keeps the felt bonus honest.
    expect(lhs * 100n >= rhs * 99n).toBe(true);
  });

  it('keeps the felt storm bonus (~1 in 10) and the marketable tail', () => {
    const bonusCount = SPACE - STORM_POWER_LADDER[0]!.cumBound; // everything above Category 1
    const pBonus = bonusCount / SPACE;
    expect(pBonus).toBeGreaterThan(1 / 13);
    expect(pBonus).toBeLessThan(1 / 9);
    const top = STORM_POWER_LADDER[STORM_POWER_LADDER.length - 1]!;
    expect(top.mNum / top.mDen).toBeGreaterThanOrEqual(100);
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
    expect((counts.get('Category 1') ?? 0) / N).toBeGreaterThan(0.9);
    expect((counts.get('Category 1') ?? 0) / N).toBeLessThan(0.922);
    expect((counts.get('Category 2') ?? 0) / N).toBeGreaterThan(0.07);
    expect((counts.get('Category 2') ?? 0) / N).toBeLessThan(0.09);
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

  it('multiplies salvage exactly and reports the reserve draw (×25)', () => {
    const r = settleRound(stakes, 0, RAKE, { mNum: 25, mDen: 1 });
    // struck pool 15000, rake 1800, distributable 13200, salvage total 330000
    expect(r.salvageTotalMinor).toBe(330_000);
    expect(r.houseDeltaMinor).toBe(330_000 - 13_200);
    expect(r.powerCapped).toBe(false);
    // 1-credit stake: share = 330000 × 100/7100 ≈ 4647 → ~46 credits from 1.00
    const c = r.lines.find((l) => l.id === 'c')!;
    expect(c.payoutMinor).toBeGreaterThan(4_700);
    // conservation with delta holds (asserted internally, checked explicitly here);
    // handle = 5000+5000+10000+2000+100 = 22100
    const paid = r.lines.reduce((s, l) => s + l.payoutMinor, 0);
    expect(paid + r.rakeMinor).toBe(22_100 + r.houseDeltaMinor);
  });

  it('Category 2 (×5/4) pays exactly +25% salvage with exact integer math', () => {
    const r = settleRound(stakes, 0, RAKE, { mNum: 5, mDen: 4 });
    // distributable 13200 → ×1.25 = 16500 exactly
    expect(r.salvageTotalMinor).toBe(16_500);
    expect(r.houseDeltaMinor).toBe(16_500 - 13_200);
    for (const l of r.lines) {
      if (l.outcome === 'SAFE') expect(l.payoutMinor).toBeGreaterThan(l.amountMinor);
    }
  });

  it('default power ×1 keeps the original identity (zero delta)', () => {
    const r = settleRound(stakes, 0, RAKE);
    expect(r.houseDeltaMinor).toBe(0);
    expect(r.salvageTotalMinor).toBe(r.distributedMinor);
    expect(r.powerCapped).toBe(false);
  });

  /**
   * A whale pool at a QUARTER of the handle used to clamp, because the cap was
   * 25× handle. It no longer does: the cap is 150× (rules v2), derived so every
   * advertised tier pays in full while the struck harbor holds up to twice its
   * uniform share. See test/compliance.test.ts for the GLI §4.4.1(f) invariant
   * that forced the change.
   */
  it('pays a Perfect Storm in full on a quarter-of-handle struck pool (rules v2)', () => {
    const whalePool: StakeEntry[] = [
      { id: 'h0', zone: 0, amountMinor: 5_000, isHouseSeed: true },
      { id: 'h1', zone: 1, amountMinor: 5_000, isHouseSeed: true },
      { id: 'h2', zone: 2, amountMinor: 5_000, isHouseSeed: true },
      { id: 'h3', zone: 3, amountMinor: 5_000, isHouseSeed: true },
      { id: 'h4', zone: 4, amountMinor: 5_000, isHouseSeed: true },
      { id: 'h5', zone: 5, amountMinor: 5_000, isHouseSeed: true },
      { id: 'w', zone: 0, amountMinor: 45_000, isHouseSeed: false },
      { id: 'a', zone: 1, amountMinor: 50_000, isHouseSeed: false },
      { id: 'b', zone: 2, amountMinor: 50_000, isHouseSeed: false },
      { id: 'c', zone: 3, amountMinor: 25_000, isHouseSeed: false },
    ];
    const handle = whalePool.reduce((a, s) => a + s.amountMinor, 0);
    expect(handle).toBe(200_000);
    const r = settleRound(
      whalePool,
      0,
      RAKE,
      { mNum: 500, mDen: 1 },
      STORM_POWER_MAX_PAYOUT_MULTIPLE * handle,
    );
    expect(r.rakeMinor).toBe(6_000);
    expect(r.powerCapped).toBe(false);
    // distributable 44,000 × 500 paid in full — the advertised award, actually paid.
    expect(r.salvageTotalMinor).toBe(22_000_000);
    const paid = r.lines.reduce((s, l) => s + l.payoutMinor, 0);
    expect(paid + r.rakeMinor).toBe(handle + r.houseDeltaMinor);
  });

  it('clamps to the liability cap on an extreme pool shape and conserves (A3)', () => {
    // handle 200,000; struck pool 100,000 (half the table on one harbor — past
    // the 34.1% share where the 150× cap begins to bind). Nominal ×500 salvage
    // = 44,000,000; cap = 150 × handle = 30,000,000 → clamped, published, conserved.
    const extreme: StakeEntry[] = [
      ...[0, 1, 2, 3, 4, 5].map((z) => ({
        id: `h${z}`,
        zone: z,
        amountMinor: 5_000,
        isHouseSeed: true,
      })),
      { id: 'w', zone: 0, amountMinor: 95_000, isHouseSeed: false },
      { id: 'a', zone: 1, amountMinor: 30_000, isHouseSeed: false },
      { id: 'b', zone: 2, amountMinor: 25_000, isHouseSeed: false },
      { id: 'c', zone: 3, amountMinor: 20_000, isHouseSeed: false },
    ];
    const handle = extreme.reduce((a, s) => a + s.amountMinor, 0);
    expect(handle).toBe(200_000);
    const r = settleRound(
      extreme,
      0,
      RAKE,
      { mNum: 500, mDen: 1 },
      STORM_POWER_MAX_PAYOUT_MULTIPLE * handle,
    );
    expect(r.struckPoolMinor).toBe(100_000);
    expect(r.rakeMinor).toBe(12_000);
    expect(r.powerCapped).toBe(true);
    expect(r.salvageTotalMinor).toBe(30_000_000);
    expect(r.houseDeltaMinor).toBe(30_000_000 - 88_000);
    const paid = r.lines.reduce((s, l) => s + l.payoutMinor, 0);
    expect(paid + r.rakeMinor).toBe(handle + r.houseDeltaMinor);
    // The clamp never cuts below the pari-mutuel base: an absurdly low cap
    // still leaves survivors the full (1−RAKE) pass-through.
    const r2 = settleRound(extreme, 0, RAKE, { mNum: 500, mDen: 1 }, 1_000);
    expect(r2.salvageTotalMinor).toBe(r2.distributedMinor);
  });

  it('conserves under fuzz across all tiers (cap on and off)', () => {
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
      const handle = fz.reduce((a, e) => a + e.amountMinor, 0);
      const cap = trial % 2 === 0 ? STORM_POWER_MAX_PAYOUT_MULTIPLE * handle : undefined;
      // settleRound throws on conservation violation — fuzz passes if no throw
      settleRound(fz, Math.floor(rnd() * ZONE_COUNT), RAKE, { mNum: tier.mNum, mDen: tier.mDen }, cap);
    }
  });
});
