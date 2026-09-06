/**
 * Storm-path presentation logic, kept out of the Pixi scene so the one
 * invariant that matters can be unit-tested.
 *
 * The server publishes two cosmetic "feints" per round (rng.ts §DrawResult):
 * two INDEPENDENT `byte % ZONE_COUNT` picks. Independent means they collide on
 * the same zone about one round in six — measured at 16.6% over 200k draws.
 * The scene used to alternate between `feints[0]` and `feints[1]` on a wall
 * clock, so on those rounds both legs resolved to the same point: the reticle
 * parked on one zone for the whole five-second window and then the storm
 * struck somewhere else. That read as a frozen animation, not as a feint.
 *
 * THE INVARIANT: the route always has two distinct stops, so the reticle is
 * always travelling while the table is sealed.
 *
 * THE CONSTRAINT: the animation must never visit a zone the published path
 * does not contain. The feints are verifiable — the Verify sheet prints them —
 * so inventing a second zone would make the picture disagree with the proof.
 * When the digest publishes one zone twice, the second stop is therefore a
 * neutral holding point that is not a harbour at all.
 */

export interface Point {
  x: number;
  y: number;
}

/** How long the reticle holds each stop before moving to the next. */
export const FEINT_DWELL_MS = 1_500;

/**
 * Build the patrol route for one locked window.
 *
 * @param feints     the two zones published in STORM_PATH
 * @param zoneStop   where a zone sits on the board, or null if it has no layout yet
 * @param neutral    the off-harbour holding point used when the feints collide
 */
export function stormRoute(
  feints: readonly [number, number],
  zoneStop: (zone: number) => Point | null,
  neutral: Point,
): Point[] {
  const [first, second] = feints;
  const firstStop = zoneStop(first);
  const secondStop = second === first ? neutral : zoneStop(second);
  const route = [firstStop, secondStop].filter((p): p is Point => p !== null);
  // A route of one stop is still a parked reticle, so pad it back to two. This
  // only bites before the first layout pass, when a zone has no position yet.
  if (route.length === 1) route.push(neutral);
  return route;
}

/**
 * Which stop the reticle is on, `elapsedMs` into the window. Phase-relative on
 * purpose: keying this off `Date.now()` made the first leg however much of an
 * arbitrary wall-clock window happened to be left, which could be a few ms.
 */
export function stormRouteStop(route: readonly Point[], elapsedMs: number): Point | null {
  if (route.length === 0) return null;
  const leg = Math.floor(Math.max(0, elapsedMs) / FEINT_DWELL_MS);
  return route[leg % route.length] ?? null;
}

/**
 * The off-harbour holding point: top of the centre line. Clear of the six zone
 * plots (which sit in two side columns) and clear of the round's countdown,
 * which owns the middle of the board.
 *
 * `clearance` is the reticle's own half-height — the reticle is a frame sized
 * to enclose a zone card, so the holding point has to sit far enough down that
 * the frame does not hang off the top edge.
 */
export function neutralStop(width: number, height: number, clearance = 0): Point {
  return { x: width / 2, y: Math.max(clearance, height * 0.16) };
}
