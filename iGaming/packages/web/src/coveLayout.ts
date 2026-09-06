import { ZONE_COUNT } from '@landfall/core';

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
 * Landscape: three seats a side, mirrored across the centre line. The old
 * layout was a lopsided oval that left the middle of a wide screen dead while
 * still crowding its bottom markers into the Storm Clock and the verdict card.
 * Two columns give every zone identical visual weight (no seat at this table
 * is a better seat), keep the whole centre clear as the storm's stage, and use
 * the SAME zone ordering as the portrait layout below — so a player moving
 * between phone and desktop finds Zone 4 in the same relative place.
 */
const LANDSCAPE_CENTERS: readonly [number, number][] = [
  [0.17, 0.26],
  [0.83, 0.26],
  [0.17, 0.5],
  [0.83, 0.5],
  [0.17, 0.74],
  [0.83, 0.74],
];

/*
 * Portrait stacks three rows in the upper two-thirds of the board, because the
 * bottom third belongs to the control deck, which overlays it. Sitting the rows
 * at .26/.44/.62 put the last one under the deck on a phone and clipped it.
 */
const PORTRAIT_CENTERS: readonly [number, number][] = [
  [0.23, 0.22],
  [0.77, 0.22],
  [0.23, 0.38],
  [0.77, 0.38],
  [0.23, 0.54],
  [0.77, 0.54],
];

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

/** Shared geometry for the Pixi world and the semantic DOM cove cards. */
export function getCoveLayouts(width: number, height: number): CoveLayout[] {
  if (width <= 0 || height <= 0) return [];

  const landscape = width >= height;
  const centers = landscape ? LANDSCAPE_CENTERS : PORTRAIT_CENTERS;
  const coveWidth = width * (landscape ? 0.24 : 0.44);
  const coveHeight = height * (landscape ? 0.22 : 0.17);
  const markerWidth = markerWidthFor(width);
  // Clamp against the card's ACTUAL half-width. This used to be a fixed 80,
  // which is narrower than the card gets on a wide board, so the clamp could
  // still let an edge column hang off the board.
  const markerHalf = markerWidth / 2;

  return Array.from({ length: ZONE_COUNT }, (_, zone) => {
    const [centerX, centerY] = centers[zone]!;
    const x = centerX * width - coveWidth / 2;
    const y = centerY * height - coveHeight / 2;
    const side = centerY < 0.48 ? 'top' : 'bottom';
    const shoreHeight = Math.min(54, coveHeight * 0.3);

    return {
      hit: { x, y, width: coveWidth, height: coveHeight },
      markerX: Math.max(markerHalf, Math.min(width - markerHalf, centerX * width)),
      markerY: centerY * height,
      markerWidth,
      markerHeight: MARKER_HEIGHT,
      moorX: centerX * width,
      moorY: centerY * height + coveHeight * (side === 'top' ? 0.12 : 0.04),
      side,
      shoreHeight,
    };
  });
}
