import { describe, expect, it } from 'vitest';
import {
  chainCommitment,
  drawZone,
  roundSeed,
  verifyChainLink,
  ZONE_COUNT,
} from '../src/index.js';

// Fixed test vector (any 32-byte hex works; determinism is the point).
const TERMINAL = 'a'.repeat(64);
const LEN = 100;

describe('hash chain', () => {
  it('every revealed seed hashes to the previous chain value', () => {
    const commitment = chainCommitment(TERMINAL, LEN);
    let prev = commitment;
    for (let i = 1; i <= LEN; i++) {
      const seed = roundSeed(TERMINAL, LEN, i);
      expect(verifyChainLink(seed, prev)).toBe(true);
      prev = seed;
    }
  });

  it('rejects an out-of-range round index', () => {
    expect(() => roundSeed(TERMINAL, LEN, 0)).toThrow();
    expect(() => roundSeed(TERMINAL, LEN, LEN + 1)).toThrow();
  });

  it('a tampered seed fails the link check', () => {
    const commitment = chainCommitment(TERMINAL, LEN);
    const seed = roundSeed(TERMINAL, LEN, 1);
    const tampered = (seed[0] === '0' ? '1' : '0') + seed.slice(1);
    expect(verifyChainLink(seed, commitment)).toBe(true);
    expect(verifyChainLink(tampered, commitment)).toBe(false);
  });
});

describe('zone draw', () => {
  it('is deterministic from (seed, roundId, K) alone', () => {
    const seed = roundSeed(TERMINAL, LEN, 1);
    const a = drawZone(seed, 42, ZONE_COUNT);
    const b = drawZone(seed, 42, ZONE_COUNT);
    expect(a).toEqual(b);
    expect(drawZone(seed, 43, ZONE_COUNT).digestHex).not.toEqual(a.digestHex);
  });

  it('matches the documented worked example (rng-provably-fair-spec.md)', () => {
    const seed = '3a33cbdcf656ccb1a1d4824ec190c14f26f0fd2d40654e99627ecaf52905dadf';
    const r = drawZone(seed, 1, 6);
    expect(r.digestHex).toBe('3f707085bf42950b8afa2ec4bb9b7884d06bcc23322fa3975e755148040534f0');
    expect(r.struckZone).toBe(1);
    expect(r.feints).toEqual([2, 4]);
    expect(
      verifyChainLink(seed, 'eaa8e7065436b0f713755dc95f41dc5201aa0c4b927dd90524874305ae7e7058'),
    ).toBe(true);
  });

  it('is uniform across zones (chi-square over 60k draws)', () => {
    const N = 60_000;
    const counts = new Array(ZONE_COUNT).fill(0);
    const seed = roundSeed(TERMINAL, LEN, 7);
    for (let i = 0; i < N; i++) counts[drawZone(seed, i, ZONE_COUNT).struckZone]++;
    const expected = N / ZONE_COUNT;
    const chi2 = counts.reduce((a, c) => a + (c - expected) ** 2 / expected, 0);
    // df=5; critical value at p=0.001 is 20.52 — loose to avoid flakiness, still
    // catches real derivation bugs (which fail by orders of magnitude).
    expect(chi2).toBeLessThan(20.52);
  });
});
