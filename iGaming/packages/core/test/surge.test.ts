import { describe, expect, it } from 'vitest';
import {
  SURGE_PROB,
  ZONE_COUNT,
  drawZone,
  pickGoldenAnchor,
  roundSeed,
  type StakeEntry,
} from '../src/index.js';

const TERMINAL = 'b'.repeat(64);
const SEED = roundSeed(TERMINAL, 100, 1);

describe('storm surge trigger', () => {
  it('fires at approximately SURGE_PROB over many rounds', () => {
    const N = 60_000;
    let hits = 0;
    for (let i = 0; i < N; i++) {
      if (drawZone(SEED, i, ZONE_COUNT).uSurge < SURGE_PROB) hits++;
    }
    const rate = hits / N;
    // 1/25 = 0.04; allow generous band (σ ≈ 0.0008 at this N).
    expect(rate).toBeGreaterThan(0.033);
    expect(rate).toBeLessThan(0.047);
  });

  it('surge rolls are independent of the struck zone (disjoint digest spans)', () => {
    // Regression guard: deriving both from the same span would correlate them.
    const byZone: number[] = new Array(ZONE_COUNT).fill(0);
    const surgeByZone: number[] = new Array(ZONE_COUNT).fill(0);
    for (let i = 0; i < 30_000; i++) {
      const d = drawZone(SEED, i, ZONE_COUNT);
      byZone[d.struckZone]!++;
      if (d.uSurge < SURGE_PROB) surgeByZone[d.struckZone]!++;
    }
    for (let z = 0; z < ZONE_COUNT; z++) {
      const conditional = surgeByZone[z]! / byZone[z]!;
      expect(Math.abs(conditional - SURGE_PROB)).toBeLessThan(0.015);
    }
  });
});

describe('golden anchor pick', () => {
  const stakes: StakeEntry[] = [
    { id: 'a', zone: 0, amountMinor: 100, isHouseSeed: false },
    { id: 'b', zone: 1, amountMinor: 300, isHouseSeed: false },
    { id: 'c', zone: 2, amountMinor: 600, isHouseSeed: false },
    { id: 'house-0', zone: 0, amountMinor: 5000, isHouseSeed: true },
  ];

  it('is deterministic and excludes house seeds and the struck zone', () => {
    const w1 = pickGoldenAnchor(stakes, 5, 0.5);
    const w2 = pickGoldenAnchor(stakes, 5, 0.5);
    expect(w1).toEqual(w2);
    expect(w1!.isHouseSeed).toBe(false);
    // struck zone 1 excludes 'b'
    const w3 = pickGoldenAnchor(stakes, 1, 0.0);
    expect(w3!.id).toBe('a'); // first by id among survivors a,c at roll 0
  });

  it('weights winners by stake size', () => {
    // survivors: a=100, b=300, c=600 (struck zone 5, none struck) — total 1000.
    let counts = { a: 0, b: 0, c: 0 };
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      const u = drawZone(SEED, i, ZONE_COUNT).uWinner; // reuse uniform stream
      const w = pickGoldenAnchor(stakes, 5, u)!;
      counts[w.id as 'a' | 'b' | 'c']++;
    }
    expect(counts.a / N).toBeGreaterThan(0.08);
    expect(counts.a / N).toBeLessThan(0.12); // ≈ 0.10
    expect(counts.b / N).toBeGreaterThan(0.27);
    expect(counts.b / N).toBeLessThan(0.33); // ≈ 0.30
    expect(counts.c / N).toBeGreaterThan(0.57);
    expect(counts.c / N).toBeLessThan(0.63); // ≈ 0.60
  });

  it('returns null (pot rolls over) when no player stake survives', () => {
    const onlyHouse: StakeEntry[] = [
      { id: 'house-0', zone: 0, amountMinor: 5000, isHouseSeed: true },
      { id: 'p', zone: 3, amountMinor: 700, isHouseSeed: false },
    ];
    expect(pickGoldenAnchor(onlyHouse, 3, 0.4)).toBeNull();
  });
});
