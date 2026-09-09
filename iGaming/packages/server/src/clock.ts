/**
 * Monotonic milliseconds, for measuring how long something took.
 *
 * `performance.now()` is the one high-resolution clock both hosts expose as a
 * global (Node and Cloudflare Workers alike), and unlike `Date.now()` it cannot
 * jump backwards when the wall clock is adjusted — which would otherwise
 * surface as a negative settlement duration in the metrics.
 *
 * Workers freeze the value between I/O operations as a timing-side-channel
 * defence, so a span measured inside one synchronous settlement reads as 0
 * there. That is a resolution limit on a telemetry histogram, never on
 * settlement itself, which is why it is acceptable to share this clock.
 */
export function monotonicMs(): number {
  return performance.now();
}
