import { describe, expect, it } from 'vitest';
import { shouldAnimate, tickValue } from '../src/jackpotTicker';

describe('jackpot ticker', () => {
  it('counts up while the pot grows at the same table', () => {
    expect(
      shouldAnimate({ sameTable: true, fromMinor: 50_000, toMinor: 50_120, framesAvailable: true }),
    ).toBe(true);
  });

  it('snaps on a payout rather than counting the pot down', () => {
    expect(
      shouldAnimate({
        sameTable: true,
        fromMinor: 120_000,
        toMinor: 50_000,
        framesAvailable: true,
      }),
    ).toBe(false);
  });

  it('snaps across a table switch — the pots are different pots, not one moving', () => {
    expect(
      shouldAnimate({
        sameTable: false,
        fromMinor: 50_000,
        toMinor: 900_000,
        framesAvailable: true,
      }),
    ).toBe(false);
    expect(
      shouldAnimate({
        sameTable: false,
        fromMinor: 900_000,
        toMinor: 50_000,
        framesAvailable: true,
      }),
    ).toBe(false);
  });

  it('does not animate a value that has not moved', () => {
    expect(
      shouldAnimate({ sameTable: true, fromMinor: 50_000, toMinor: 50_000, framesAvailable: true }),
    ).toBe(false);
  });

  it('refuses to animate when no frames will run, so the number is never left stale', () => {
    // A backgrounded tab pauses requestAnimationFrame; a half-finished climb
    // that never resumes is worse than no climb at all.
    expect(
      shouldAnimate({
        sameTable: true,
        fromMinor: 50_000,
        toMinor: 50_120,
        framesAvailable: false,
      }),
    ).toBe(false);
  });

  it('runs from the old value to the new one and stops there', () => {
    expect(tickValue(1_000, 2_000, 0)).toBe(1_000);
    expect(tickValue(1_000, 2_000, 1)).toBe(2_000);
    expect(tickValue(1_000, 2_000, 2)).toBe(2_000);
    expect(tickValue(1_000, 2_000, -1)).toBe(1_000);
  });

  it('eases out, so most of the climb is visible immediately', () => {
    const half = tickValue(0, 1_000, 0.5);
    expect(half).toBeGreaterThan(500);
    expect(half).toBeLessThan(1_000);
    // Monotonic across the run.
    let last = -1;
    for (let t = 0; t <= 1; t += 0.1) {
      const v = tickValue(0, 1_000, t);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('returns whole minor units, never fractions of a credit', () => {
    for (const t of [0.13, 0.37, 0.61, 0.88]) {
      expect(Number.isInteger(tickValue(1_234, 9_876, t))).toBe(true);
    }
  });
});
