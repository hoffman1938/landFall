/**
 * D6 acceptance: the Storm Clock's fog segment matches the actual
 * `fogStartsAt` for all four weather patterns, computed the way the server
 * computes it (coordinator.beginRound):
 *
 *   weatherFogBonus = weather.id === 'HEAVY_FOG' ? 1_000 : 0
 *   fogMs = min(BLIND_FOG_MS + weatherFogBonus, max(0, anchorMs - 500))
 *   fogStartsAt = phaseEndsAt - fogMs
 */
import { describe, expect, it } from 'vitest';
import { BLIND_FOG_MS, DEFAULT_TIMINGS, WEATHER_PATTERNS } from '@landfall/core';
import { fogSegmentFraction } from '../src/clockMath';

function serverFogWindow(anchorMs: number, weatherId: string) {
  const weatherFogBonus = weatherId === 'HEAVY_FOG' ? 1_000 : 0;
  return Math.min(BLIND_FOG_MS + weatherFogBonus, Math.max(0, anchorMs - 500));
}

describe('fog segment fraction (D6)', () => {
  it('matches the server fog window for all four weather patterns', () => {
    const start = 1_000_000;
    const anchorMs = DEFAULT_TIMINGS.anchorMs;
    const endsAt = start + anchorMs;

    for (const weather of WEATHER_PATTERNS) {
      const fogMs = serverFogWindow(anchorMs, weather.id);
      const fogStartsAt = endsAt - fogMs;
      expect(fogSegmentFraction(start, fogStartsAt, endsAt), weather.id).toBeCloseTo(
        fogMs / anchorMs,
        10,
      );
    }
  });

  it('Heavy Fog draws a visibly larger segment than Clear Tide', () => {
    const start = 0;
    const anchorMs = DEFAULT_TIMINGS.anchorMs;
    const clear = fogSegmentFraction(
      start,
      anchorMs - serverFogWindow(anchorMs, 'CLEAR_TIDE'),
      anchorMs,
    );
    const heavy = fogSegmentFraction(
      start,
      anchorMs - serverFogWindow(anchorMs, 'HEAVY_FOG'),
      anchorMs,
    );
    expect(heavy).toBeGreaterThan(clear);
    expect(heavy).toBeCloseTo((BLIND_FOG_MS + 1_000) / anchorMs, 10);
  });

  it('clamps when the whole visible window is fog (mid-phase join inside fog)', () => {
    // Joined 1s before lock: fog started 3s ago — the entire visible track is fog.
    expect(fogSegmentFraction(9_000, 7_000, 10_000)).toBe(1);
  });

  it('honours the anchorMs - 500 clamp on short rounds, like the server', () => {
    const anchorMs = 3_000; // faster-than-fog test timings
    const fogMs = serverFogWindow(anchorMs, 'HEAVY_FOG');
    expect(fogMs).toBe(anchorMs - 500);
    expect(fogSegmentFraction(0, anchorMs - fogMs, anchorMs)).toBeCloseTo(
      (anchorMs - 500) / anchorMs,
      10,
    );
  });

  it('returns 0 for degenerate inputs', () => {
    expect(fogSegmentFraction(10_000, 9_000, 10_000)).toBe(0); // phase already over
    expect(fogSegmentFraction(0, 10_000, 10_000)).toBe(0); // no fog window
  });
});
