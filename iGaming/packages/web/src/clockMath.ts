/**
 * Storm Clock geometry (remediation D6) — pure, so the fog segment can be
 * unit-tested against the server's timing math for every weather pattern
 * (test/clockMath.test.ts replicates coordinator.beginRound's fog window).
 *
 * The countdown track drains right→left (width = remaining/total, anchored
 * left), so the FINAL fogMs of the phase occupies the LEFTMOST fraction of
 * the track: the bar tip reaches the fog zone exactly when Blind Fog begins.
 * The fraction shares the progress bar's denominator so the two always align,
 * including for mid-phase joins (where the observed start is late and the
 * visible track only spans what the player actually watched).
 */
export function fogSegmentFraction(
  phaseStartAt: number,
  fogStartsAt: number,
  endsAt: number,
): number {
  const total = endsAt - phaseStartAt;
  if (total <= 0) return 0;
  const fogMs = endsAt - fogStartsAt;
  if (fogMs <= 0) return 0;
  return Math.min(1, fogMs / total);
}
