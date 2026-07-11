import { describe, expect, it } from 'vitest';
import {
  SURGE_PROB,
  ZONE_COUNT,
  chainCommitment,
  drawZone,
  pickGoldenAnchor,
  pickGoldenAnchorFlat,
  roundSeed,
  verifyRound,
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

describe('flat-odds golden anchor (A4)', () => {
  const stakes: StakeEntry[] = [
    { id: 'a', zone: 0, amountMinor: 100, isHouseSeed: false },
    { id: 'b', zone: 1, amountMinor: 300, isHouseSeed: false },
    { id: 'c', zone: 2, amountMinor: 600, isHouseSeed: false },
    { id: 'house-0', zone: 0, amountMinor: 5000, isHouseSeed: true },
  ];

  it('gives every surviving stake EQUAL odds regardless of size', () => {
    let counts = { a: 0, b: 0, c: 0 };
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      const u = drawZone(SEED, i, ZONE_COUNT).uWinner;
      const w = pickGoldenAnchorFlat(stakes, 5, u)!;
      counts[w.id as 'a' | 'b' | 'c']++;
    }
    // 1/3 each within a generous band.
    for (const share of [counts.a / N, counts.b / N, counts.c / N]) {
      expect(share).toBeGreaterThan(0.3);
      expect(share).toBeLessThan(0.37);
    }
  });

  it('keeps the same eligibility rules (no house seeds, no struck zone, null on empty)', () => {
    const w = pickGoldenAnchorFlat(stakes, 1, 0.0); // struck zone 1 excludes 'b'
    expect(w!.id).toBe('a');
    expect(w!.isHouseSeed).toBe(false);
    const onlyHouse: StakeEntry[] = [
      { id: 'house-0', zone: 0, amountMinor: 5000, isHouseSeed: true },
    ];
    expect(pickGoldenAnchorFlat(onlyHouse, 3, 0.4)).toBeNull();
  });

  it('verifyRound recomputes the winner under both modes', () => {
    // Find a surging round in the deterministic stream, then check the verifier
    // agrees with each picker exactly when the matching mode flag is passed.
    let roundId = 0;
    for (let i = 0; i < 5_000; i++) {
      if (drawZone(SEED, i, ZONE_COUNT).uSurge < SURGE_PROB) {
        roundId = i;
        break;
      }
    }
    const draw = drawZone(SEED, roundId, ZONE_COUNT);
    const weighted = pickGoldenAnchor(stakes, draw.struckZone, draw.uWinner);
    const flat = pickGoldenAnchorFlat(stakes, draw.struckZone, draw.uWinner);
    const base = {
      roundId,
      seedHex: SEED,
      prevChainValue: chainCommitment(TERMINAL, 100), // SHA256(SEED) — valid link
      announcedStruckZone: draw.struckZone,
      zoneCount: ZONE_COUNT,
      rake: 0.12,
      stakes,
      surgeProb: SURGE_PROB,
      announcedSurge: true,
    };
    const vWeighted = verifyRound({
      ...base,
      surgeFlatOdds: false,
      announcedSurgeWinnerStakeId: weighted?.id ?? null,
    });
    expect(vWeighted.surgeOk).toBe(true);
    const vFlat = verifyRound({
      ...base,
      surgeFlatOdds: true,
      announcedSurgeWinnerStakeId: flat?.id ?? null,
    });
    expect(vFlat.surgeOk).toBe(true);
    // Cross-mode mismatch must FAIL verification whenever the picks differ.
    if (weighted?.id !== flat?.id) {
      const vWrong = verifyRound({
        ...base,
        surgeFlatOdds: true,
        announcedSurgeWinnerStakeId: weighted?.id ?? null,
      });
      expect(vWrong.surgeOk).toBe(false);
    }
  });
});
