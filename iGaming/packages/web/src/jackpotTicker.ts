/**
 * The jackpot number, and when it is allowed to move.
 *
 * The pot is real published state: it arrives in every round header, grows by a
 * share of each round's rake, and resets to the table's floor when it pays out.
 * Animating it is worth doing — a number that visibly climbs is the honest
 * shape of what is actually happening — but only in the one direction that is
 * actually growth. Two cases must snap instead:
 *
 *   a PAYOUT, where the pot drops back to the floor. Counting down to it would
 *   read as the player losing something they never had;
 *   a TABLE SWITCH, where the number changes because it is a different table's
 *   pot entirely. Pots are per table and never merge, so sliding one into the
 *   other would animate a relationship that does not exist.
 */
export const JACKPOT_TICK_MS = 700;

export function shouldAnimate(input: {
  sameTable: boolean;
  fromMinor: number;
  toMinor: number;
  /**
   * False when frames will not actually run — a reduced-motion preference, or
   * a backgrounded tab, where `requestAnimationFrame` is paused. Without this
   * the ticker froze part-way up its climb and stayed there: the pot kept
   * arriving in every round header, the display kept its half-finished number,
   * and a tab left open in the background drifted rounds behind the truth.
   */
  framesAvailable: boolean;
}): boolean {
  if (!input.framesAvailable) return false;
  return input.sameTable && input.toMinor > input.fromMinor;
}

/** Eased position between two pot values; `t` is progress in [0, 1]. */
export function tickValue(fromMinor: number, toMinor: number, t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  // easeOutCubic: most of the climb happens immediately, then it settles.
  const eased = 1 - Math.pow(1 - clamped, 3);
  return Math.round(fromMinor + (toMinor - fromMinor) * eased);
}
