/**
 * The round's presentation state machine (redesign v4 §12).
 *
 * ============================================================================
 * WHY THIS IS A DERIVED MACHINE, NOT A SECOND SOURCE OF TRUTH
 * ============================================================================
 * The server owns four phases, because four is what money needs:
 * `ANCHOR_OPEN → LOCKED_STORM → RESOLVED → COOLDOWN`. The screen needs twelve,
 * because a player needs to be told twelve different things. Running a second
 * timer-driven machine alongside the authoritative one would mean two clocks
 * that can disagree, and the one on the client would eventually take a bet it
 * had no right to take.
 *
 * So: `deriveRoundState()` is a PURE FUNCTION of server-authoritative fields
 * plus the current time. There is no `setState` anywhere in this file, no
 * timers, and no way for a UI event to advance the round. Every component reads
 * the one value it returns and renders from that instead of re-deriving "is it
 * fog yet?" from a phase, a frozen flag and a timestamp — which is exactly what
 * three components were each doing slightly differently before.
 *
 * `nextRoundState()` then applies the transition table, so a state that would
 * be reached illegally (a late `LANDFALL` after the next round's header, a
 * clock skew that briefly re-opens a closed window) holds the previous state
 * instead of flickering backwards through the round.
 */
import type { RoundPhase } from '@landfall/core';

/* ============================== the states ============================== */

export type RoundState =
  /** No connection, or no round header yet. */
  | 'IDLE'
  /** Betting open, fog not yet in — and nothing committed. */
  | 'SELECTING'
  /** Betting open, fog not yet in — this player has locked a harbor in. */
  | 'LOCKED'
  /** The fog window opened: the board greys and the chrome recedes. */
  | 'FOG'
  /** The one information beat: crowd direction, with details one tap away. */
  | 'TIDE_REPORT'
  /** KEEP or CHANGE. The one hidden order of the round is still available. */
  | 'FINAL_ORDER'
  /** Sealed. Nothing is accepted, and the screen says so before the storm moves. */
  | 'FINAL_LOCK'
  /** The cinematic: sweep, narrow, focus. The result already exists. */
  | 'REVEAL'
  /** The strike lands. ~1s, and the only job is answering "which harbor". */
  | 'IMPACT'
  /** The verdict, the receipt, VERIFY and NEXT ROUND. */
  | 'RESULT'
  /** The verify sheet is open over the result. */
  | 'VERIFICATION'
  /** Cooldown into the next round. */
  | 'RESET';

/** States in which the player may still change what they have on the board. */
export const MUTABLE_STATES: ReadonlySet<RoundState> = new Set<RoundState>([
  'SELECTING',
  'LOCKED',
  'FOG',
  'TIDE_REPORT',
  'FINAL_ORDER',
]);

/** States that belong to the reveal — the board is the only thing that matters. */
export const CINEMATIC_STATES: ReadonlySet<RoundState> = new Set<RoundState>(['REVEAL', 'IMPACT']);

/** States in which a settled result is on screen. */
export const RESULT_STATES: ReadonlySet<RoundState> = new Set<RoundState>([
  'IMPACT',
  'RESULT',
  'VERIFICATION',
  'RESET',
]);

/* ========================== the transition table ========================== */

/**
 * Legal successors WITHIN ONE ROUND. Read it as "what can happen next", and
 * note what is absent:
 *
 *   RESULT → REVEAL          a settled round never un-settles;
 *   FINAL_LOCK → SELECTING   a sealed table never re-opens;
 *   IMPACT → REVEAL          the strike does not rewind.
 *
 * "Within one round" is the load-bearing qualifier. Every one of those bans is
 * a statement about a single round's arrow of time, and none of them should
 * survive the round boundary — the next round's ANCHOR_OPEN is exactly a
 * legitimate `FINAL_LOCK → SELECTING`. `nextRoundState` takes a `roundChanged`
 * flag for that reason, and a fresh round accepts any target.
 *
 * Getting this wrong is not theoretical: without the flag, a player who left
 * the Verify sheet open through the round boundary sat in `VERIFICATION`
 * forever, because `VERIFICATION → SELECTING` is not in this table — the result
 * card stayed on screen over a live betting window.
 *
 * `IDLE` is always reachable: the socket may drop at any moment.
 */
const TRANSITIONS: Record<RoundState, readonly RoundState[]> = {
  IDLE: [
    'SELECTING',
    'LOCKED',
    'FOG',
    'TIDE_REPORT',
    'FINAL_ORDER',
    'FINAL_LOCK',
    'REVEAL',
    'IMPACT',
    'RESULT',
    'RESET',
  ],
  SELECTING: ['LOCKED', 'FOG', 'TIDE_REPORT', 'FINAL_ORDER', 'FINAL_LOCK', 'REVEAL'],
  LOCKED: ['SELECTING', 'FOG', 'TIDE_REPORT', 'FINAL_ORDER', 'FINAL_LOCK', 'REVEAL'],
  FOG: ['TIDE_REPORT', 'FINAL_ORDER', 'FINAL_LOCK', 'REVEAL'],
  TIDE_REPORT: ['FINAL_ORDER', 'FINAL_LOCK', 'REVEAL'],
  FINAL_ORDER: ['FINAL_LOCK', 'REVEAL'],
  FINAL_LOCK: ['REVEAL'],
  REVEAL: ['IMPACT', 'RESULT'],
  IMPACT: ['RESULT', 'VERIFICATION'],
  RESULT: ['VERIFICATION', 'RESET'],
  VERIFICATION: ['RESULT', 'RESET'],
  RESET: ['SELECTING', 'LOCKED'],
};

export function canTransition(from: RoundState, to: RoundState): boolean {
  if (from === to) return true;
  if (to === 'IDLE') return true; // the socket may drop at any moment
  return TRANSITIONS[from].includes(to);
}

/**
 * Apply a derived state against the transition table.
 *
 * An illegal target is dropped and the previous state held — never thrown.
 * A render loop is the wrong place to raise, and the honest fallback for
 * "the server just told me something impossible" is "keep showing the last
 * thing that was true".
 *
 * `roundChanged` says a new ROUND_HEADER has arrived. The table describes one
 * round's arrow of time, so a new round clears it: every within-round ban is
 * lifted for exactly that one step. A reconnect mid-round lands the same way,
 * which is why the target may be any state and not just `SELECTING`.
 */
export function nextRoundState(
  current: RoundState,
  derived: RoundState,
  roundChanged = false,
): RoundState {
  if (roundChanged) return derived;
  return canTransition(current, derived) ? derived : current;
}

/* ============================ the fog sub-beats ============================ */

export interface FogBeats {
  /** Fog rolling in — chrome recedes, board takes over. */
  fogUntil: number;
  /** The tide report card is on screen. */
  tideUntil: number;
  /** KEEP / CHANGE is live. */
  finalOrderUntil: number;
}

/**
 * Split the Blind Fog window into its four beats.
 *
 * The window is 3 s normally and 4 s on a Heavy Fog round, and the beats have
 * to land in both without the server knowing this file exists. So they are
 * proportional with floors: if the window is ever squeezed (a room with short
 * timings, a late join mid-fog), the beats compress in order and FINAL_LOCK is
 * the one that always survives — being told the table is sealed matters more
 * than being shown the crowd one more time.
 */
export function fogBeats(fogStartsAt: number, lockAt: number): FogBeats {
  const window = Math.max(0, lockAt - fogStartsAt);
  const fog = Math.min(Math.max(window * 0.2, 300), 700);
  const tide = Math.min(Math.max(window * 0.36, 600), 1_200);
  const lock = Math.min(Math.max(window * 0.16, 350), 650);
  // Whatever is left is the decision beat; if that is nothing, the KEEP/CHANGE
  // window collapses to zero rather than pushing FINAL_LOCK past the lock.
  const fogUntil = fogStartsAt + Math.min(fog, window);
  const tideUntil = Math.min(fogUntil + tide, lockAt);
  const finalOrderUntil = Math.max(tideUntil, lockAt - lock);
  return { fogUntil, tideUntil, finalOrderUntil };
}

/* ============================== derivation ============================== */

/** How long the strike beat owns the screen before the verdict takes over. */
export const IMPACT_MS = 900;

export interface RoundStateInput {
  connected: boolean;
  /** The authoritative phase. `null` before the first header arrives. */
  phase: RoundPhase | null;
  /** Epoch ms this phase ends, from the server clock. */
  phaseEndsAt: number;
  /** Epoch ms Blind Fog opens, from the round header. */
  fogStartsAt: number | null;
  /** Does this player have a committed bet on the board? */
  hasBet: boolean;
  /** Has the one hidden fog order been spent? */
  finalOrderUsed: boolean;
  /** The server has said the tide report is frozen — fog is definitely in. */
  tideFrozen: boolean;
  /** The verify sheet is open. */
  verifyOpen: boolean;
  /** Epoch ms now. */
  now: number;
}

/**
 * The whole mapping, in one pure function.
 *
 * `tideFrozen` is trusted over the clock wherever they disagree: `FOG_STARTED`
 * is the server SAYING the window opened, and a client whose clock runs a
 * second fast must not offer a final order the server will refuse.
 */
export function deriveRoundState(input: RoundStateInput): RoundState {
  if (!input.connected || input.phase === null) return 'IDLE';

  switch (input.phase) {
    case 'LOCKED_STORM':
      return 'REVEAL';

    case 'RESOLVED': {
      // The strike beat is measured from the START of RESOLVED, which is the
      // frame the result arrived — not from a client-side animation callback.
      const resolvedStartedAt = input.phaseEndsAt - RESOLVED_ASSUMED_MS;
      if (input.now < resolvedStartedAt + IMPACT_MS) return 'IMPACT';
      return input.verifyOpen ? 'VERIFICATION' : 'RESULT';
    }

    case 'COOLDOWN':
      return input.verifyOpen ? 'VERIFICATION' : 'RESET';

    case 'ANCHOR_OPEN': {
      const fogStartsAt = input.fogStartsAt;
      const inFog = input.tideFrozen || (fogStartsAt !== null && input.now >= fogStartsAt);
      if (!inFog) return input.hasBet ? 'LOCKED' : 'SELECTING';

      // Spending the one hidden order ends the decision immediately: there is
      // nothing left to decide, so saying "sealed" is the truthful screen.
      if (input.finalOrderUsed) return 'FINAL_LOCK';

      const beats = fogBeats(fogStartsAt ?? input.now, input.phaseEndsAt);
      if (input.now < beats.fogUntil) return 'FOG';
      if (input.now < beats.tideUntil) return 'TIDE_REPORT';
      if (input.now < beats.finalOrderUntil) return 'FINAL_ORDER';
      return 'FINAL_LOCK';
    }
  }
}

/**
 * RESOLVED's duration as the client assumes it when splitting IMPACT from
 * RESULT. It only ever moves a ~1 s presentation boundary — a room running a
 * different `resolvedMs` shows a slightly longer or shorter strike beat and
 * nothing else — so it deliberately does NOT need to be published on the wire.
 */
export const RESOLVED_ASSUMED_MS = 3_000;

/* ============================== labels ============================== */

/**
 * The one-line instruction per state. This is the whole beginner interface's
 * copy in one place: if a state cannot be described in a short sentence, the
 * state is wrong.
 */
export const STATE_HINT: Record<RoundState, string> = {
  IDLE: 'Connecting…',
  SELECTING: 'Choose a harbor',
  LOCKED: 'Locked in — you can still change',
  FOG: 'Fog rolling in',
  TIDE_REPORT: 'Tide report',
  FINAL_ORDER: 'Final order — keep or change',
  FINAL_LOCK: 'Locked. No more changes',
  REVEAL: 'The storm is choosing',
  IMPACT: 'Landfall',
  RESULT: 'Round result',
  VERIFICATION: 'Round result',
  RESET: 'Next round',
};
