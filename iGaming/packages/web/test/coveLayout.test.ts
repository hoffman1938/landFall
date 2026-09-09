/**
 * The board's layout invariant, pinned.
 *
 * The bug this exists to prevent: harbor rows were fractions of the board
 * height while the compact Storm Clock sat at a fixed pixel offset from the
 * top, so the two only missed each other by coincidence — and stopped missing
 * at 360x740, where the clock ran 14px into the first row of harbor cards.
 */
import { describe, expect, it } from 'vitest';
import { ZONE_COUNT } from '@landfall/core';
import {
  clockBandFor,
  getCoveLayouts,
  gridFor,
  markerWidthFor,
  type BoardInsets,
} from '../src/coveLayout';

/** Every viewport in the audit brief, minus the header the board sits under. */
const HEADER = 57;
const VIEWPORTS: [number, number][] = [
  [320, 640],
  [360, 740],
  [375, 667],
  [375, 812],
  [390, 780],
  [414, 896],
  [480, 800],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  // landscape phones — the shortest boards the product can be asked to draw
  [740, 360],
  [844, 390],
  [932, 430],
];

function insetsFor(width: number, boardHeight: number, deckHeight: number): BoardInsets {
  return { top: clockBandFor(width, boardHeight), bottom: deckHeight + 12 };
}

describe('getCoveLayouts', () => {
  it('returns one layout per harbor at every viewport', () => {
    for (const [w, h] of VIEWPORTS) {
      const layouts = getCoveLayouts(w, h - HEADER, insetsFor(w, h - HEADER, 130));
      expect(layouts, `${w}x${h}`).toHaveLength(ZONE_COUNT);
    }
  });

  it('keeps every card clear of the top chrome band', () => {
    for (const [w, h] of VIEWPORTS) {
      const boardH = h - HEADER;
      const insets = insetsFor(w, boardH, 130);
      for (const l of getCoveLayouts(w, boardH, insets)) {
        const cardTop = l.markerY - l.markerHeight / 2;
        expect(cardTop, `${w}x${h} card top vs clock band`).toBeGreaterThanOrEqual(
          Math.min(insets.top, boardH * 0.34) - 0.5,
        );
      }
    }
  });

  it('keeps every card clear of the deck band', () => {
    for (const [w, h] of VIEWPORTS) {
      const boardH = h - HEADER;
      const insets = insetsFor(w, boardH, 130);
      const deckTop = boardH - Math.min(insets.bottom, boardH * 0.42);
      for (const l of getCoveLayouts(w, boardH, insets)) {
        const cardBottom = l.markerY + l.markerHeight / 2;
        expect(cardBottom, `${w}x${h} card bottom vs deck`).toBeLessThanOrEqual(deckTop + 0.5);
      }
    }
  });

  it('never lets a card hang off the left or right edge', () => {
    for (const [w, h] of VIEWPORTS) {
      const half = markerWidthFor(w) / 2;
      for (const l of getCoveLayouts(w, h - HEADER, insetsFor(w, h - HEADER, 130))) {
        expect(l.markerX - half, `${w}x${h} left`).toBeGreaterThanOrEqual(-0.5);
        expect(l.markerX + half, `${w}x${h} right`).toBeLessThanOrEqual(w + 0.5);
      }
    }
  });

  it('never overlaps two harbor cards', () => {
    for (const [w, h] of VIEWPORTS) {
      const layouts = getCoveLayouts(w, h - HEADER, insetsFor(w, h - HEADER, 130));
      const half = markerWidthFor(w) / 2;
      for (let i = 0; i < layouts.length; i++) {
        for (let j = i + 1; j < layouts.length; j++) {
          const a = layouts[i]!;
          const b = layouts[j]!;
          const ox =
            Math.min(a.markerX + half, b.markerX + half) -
            Math.max(a.markerX - half, b.markerX - half);
          const oy =
            Math.min(a.markerY + a.markerHeight / 2, b.markerY + b.markerHeight / 2) -
            Math.max(a.markerY - a.markerHeight / 2, b.markerY - b.markerHeight / 2);
          expect(ox > 0 && oy > 0, `${w}x${h} harbors ${i + 1}/${j + 1} overlap`).toBe(false);
        }
      }
    }
  });

  it('reacts to a taller deck by moving the cards up, not by ignoring it', () => {
    const short = getCoveLayouts(390, 723, insetsFor(390, 723, 120));
    const tall = getCoveLayouts(390, 723, insetsFor(390, 723, 220));
    const lastShort = Math.max(...short.map((l) => l.markerY));
    const lastTall = Math.max(...tall.map((l) => l.markerY));
    expect(lastTall).toBeLessThan(lastShort);
  });

  it('turns the grid on its side when three rows cannot fit', () => {
    // A phone held sideways: wide, and far too short for three rows of cards.
    expect(gridFor(740, 303, insetsFor(740, 303, 120))).toEqual({ cols: 3, rows: 2 });
    // A phone the right way up keeps two columns even when short.
    expect(gridFor(390, 723, insetsFor(390, 723, 120))).toEqual({ cols: 2, rows: 3 });
    // A desktop board has room for three rows.
    expect(gridFor(1440, 843, insetsFor(1440, 843, 120))).toEqual({ cols: 2, rows: 3 });
  });

  it('degrades to a centred cluster rather than collapsing when nothing fits', () => {
    // A board with no usable band at all: everything must still be finite,
    // on-screen and non-overlapping rather than NaN or stacked at zero.
    const layouts = getCoveLayouts(360, 120, { top: 132, bottom: 200 });
    expect(layouts).toHaveLength(ZONE_COUNT);
    for (const l of layouts) {
      expect(Number.isFinite(l.markerX)).toBe(true);
      expect(Number.isFinite(l.markerY)).toBe(true);
      expect(l.markerY).toBeGreaterThan(0);
      expect(l.markerY).toBeLessThan(120);
    }
  });

  it('is a pure function of its inputs', () => {
    const a = getCoveLayouts(414, 839, insetsFor(414, 839, 130));
    const b = getCoveLayouts(414, 839, insetsFor(414, 839, 130));
    expect(a).toEqual(b);
  });

  it('returns nothing for a board with no size', () => {
    expect(getCoveLayouts(0, 0, insetsFor(0, 0, 130))).toEqual([]);
    expect(getCoveLayouts(390, 0, insetsFor(390, 0, 130))).toEqual([]);
  });
});
