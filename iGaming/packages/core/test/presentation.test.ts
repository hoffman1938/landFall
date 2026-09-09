/**
 * The redesign's central safety property, stated as a test:
 *
 *   adding a cinematic reveal, seven weather skins and a cosmetic jitter stream
 *   did not move P(harbor) off 1/6 — not overall, and not inside any tier or
 *   any environment.
 *
 * Everything else here checks that the published tables are the tables that
 * actually fire, so a mis-typed weight can never ship as "roughly right".
 */
import { describe, expect, it } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import {
  ENVIRONMENTS,
  EVENT_TIERS,
  ZONE_COUNT,
  domainDigest,
  drawCosmetic,
  drawEnvironment,
  drawEventTier,
  drawPresentation,
  drawZone,
  environmentFromRoll,
  eventTierFromRoll,
  ppmFrom,
  type EnvironmentId,
  type EventTierId,
} from '../src/index.js';

/** Deterministic season of distinct seeds — one per round, no wall clock. */
function seedFor(i: number): string {
  return bytesToHex(sha256(new TextEncoder().encode(`landfall-presentation-seed-${i}`)));
}

const N = 200_000;

describe('probability tables', () => {
  it('event tier weights sum to exactly 1e6 and are the brief numbers', () => {
    expect(EVENT_TIERS.map((t) => [t.id, t.weightPpm])).toEqual([
      ['CALM', 750_000],
      ['SURGE', 200_000],
      ['TEMPEST', 50_000],
    ]);
    expect(EVENT_TIERS.reduce((a, t) => a + t.weightPpm, 0)).toBe(1_000_000);
  });

  it('environment weights sum to exactly 1e6 and are the brief numbers', () => {
    expect(ENVIRONMENTS.map((e) => [e.id, e.weightPpm])).toEqual([
      ['NORMAL_SEA', 650_000],
      ['RAIN', 200_000],
      ['NIGHT', 80_000],
      ['LIGHTNING', 40_000],
      ['RED_SKY', 20_000],
      ['AURORA', 8_000],
      ['BLACK_FOG', 2_000],
    ]);
    expect(ENVIRONMENTS.reduce((a, e) => a + e.weightPpm, 0)).toBe(1_000_000);
  });

  it('maps boundary rolls to the tier/environment that owns them', () => {
    expect(eventTierFromRoll(0).id).toBe('CALM');
    expect(eventTierFromRoll(749_999).id).toBe('CALM');
    expect(eventTierFromRoll(750_000).id).toBe('SURGE');
    expect(eventTierFromRoll(949_999).id).toBe('SURGE');
    expect(eventTierFromRoll(950_000).id).toBe('TEMPEST');
    expect(eventTierFromRoll(999_999).id).toBe('TEMPEST');

    expect(environmentFromRoll(0).id).toBe('NORMAL_SEA');
    expect(environmentFromRoll(649_999).id).toBe('NORMAL_SEA');
    expect(environmentFromRoll(650_000).id).toBe('RAIN');
    expect(environmentFromRoll(997_999).id).toBe('AURORA');
    expect(environmentFromRoll(998_000).id).toBe('BLACK_FOG');
    expect(environmentFromRoll(999_999).id).toBe('BLACK_FOG');
  });
});

describe('domain separation', () => {
  it('each domain is a different digest over the same seed and round', () => {
    const seed = seedFor(1);
    const digests = new Set(
      ['round', 'event', 'environment', 'cosmetic'].map((d) => domainDigest(seed, d, 42)),
    );
    expect(digests.size).toBe(4);
  });

  it('the harbor draw is byte-identical to the pre-v4 construction', () => {
    // drawZone's message is `landfall:round:<id>`; if that ever drifts, every
    // settled round in the database stops verifying. Pin it.
    const seed = seedFor(2);
    const digest = domainDigest(seed, 'round', 77);
    const draw = drawZone(seed, 77, ZONE_COUNT);
    expect(draw.digestHex).toBe(digest);
  });

  it('ppmFrom stays inside [0, 1e6)', () => {
    for (let i = 0; i < 2_000; i++) {
      const v = ppmFrom(domainDigest(seedFor(i), 'event', i));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1_000_000);
    }
  });
});

describe('observed distributions', () => {
  const tiers = new Map<EventTierId, number>();
  const envs = new Map<EnvironmentId, number>();
  const harborByTier = new Map<EventTierId, number[]>();
  const harborByEnv = new Map<EnvironmentId, number[]>();
  const harborTotals = new Array<number>(ZONE_COUNT).fill(0);

  for (let round = 1; round <= N; round++) {
    const seed = seedFor(round);
    const { eventTier, environment } = drawPresentation(seed, round);
    const struck = drawZone(seed, round, ZONE_COUNT).struckZone;

    tiers.set(eventTier.id, (tiers.get(eventTier.id) ?? 0) + 1);
    envs.set(environment.id, (envs.get(environment.id) ?? 0) + 1);
    harborTotals[struck]! += 1;

    if (!harborByTier.has(eventTier.id)) {
      harborByTier.set(eventTier.id, new Array<number>(ZONE_COUNT).fill(0));
    }
    harborByTier.get(eventTier.id)![struck]! += 1;

    if (!harborByEnv.has(environment.id)) {
      harborByEnv.set(environment.id, new Array<number>(ZONE_COUNT).fill(0));
    }
    harborByEnv.get(environment.id)![struck]! += 1;
  }

  it('event tiers land on their advertised frequencies', () => {
    for (const tier of EVENT_TIERS) {
      const observed = (tiers.get(tier.id) ?? 0) / N;
      const expected = tier.weightPpm / 1_000_000;
      // ~4 standard errors of a binomial at this N.
      const tolerance = 4 * Math.sqrt((expected * (1 - expected)) / N);
      expect(Math.abs(observed - expected)).toBeLessThan(tolerance);
    }
  });

  it('environments land on their advertised frequencies, tail included', () => {
    for (const env of ENVIRONMENTS) {
      const observed = (envs.get(env.id) ?? 0) / N;
      const expected = env.weightPpm / 1_000_000;
      const tolerance = Math.max(4 * Math.sqrt((expected * (1 - expected)) / N), 0.0002);
      expect(Math.abs(observed - expected)).toBeLessThan(tolerance);
    }
    // Black Fog is 1-in-500: it must actually occur, or the tail is decorative.
    expect(envs.get('BLACK_FOG') ?? 0).toBeGreaterThan(0);
  });

  it('every harbor keeps 1/6 overall', () => {
    for (const count of harborTotals) {
      expect(Math.abs(count / N - 1 / 6)).toBeLessThan(0.006);
    }
  });

  it('every harbor keeps 1/6 INSIDE every event tier', () => {
    for (const [tierId, counts] of harborByTier) {
      const total = counts.reduce((a, b) => a + b, 0);
      const tolerance = 5 * Math.sqrt((1 / 6) * (5 / 6) / total);
      for (const count of counts) {
        expect(
          Math.abs(count / total - 1 / 6),
          `harbor skew inside tier ${tierId}`,
        ).toBeLessThan(tolerance);
      }
    }
  });

  it('every harbor keeps 1/6 INSIDE every environment that occurred often enough to judge', () => {
    for (const [envId, counts] of harborByEnv) {
      const total = counts.reduce((a, b) => a + b, 0);
      if (total < 5_000) continue; // the legendary tail cannot be judged at this N
      const tolerance = 5 * Math.sqrt((1 / 6) * (5 / 6) / total);
      for (const count of counts) {
        expect(
          Math.abs(count / total - 1 / 6),
          `harbor skew inside environment ${envId}`,
        ).toBeLessThan(tolerance);
      }
    }
  });
});

describe('determinism', () => {
  it('the same (seed, round) always produces the same presentation', () => {
    for (let round = 1; round <= 500; round++) {
      const seed = seedFor(round);
      const a = drawPresentation(seed, round);
      const b = drawPresentation(seed, round);
      expect(a.eventTier.id).toBe(b.eventTier.id);
      expect(a.environment.id).toBe(b.environment.id);
      expect(a.cosmetic).toEqual(b.cosmetic);
      expect(drawEventTier(seed, round).id).toBe(a.eventTier.id);
      expect(drawEnvironment(seed, round).id).toBe(a.environment.id);
      expect(drawCosmetic(seed, round)).toEqual(a.cosmetic);
    }
  });

  it('the cosmetic stream is a 32-bit seed and a bounded variant', () => {
    for (let round = 1; round <= 1_000; round++) {
      const { seed, variant } = drawCosmetic(seedFor(round), round);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThan(1_000);
    }
  });
});
