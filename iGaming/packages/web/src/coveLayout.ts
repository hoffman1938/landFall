import { ZONE_COUNT } from '@landfall/core';
import { getDeckHeight } from './deckHeight';
import { getUiMode } from './uiMode';

export interface CoveRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CoveLayout {
  hit: CoveRect;
  markerX: number;
  markerY: number;
  /**
   * The zone card's box. The card itself is DOM, painted ABOVE the canvas, so
   * anything the Pixi scene draws inside this rectangle is invisible. Every
   * marker the scene draws for a zone — the static plot brackets, your
   * selection, the storm reticle, the strike frame — is sized to sit outside
   * it, which is why the box has to be shared rather than guessed twice.
   */
  markerWidth: number;
  markerHeight: number;
  moorX: number;
  moorY: number;
  side: 'top' | 'bottom';
  shoreHeight: number;
}

/*
 * THE GRID
 *
 * Six harbors, always in a rectangular grid, and the grid's SHAPE is chosen
 * from the space the chrome leaves free rather than from the viewport's
 * orientation. Two shapes cover everything the product is asked to draw:
 *
 *   2 columns x 3 rows   the default. Every harbor gets identical visual
 *                        weight, the centre column stays clear as the storm's
 *                        stage, and the ordering is the same on a phone and a
 *                        desktop so harbor 4 is always in the same relative
 *                        place.
 *
 *   3 columns x 2 rows   when three rows genuinely cannot fit. A phone held
 *                        sideways is ~360px tall; minus the clock band and the
 *                        deck that leaves under 80px, which was three rows of
 *                        80px cards drawn on top of each other. Width is the
 *                        dimension that board has, so the grid uses it.
 *
 * Index order is row-major in both, so the reading order never changes.
 */
export type GridShape = { cols: 2 | 3; rows: 3 | 2 };

export const GRID_2x3: GridShape = { cols: 2, rows: 3 };
export const GRID_3x2: GridShape = { cols: 3, rows: 2 };

/** Column of a harbor in a given grid. 0 is leftmost. */
export function columnOf(zone: number, grid: GridShape): number {
  return zone % grid.cols;
}

/** Row of a harbor in a given grid. 0 is topmost. */
export function rowOf(zone: number, grid: GridShape): number {
  return Math.floor(zone / grid.cols);
}

/** Harbors in the leftmost column — "west" on the board. */
export function westHarbors(grid: GridShape = GRID_2x3): number[] {
  return [0, 1, 2, 3, 4, 5].filter((z) => columnOf(z, grid) === 0);
}

/** Harbors in the rightmost column — "east" on the board. */
export function eastHarbors(grid: GridShape = GRID_2x3): number[] {
  return [0, 1, 2, 3, 4, 5].filter((z) => columnOf(z, grid) === grid.cols - 1);
}

/** Harbors in the top row — "north". */
export function northHarbors(grid: GridShape = GRID_2x3): number[] {
  return [0, 1, 2, 3, 4, 5].filter((z) => rowOf(z, grid) === 0);
}

/** Harbors in the bottom row — "south". */
export function southHarbors(grid: GridShape = GRID_2x3): number[] {
  return [0, 1, 2, 3, 4, 5].filter((z) => rowOf(z, grid) === grid.rows - 1);
}

/** Horizontal centres per column, as fractions of the board width. */
const COLUMN_X: Record<number, readonly number[]> = {
  2: [0.21, 0.79],
  3: [0.17, 0.5, 0.83],
};

/**
 * The card is three rows of fixed type inside fixed padding, so its height is
 * stable — 79px at the current type scale, rounded up here. Markers add their
 * own margin on top of this, so a few pixels of drift cannot put a marker
 * underneath the card; the rounding just keeps the margin honest.
 */
const MARKER_HEIGHT = 80;

/**
 * How wide the zone card is at this board width. The markers are big seats on
 * a wide board and stay thumb-sized on a phone.
 */
export function markerWidthFor(width: number): number {
  return width >= 768
    ? Math.min(206, Math.max(168, width * 0.135))
    : Math.min(158, Math.max(126, width * 0.38));
}

/**
 * Chrome that floats OVER the board and must not be landed on.
 *
 * The harbor rows used to be pure fractions of the board height while the
 * compact Storm Clock sat at a fixed pixel offset from the top. Two systems for
 * one axis means they only miss each other by luck, and they stopped missing at
 * 360x740: the clock ran 14px into the first row of harbor cards (measured).
 * Reserving the bands the chrome actually occupies makes the miss structural.
 */
export interface BoardInsets {
  /** The compact Storm Clock's band. Zero once the clock moves to the centre. */
  top: number;
  /** The control deck, plus the gap the round's overlay slot needs above it. */
  bottom: number;
}

/** The compact clock: `top-12` (48px) + its card (~76px) + breathing room. */
export const CLOCK_BAND_PX = 132;

/**
 * The slim clock chip a short board gets instead: `top-2` (8px) + a 34px row.
 * A phone held sideways has ~300px of board; the full 132px band plus the deck
 * left under 80px for six harbor cards, which is not a layout, it is a pile.
 */
export const CLOCK_CHIP_BAND_PX = 50;

/** Below this board height the clock renders as the slim chip. */
export const SHORT_BOARD_HEIGHT = 480;

/** The band the clock occupies at this board size. */
export function clockBandFor(width: number, height: number): number {
  if (width >= CENTRED_CLOCK_MIN_WIDTH) return 0; // clock is board-centred
  return height < SHORT_BOARD_HEIGHT ? CLOCK_CHIP_BAND_PX : CLOCK_BAND_PX;
}

/** Below this width the clock is the compact strip; above it, board-centred. */
export const CENTRED_CLOCK_MIN_WIDTH = 1024;

/**
 * The advanced board's history strip, top-left: 8px inset + a 40px row + 8px.
 *
 * On a wide board the clock moves to the centre and stops reserving a top band
 * — which left the first row of harbors starting at the very top of the board,
 * underneath this strip. Measured at 1440x900: 6,048px² of harbor 1 covered by
 * "Recent results".
 */
export const HISTORY_STRIP_BAND_PX = 56;

/**
 * The insets in force right now. Reads the deck's live height from
 * `deckHeight.ts` (which both decks publish to, and which React and the Pixi
 * scene can subscribe to) and is kept separate from `getCoveLayouts` so the
 * geometry itself stays a pure, testable function.
 */
export function boardInsets(width: number, height = Number.POSITIVE_INFINITY): BoardInsets {
  // The advanced board puts its history strip in the same corner the harbors
  // would otherwise start in, so it is part of the top band there.
  const history = getUiMode().mode === 'advanced' ? HISTORY_STRIP_BAND_PX : 0;
  return {
    top: Math.max(clockBandFor(width, height), history),
    // The deck itself, plus room for the round's card sitting above it.
    bottom: getDeckHeight() + 12,
  };
}

/**
 * Which grid this board can actually hold. Exported so the DOM layer, the Pixi
 * scene and the tide report all read the same answer instead of each assuming
 * the two-column convention.
 */
export function gridFor(width: number, height: number, insets: BoardInsets): GridShape {
  if (width <= 0 || height <= 0) return GRID_2x3;
  // A portrait board always gets the two-column grid: it has the height for it
  // and the ordering should not change under a player who rotates back.
  if (width < height) return GRID_2x3;
  const three = usableBand(height, insets, 3);
  // Three rows only if they fit at a legible card height.
  if (three.markerHeight > MARKER_HEIGHT_MIN + 0.5) return GRID_2x3;
  return GRID_3x2;
}

/** Smallest a harbor card may shrink to before legibility goes. */
const MARKER_HEIGHT_MIN = 56;

/**
 * The free vertical band, and the card height that fits inside it.
 *
 * Card height is a RESULT of the space, not a constant. On a tall board it is
 * the full 80px the three type rows want; on a short one the cards give ground
 * before they are allowed to overlap each other, and both renderers honour it
 * because they read `markerHeight` off the layout.
 */
function usableBand(
  height: number,
  insets: BoardInsets,
  rows: number,
): { top: number; bottom: number; markerHeight: number } {
  const reservedTop = Math.min(insets.top, height * 0.34);
  const reservedBottom = Math.min(insets.bottom, height * 0.42);
  const free = Math.max(0, height - reservedTop - reservedBottom);

  // rows cards + (rows - 1) gaps of 12 must fit inside `free`.
  const gaps = (rows - 1) * 12;
  const markerHeight = Math.max(MARKER_HEIGHT_MIN, Math.min(MARKER_HEIGHT, (free - gaps) / rows));

  const halfCard = markerHeight / 2;
  const top = reservedTop + halfCard;
  const bottom = height - reservedBottom - halfCard;
  if (bottom - top < 1) {
    // Nothing fits at all: centre the rows so the board is still legible
    // rather than drawing cards off the top of the screen.
    const mid = height / 2;
    const span = Math.max(0, (rows - 1) * (markerHeight + 4)) / 2;
    return { top: mid - span, bottom: mid + span, markerHeight };
  }
  return { top, bottom, markerHeight };
}

/** Shared geometry for the Pixi world and the semantic DOM cove cards. */
export function getCoveLayouts(
  width: number,
  height: number,
  insets: BoardInsets = { top: 0, bottom: 0 },
): CoveLayout[] {
  if (width <= 0 || height <= 0) return [];

  const grid = gridFor(width, height, insets);
  const columnX = COLUMN_X[grid.cols]!;
  const coveWidth = (width / grid.cols) * 0.86;
  const markerWidth = markerWidthFor(width);
  // Clamp against the card's ACTUAL half-width. This used to be a fixed 80,
  // which is narrower than the card gets on a wide board, so the clamp could
  // still let an edge column hang off the board.
  const markerHalf = markerWidth / 2;

  /*
   * Rows are distributed evenly inside the band the chrome leaves free, rather
   * than at fixed fractions of the whole board. That is the fix for the clock
   * landing on the first row: the band starts below the clock by construction,
   * so no viewport can make them collide.
   */
  const band = usableBand(height, insets, grid.rows);
  const bandHeight = band.bottom - band.top;
  const rowY = (row: number) => band.top + (bandHeight * row) / (grid.rows - 1);
  const midY = (band.top + band.bottom) / 2;
  const coveHeight = Math.max(band.markerHeight + 8, height * 0.17);

  return Array.from({ length: ZONE_COUNT }, (_, zone) => {
    const centerX = columnX[columnOf(zone, grid)]!;
    const y0 = rowY(rowOf(zone, grid));
    const x = centerX * width - coveWidth / 2;
    const y = y0 - coveHeight / 2;
    const side = y0 <= midY ? 'top' : 'bottom';
    const shoreHeight = Math.min(54, coveHeight * 0.3);

    return {
      hit: { x, y, width: coveWidth, height: coveHeight },
      markerX: Math.max(markerHalf, Math.min(width - markerHalf, centerX * width)),
      markerY: y0,
      markerWidth,
      markerHeight: band.markerHeight,
      moorX: centerX * width,
      moorY: y0 + coveHeight * (side === 'top' ? 0.12 : 0.04),
      side,
      shoreHeight,
    };
  });
}
