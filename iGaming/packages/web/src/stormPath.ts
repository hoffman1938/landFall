/**
 * Storm-path presentation logic, kept out of the Pixi scene so the two rules
 * that matter can be unit-tested.
 *
 * RULE 1 — THE RETICLE IS ONLY EVER ON A ZONE. It has six possible positions
 * and no others: it locks onto a zone, holds, and re-acquires the next one.
 * The scene snaps between stops rather than sliding, so there is no frame in
 * which the reticle sits between harbors or off the board. An earlier version
 * parked it on a neutral point above the board when the published feints
 * collided; that read as the storm wandering out of the game.
 *
 * RULE 2 — IT NEVER PARKS. The server publishes two cosmetic "feints" per round
 * (rng.ts §DrawResult): two INDEPENDENT `byte % ZONE_COUNT` picks, so they land
 * on the same zone about one round in six — measured at 16.6% over 200k draws.
 * Alternating between `feints[0]` and `feints[1]` on those rounds resolved both
 * legs to the same point, and the reticle sat still for the whole five-second
 * window before the storm struck somewhere else.
 *
 * When the digest publishes one zone twice, the route's second stop is the zone
 * OPPOSITE it. That is derived from the published feint and the zone count and
 * nothing else — deterministic, identical on every client, and independent of
 * the struck zone, so the patrol can never hint at the outcome. It could not
 * anyway: the feints are cosmetic and the storm already strikes a zone neither
 * of them named on 69% of rounds.
 */

export interface Point {
  x: number;
  y: number;
}

/** How long the reticle holds each stop before re-acquiring the next. */
export const FEINT_DWELL_MS = 1_500;

/** How long the lock-on animation runs when the reticle acquires a new zone. */
export const FEINT_ACQUIRE_MS = 160;

/**
 * The zones the reticle will visit this window, in order. Always two distinct
 * zones, always real zones.
 */
export function stormRouteZones(
  feints: readonly [number, number],
  zoneCount: number,
): number[] {
  if (zoneCount <= 0) return [];
  const first = ((feints[0] % zoneCount) + zoneCount) % zoneCount;
  const second = ((feints[1] % zoneCount) + zoneCount) % zoneCount;
  if (zoneCount === 1) return [first];
  // Opposite side of the board — as far from the published feint as the layout
  // goes, so the patrol is unmistakably a patrol.
  const opposite = (first + Math.floor(zoneCount / 2)) % zoneCount;
  return second === first ? [first, opposite] : [first, second];
}

/**
 * Build the patrol route for one locked window.
 *
 * @param feints    the two zones published in STORM_PATH
 * @param zoneStop  where a zone sits on the board, or null if it has no layout yet
 * @param zoneCount how many zones this game has
 */
export function stormRoute(
  feints: readonly [number, number],
  zoneStop: (zone: number) => Point | null,
  zoneCount: number,
): Point[] {
  return stormRouteZones(feints, zoneCount)
    .map(zoneStop)
    .filter((p): p is Point => p !== null);
}

/** Which leg of the route the window is on, `elapsedMs` in. */
export function stormRouteLeg(routeLength: number, elapsedMs: number): number {
  if (routeLength <= 0) return 0;
  return Math.floor(Math.max(0, elapsedMs) / FEINT_DWELL_MS) % routeLength;
}

/**
 * Which stop the reticle is on, `elapsedMs` into the window. Phase-relative on
 * purpose: keying this off `Date.now()` made the first leg however much of an
 * arbitrary wall-clock window happened to be left, which could be a few ms.
 */
export function stormRouteStop(route: readonly Point[], elapsedMs: number): Point | null {
  if (route.length === 0) return null;
  return route[stormRouteLeg(route.length, elapsedMs)] ?? null;
}
