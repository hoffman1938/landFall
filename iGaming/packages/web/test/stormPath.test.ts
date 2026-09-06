/**
 * The storm reticle must only ever be on a zone, and must never park.
 *
 * Two reported defects, one file:
 *   - it froze on a single harbour for the whole locked window (the two
 *     published feints are independent mod-6 picks and collide ~16.6% of
 *     rounds, and the scene alternated between them unconditionally);
 *   - the first fix parked it on a neutral point above the board on those
 *     rounds, which put it outside the six zones.
 */
import { describe, expect, it } from 'vitest';
import { ZONE_COUNT } from '@landfall/core';
import {
  FEINT_DWELL_MS,
  stormRoute,
  stormRouteLeg,
  stormRouteStop,
  stormRouteZones,
  type Point,
} from '../src/stormPath';

/** Six stops in two side columns, the way coveLayout lays a wide board out. */
const ZONE_STOPS: Point[] = [
  { x: 204, y: 208 },
  { x: 996, y: 208 },
  { x: 204, y: 400 },
  { x: 996, y: 400 },
  { x: 204, y: 592 },
  { x: 996, y: 592 },
];
const zoneStop = (zone: number): Point | null => ZONE_STOPS[zone] ?? null;
const key = (p: Point) => `${p.x},${p.y}`;

describe('stormRouteZones', () => {
  it('patrols between two published feints', () => {
    expect(stormRouteZones([1, 4], ZONE_COUNT)).toEqual([1, 4]);
  });

  it('never parks when the digest publishes the same zone twice', () => {
    for (let zone = 0; zone < ZONE_COUNT; zone++) {
      const zones = stormRouteZones([zone, zone], ZONE_COUNT);
      expect(zones).toHaveLength(2);
      expect(new Set(zones).size).toBe(2);
    }
  });

  it('only ever names real zones', () => {
    for (let a = 0; a < ZONE_COUNT; a++) {
      for (let b = 0; b < ZONE_COUNT; b++) {
        for (const zone of stormRouteZones([a, b], ZONE_COUNT)) {
          expect(Number.isInteger(zone)).toBe(true);
          expect(zone).toBeGreaterThanOrEqual(0);
          expect(zone).toBeLessThan(ZONE_COUNT);
        }
      }
    }
  });

  it('sends a collided feint to the opposite side of the board', () => {
    expect(stormRouteZones([0, 0], ZONE_COUNT)).toEqual([0, 3]);
    expect(stormRouteZones([4, 4], ZONE_COUNT)).toEqual([4, 1]);
  });

  it('is deterministic — every client draws the same patrol', () => {
    for (let a = 0; a < ZONE_COUNT; a++) {
      for (let b = 0; b < ZONE_COUNT; b++) {
        expect(stormRouteZones([a, b], ZONE_COUNT)).toEqual(stormRouteZones([a, b], ZONE_COUNT));
      }
    }
  });

  it('depends only on the published feints, never on the outcome', () => {
    // Same feints, any struck zone: the route cannot differ, because the struck
    // zone is not an input. Asserted structurally by the signature, and here by
    // the fact that a collided route lands on a zone chosen from the feint alone.
    expect(stormRouteZones([2, 2], ZONE_COUNT)).toEqual([2, 5]);
  });
});

describe('stormRoute', () => {
  it('maps to on-board points and drops zones with no layout yet', () => {
    expect(stormRoute([1, 4], zoneStop, ZONE_COUNT)).toEqual([ZONE_STOPS[1], ZONE_STOPS[4]]);
    expect(stormRoute([1, 4], () => null, ZONE_COUNT)).toEqual([]);
  });

  it('only ever yields positions that are exactly a zone', () => {
    const valid = new Set(ZONE_STOPS.map(key));
    for (let a = 0; a < ZONE_COUNT; a++) {
      for (let b = 0; b < ZONE_COUNT; b++) {
        for (const stop of stormRoute([a, b], zoneStop, ZONE_COUNT)) {
          expect(valid.has(key(stop))).toBe(true);
        }
      }
    }
  });
});

describe('stormRouteStop', () => {
  it('holds every stop for the dwell and then advances', () => {
    const route = stormRoute([1, 4], zoneStop, ZONE_COUNT);
    expect(stormRouteStop(route, 0)).toEqual(ZONE_STOPS[1]);
    expect(stormRouteStop(route, FEINT_DWELL_MS - 1)).toEqual(ZONE_STOPS[1]);
    expect(stormRouteStop(route, FEINT_DWELL_MS)).toEqual(ZONE_STOPS[4]);
    expect(stormRouteStop(route, 2 * FEINT_DWELL_MS)).toEqual(ZONE_STOPS[1]);
  });

  it('clamps a negative elapsed time to the first stop', () => {
    const route = stormRoute([1, 4], zoneStop, ZONE_COUNT);
    expect(stormRouteStop(route, -500)).toEqual(ZONE_STOPS[1]);
  });

  it('moves at least once inside a 5s locked window, feints colliding or not', () => {
    for (const feints of [[1, 4], [3, 3]] as const) {
      const route = stormRoute(feints, zoneStop, ZONE_COUNT);
      const seen = new Set<string>();
      for (let t = 0; t < 5_000; t += 100) {
        const stop = stormRouteStop(route, t);
        if (stop) seen.add(key(stop));
      }
      expect(seen.size).toBeGreaterThan(1);
    }
  });
});

describe('stormRouteLeg', () => {
  it('cycles within the route and never indexes past it', () => {
    for (let t = 0; t < 20_000; t += 137) {
      const leg = stormRouteLeg(2, t);
      expect(leg).toBeGreaterThanOrEqual(0);
      expect(leg).toBeLessThan(2);
    }
  });

  it('is 0 for an empty route rather than NaN', () => {
    expect(stormRouteLeg(0, 4_000)).toBe(0);
  });
});
