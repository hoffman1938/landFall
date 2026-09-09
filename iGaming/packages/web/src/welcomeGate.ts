/**
 * Entry-gate open/close decision — pure, so it can be reasoned about and tested
 * without a socket. `WelcomeGate.tsx` renders it; `store.ts` calls this on every
 * WELCOME frame.
 *
 * The rule is narrower than it first looks, and getting it wrong is easy: the
 * server answers JOIN_ROOM with a FULL WELCOME frame, identical in shape to the
 * opening handshake, and a dropped socket reconnects with one too. Keying the
 * gate off "a WELCOME arrived" therefore re-gated the player every time they
 * switched tables or the network hiccuped — the gate slammed shut in front of a
 * game they were already playing.
 *
 * So: the gate is a once-per-page-load event, and it never opens over a player
 * who is mid-round.
 */

export interface WelcomeDecision {
  /** A WELCOME frame has already been resolved during this page load. */
  settled: boolean;
  /** This handshake carries a live fleet — the player has money on the table. */
  hasLiveFleet: boolean;
  /** The gate's current state, preserved once the decision is settled. */
  currentlyOpen: boolean;
}

export function nextWelcomeOpen({
  settled,
  hasLiveFleet,
  currentlyOpen,
}: WelcomeDecision): boolean {
  // Table switches and reconnects must not disturb the gate either way.
  if (settled) return currentlyOpen;
  // A first frame that already has a fleet is a resumed session, not a new one.
  return !hasLiveFleet;
}
