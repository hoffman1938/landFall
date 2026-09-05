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

const PORTRAIT_CENTERS: readonly [number, number][] = [
  [0.23, 0.26],
  [0.77, 0.26],
  [0.23, 0.44],
  [0.77, 0.44],
  [0.23, 0.62],
  [0.77, 0.62],
];

const MARKER_HALF_WIDTH = 80;

/** Shared geometry for the Pixi world and the semantic DOM cove cards. */
export function getCoveLayouts(width: number, height: number): CoveLayout[] {
  if (width <= 0 || height <= 0) return [];

  const landscape = width >= height;
  const centers = landscape ? LANDSCAPE_CENTERS : PORTRAIT_CENTERS;
  const coveWidth = width * (landscape ? 0.24 : 0.44);
  const coveHeight = height * (landscape ? 0.22 : 0.17);
  const markerRightEdge = width;

  return Array.from({ length: ZONE_COUNT }, (_, zone) => {
    const [centerX, centerY] = centers[zone]!;
    const x = centerX * width - coveWidth / 2;
    const y = centerY * height - coveHeight / 2;
    const side = centerY < 0.48 ? 'top' : 'bottom';
    const shoreHeight = Math.min(54, coveHeight * 0.3);

    return {
      hit: { x, y, width: coveWidth, height: coveHeight },
      markerX: Math.max(
        MARKER_HALF_WIDTH,
        Math.min(markerRightEdge - MARKER_HALF_WIDTH, centerX * width),
      ),
      markerY: centerY * height,
      moorX: centerX * width,
      moorY: centerY * height + coveHeight * (side === 'top' ? 0.12 : 0.04),
      side,
      shoreHeight,
    };
  });
}
