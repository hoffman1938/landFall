import { describe, expect, it } from 'vitest';
import type { TideBand, TideReportEntry } from '@landfall/core';
import { TIDE_DISCLAIMER, tideDirection, tideSentence } from '../src/tideDirection';

function report(bands: TideBand[]): TideReportEntry[] {
  return bands.map((band, zone) => ({ zone, band, trend: 'stable', boatCount: 0 }));
}

describe('tideDirection', () => {
  it('is EVEN with no report at all', () => {
    expect(tideDirection(undefined).axis).toBe('EVEN');
    expect(tideDirection([]).axis).toBe('EVEN');
  });

  it('is EVEN when every harbor carries the same band', () => {
    for (const band of ['seed', 'light', 'medium', 'heavy', 'packed'] as TideBand[]) {
      const d = tideDirection(report([band, band, band, band, band, band]));
      expect(d.axis).toBe('EVEN');
      expect(d.strength).toBe(0);
    }
  });

  it('names WEST when harbors 1·3·5 carry the money', () => {
    // west = zones 0,2,4
    const d = tideDirection(report(['packed', 'seed', 'packed', 'seed', 'packed', 'seed']));
    expect(d.axis).toBe('WEST');
    expect(d.arrow).toBe('←');
    expect(d.zones).toEqual([0, 2, 4]);
    expect(d.strength).toBeGreaterThan(0.5);
  });

  it('names EAST when harbors 2·4·6 carry the money', () => {
    const d = tideDirection(report(['seed', 'packed', 'seed', 'packed', 'seed', 'packed']));
    expect(d.axis).toBe('EAST');
    expect(d.arrow).toBe('→');
    expect(d.zones).toEqual([1, 3, 5]);
  });

  it('names NORTH/SOUTH when the lean is vertical rather than horizontal', () => {
    // top row heavy, bottom row empty, columns balanced
    const north = tideDirection(report(['packed', 'packed', 'medium', 'medium', 'seed', 'seed']));
    expect(north.axis).toBe('NORTH');
    expect(north.arrow).toBe('↑');
    expect(north.zones).toEqual([0, 1]);

    const south = tideDirection(report(['seed', 'seed', 'medium', 'medium', 'packed', 'packed']));
    expect(south.axis).toBe('SOUTH');
    expect(south.arrow).toBe('↓');
    expect(south.zones).toEqual([4, 5]);
  });

  it('prefers the more lopsided axis when both lean', () => {
    // strong west lean, mild north lean -> WEST
    const d = tideDirection(report(['packed', 'seed', 'packed', 'seed', 'heavy', 'seed']));
    expect(d.axis).toBe('WEST');
  });

  it('never reports a direction stronger than 1', () => {
    const d = tideDirection(report(['packed', 'seed', 'packed', 'seed', 'packed', 'seed']));
    expect(d.strength).toBeLessThanOrEqual(1);
    expect(d.strength).toBeGreaterThanOrEqual(0);
  });

  it('ignores out-of-range zones instead of skewing on them', () => {
    const entries: TideReportEntry[] = [
      ...report(['medium', 'medium', 'medium', 'medium', 'medium', 'medium']),
      { zone: 99, band: 'packed', trend: 'rising', boatCount: 40 },
    ];
    expect(tideDirection(entries).axis).toBe('EVEN');
  });
});

describe('copy', () => {
  it('never claims to know where the storm goes', () => {
    const lines = [
      TIDE_DISCLAIMER,
      tideSentence(tideDirection(report(['packed', 'seed', 'packed', 'seed', 'packed', 'seed']))),
      tideSentence(tideDirection(report(['medium', 'medium', 'medium', 'medium', 'medium', 'medium']))),
    ];
    for (const line of lines) {
      // No forecasting vocabulary anywhere.
      expect(line).not.toMatch(/likely|chance|predict|forecast|expect|odds/i);
      // The storm may only ever appear in a sentence that denies it is the subject.
      if (/storm/i.test(line)) expect(line).toMatch(/\bnot\b|\bignores\b/i);
    }
    expect(TIDE_DISCLAIMER).toMatch(/not where the storm will hit/i);
  });

  it('describes an even table as even', () => {
    const sentence = tideSentence(tideDirection(report(['light', 'light', 'light', 'light', 'light', 'light'])));
    expect(sentence).toMatch(/spread evenly/i);
  });

  it('scales its adjective with the lean', () => {
    const strong = tideSentence(tideDirection(report(['packed', 'seed', 'packed', 'seed', 'packed', 'seed'])));
    const mild = tideSentence(tideDirection(report(['heavy', 'light', 'heavy', 'light', 'medium', 'medium'])));
    expect(strong).toMatch(/^Most /);
    expect(mild).toMatch(/^More /);
  });
});
