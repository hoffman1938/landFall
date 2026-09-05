import { describe, expect, it } from 'vitest';
import {
  HANDLE_EMA_ALPHA,
  HANDLE_EMA_ALPHA_FALLING,
  LIQUIDITY_FLOOR_MINOR,
  LIQUIDITY_MIN_SEED_MINOR,
  HOUSE_SEED_MINOR,
  RAKE,
  ZONE_COUNT,
  houseSeedPerZone,
  liquidityLevel,
  settleRound,
  updateHandleEma,
  type LiquidityPolicy,
  type StakeEntry,
} from '../src/index.js';

const POLICY: LiquidityPolicy = {
  floorMinor: LIQUIDITY_FLOOR_MINOR,
  minSeedMinor: LIQUIDITY_MIN_SEED_MINOR,
  maxSeedMinor: HOUSE_SEED_MINOR,
};

describe('adaptive house seed', () => {
  it('a dead table gets the full ceiling seed (old fixed-seed behaviour)', () => {
    expect(houseSeedPerZone(POLICY, 0, ZONE_COUNT)).toBe(HOUSE_SEED_MINOR);
  });

  it('falls to the token seed once real handle reaches the floor', () => {
    expect(houseSeedPerZone(POLICY, LIQUIDITY_FLOOR_MINOR, ZONE_COUNT)).toBe(
      LIQUIDITY_MIN_SEED_MINOR,
    );
    expect(houseSeedPerZone(POLICY, LIQUIDITY_FLOOR_MINOR * 10, ZONE_COUNT)).toBe(
      LIQUIDITY_MIN_SEED_MINOR,
    );
  });

  it('is monotonically non-increasing in handle — more players never means more seed', () => {
    let previous = Infinity;
    for (let handle = 0; handle <= LIQUIDITY_FLOOR_MINOR * 2; handle += 500) {
      const seed = houseSeedPerZone(POLICY, handle, ZONE_COUNT);
      expect(seed).toBeLessThanOrEqual(previous);
      previous = seed;
    }
  });

  it('tops the table up to the floor while it is thin', () => {
    const handle = LIQUIDITY_FLOOR_MINOR / 2;
    const seed = houseSeedPerZone(POLICY, handle, ZONE_COUNT);
    // house contribution + real handle covers the floor (ceil rounding only up)
    expect(seed * ZONE_COUNT + handle).toBeGreaterThanOrEqual(LIQUIDITY_FLOOR_MINOR);
  });

  it('stays within [minSeed, maxSeed] and integral for any input', () => {
    for (const handle of [-1, 0, 1, 37, 999_999_99]) {
      const seed = houseSeedPerZone(POLICY, handle, ZONE_COUNT);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(LIQUIDITY_MIN_SEED_MINOR);
      expect(seed).toBeLessThanOrEqual(HOUSE_SEED_MINOR);
    }
  });

  it('never exceeds the ceiling when the policy is degenerate (min > max)', () => {
    const seed = houseSeedPerZone(
      { floorMinor: 1_000_00, minSeedMinor: 900_00, maxSeedMinor: 5_00 },
      0,
      ZONE_COUNT,
    );
    expect(seed).toBe(5_00);
  });
});

describe('handle EMA', () => {
  it('adopts the first observation outright', () => {
    expect(updateHandleEma(null, 1_234)).toBe(1_234);
  });

  it('converges towards a steady handle', () => {
    let ema = updateHandleEma(null, 0);
    for (let i = 0; i < 40; i++) ema = updateHandleEma(ema, 10_000);
    expect(ema).toBeGreaterThan(9_900);
    expect(ema).toBeLessThanOrEqual(10_000);
  });

  it('moves by the rising alpha towards a growing handle', () => {
    expect(updateHandleEma(1_000, 2_000)).toBe(Math.round(1_000 + HANDLE_EMA_ALPHA * 1_000));
  });

  it('treats a nonsensical negative handle as zero, and never returns negative', () => {
    // Clamped on the INPUT: a negative handle cannot exist, so it is read as an
    // empty round and decays the estimate at the falling rate.
    expect(updateHandleEma(100, -100_000)).toBe(updateHandleEma(100, 0));
    expect(updateHandleEma(100, -100_000)).toBeGreaterThanOrEqual(0);
  });

  it('falls faster than it rises, so an emptying room re-seeds quickly', () => {
    expect(HANDLE_EMA_ALPHA_FALLING).toBeGreaterThan(HANDLE_EMA_ALPHA);
    const up = updateHandleEma(10_000, 20_000) - 10_000;
    const down = 10_000 - updateHandleEma(10_000, 0);
    expect(down / 10_000).toBeGreaterThan(up / 10_000);
  });

  it('a busy room going empty restores a protective seed within two rounds', () => {
    // math-model §6: a newly-solo player needs the seed back up promptly.
    let ema: number | null = LIQUIDITY_FLOOR_MINOR * 3;
    expect(houseSeedPerZone(POLICY, ema, ZONE_COUNT)).toBe(LIQUIDITY_MIN_SEED_MINOR);
    ema = updateHandleEma(ema, 0);
    ema = updateHandleEma(ema, 0);
    expect(houseSeedPerZone(POLICY, ema, ZONE_COUNT)).toBeGreaterThan(LIQUIDITY_MIN_SEED_MINOR * 5);
  });
});

/**
 * The point of the whole change: a thin table must produce DISPERSED payouts.
 * The pari-mutuel mean is fixed at (1−RAKE)/(K−1) whatever we do, so the only
 * lever is how far individual rounds swing around it — and a large flat house
 * seed averages that swing away.
 */
describe('seed size drives payout dispersion on a thin table', () => {
  function spreadPp(seedMinor: number): number {
    const stakeMinor = 1_00;
    const gains: number[] = [];
    for (let struck = 0; struck < ZONE_COUNT; struck++) {
      const stakes: StakeEntry[] = [];
      for (let z = 0; z < ZONE_COUNT; z++) {
        stakes.push({ id: `h${z}`, zone: z, amountMinor: seedMinor, isHouseSeed: true });
      }
      stakes.push({ id: 'me', zone: 0, amountMinor: stakeMinor, isHouseSeed: false });
      // four other fleets, deliberately lopsided across two coves
      stakes.push({ id: 'a', zone: 1, amountMinor: 5_00, isHouseSeed: false });
      stakes.push({ id: 'b', zone: 1, amountMinor: 8_00, isHouseSeed: false });
      stakes.push({ id: 'c', zone: 2, amountMinor: 2_00, isHouseSeed: false });
      stakes.push({ id: 'd', zone: 4, amountMinor: 1_00, isHouseSeed: false });
      const mine = settleRound(stakes, struck, RAKE).lines.find((l) => l.id === 'me')!;
      if (mine.outcome !== 'WRECKED') gains.push((mine.salvageMinor / stakeMinor) * 100);
    }
    return Math.max(...gains) - Math.min(...gains);
  }

  it('a token seed spreads payouts far wider than the old flat 50.00 seed', () => {
    const flat = spreadPp(HOUSE_SEED_MINOR);
    const adaptive = spreadPp(LIQUIDITY_MIN_SEED_MINOR);
    // Measured at the time of writing: 6.0pp flat vs 133.0pp adaptive on the
    // same five fleets. Asserted as a ratio, not a magic number, so a future
    // rake or ladder change cannot silently break the intent.
    expect(flat).toBeLessThan(10);
    expect(adaptive).toBeGreaterThan(flat * 10);
  });
});

describe('lobby liquidity hint', () => {
  it('bands population without ever touching odds', () => {
    expect(liquidityLevel(0)).toBe('quiet');
    expect(liquidityLevel(2)).toBe('quiet');
    expect(liquidityLevel(3)).toBe('filling');
    expect(liquidityLevel(7)).toBe('filling');
    expect(liquidityLevel(8)).toBe('busy');
    expect(liquidityLevel(500)).toBe('busy');
  });
});
