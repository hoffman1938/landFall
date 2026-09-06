/**
 * The storm reticle must never park.
 *
 * Regression cover for the frozen-reticle bug: the two published feints are
 * independent mod-6 picks and collide on the same zone ~16.6% of rounds, and
 * the scene used to alternate between them unconditionally — so on those rounds
 * both legs resolved to the same point and the reticle sat still for the whole
 * locked window before the storm struck elsewhere.
 */
import { describe, expect, it } from 'vitest';
import {
  FEINT_DWELL_MS,
  neutralStop,
  stormRoute,
  stormRouteStop,
  type Point,
} from '../src/stormPath';

const W = 1200;
const H = 800;
const NEUTRAL = neutralStop(W, H);

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

const distinct = (route: readonly Point[]) =>
  new Set(route.map((p) => `${p.x},${p.y}`)).size;

describe('stormRoute', () => {
  it('patrols between two published feints', () => {
    const route = stormRoute([1, 4], zoneStop, NEUTRAL);
    expect(route).toEqual([ZONE_STOPS[1], ZONE_STOPS[4]]);
  });

  it('never parks when the digest publishes the same zone twice', () => {
    for (let zone = 0; zone < ZONE_STOPS.length; zone++) {
      const route = stormRoute([zone, zone], zoneStop, NEUTRAL);
      expect(route).toHaveLength(2);
      expect(distinct(route)).toBe(2);
    }
  });

  it('never invents a second zone — the collision stop is off-harbour', () => {
    const route = stormRoute([2, 2], zoneStop, NEUTRAL);
    expect(route[0]).toEqual(ZONE_STOPS[2]);
    expect(route[1]).toEqual(NEUTRAL);
    // The published path is verifiable, so the animation may only visit the
    // zones in it. The holding point must not coincide with any other zone.
    for (const stop of ZONE_STOPS) {
      if (stop === ZONE_STOPS[2]) continue;
      expect(route[1]).not.toEqual(stop);
    }
  });

  it('still yields two stops when a zone has no layout yet', () => {
    const route = stormRoute([0, 99], zoneStop, NEUTRAL);
    expect(route).toHaveLength(2);
    expect(distinct(route)).toBe(2);
  });

  it('holds every stop for the dwell and then advances', () => {
    const route = stormRoute([1, 4], zoneStop, NEUTRAL);
    expect(stormRouteStop(route, 0)).toEqual(ZONE_STOPS[1]);
    expect(stormRouteStop(route, FEINT_DWELL_MS - 1)).toEqual(ZONE_STOPS[1]);
    expect(stormRouteStop(route, FEINT_DWELL_MS)).toEqual(ZONE_STOPS[4]);
    expect(stormRouteStop(route, 2 * FEINT_DWELL_MS)).toEqual(ZONE_STOPS[1]);
  });

  it('moves at least once inside a 5s locked window, feints colliding or not', () => {
    const stormMs = 5_000;
    for (const feints of [[1, 4], [3, 3]] as const) {
      const route = stormRoute(feints, zoneStop, NEUTRAL);
      const seen = new Set<string>();
      for (let t = 0; t < stormMs; t += 100) {
        const stop = stormRouteStop(route, t);
        if (stop) seen.add(`${stop.x},${stop.y}`);
      }
      expect(seen.size).toBeGreaterThan(1);
    }
  });

  it('clamps a negative elapsed time to the first stop', () => {
    const route = stormRoute([1, 4], zoneStop, NEUTRAL);
    expect(stormRouteStop(route, -500)).toEqual(ZONE_STOPS[1]);
  });

  it('keeps the holding point clear of the centre readout', () => {
    // The countdown owns the middle of the board; the holding point sits above it.
    expect(NEUTRAL.y).toBeLessThan(H / 2);
    expect(NEUTRAL.x).toBe(W / 2);
  });
});
