/**
 * `useRoundState()` — the single value every surface renders from.
 *
 * The machine itself is pure (roundMachine.ts). This is the only place that
 * gives it a clock, and it does so once for the whole app: one shared 80 ms
 * tick feeding a `useSyncExternalStore` snapshot, rather than a `setInterval`
 * inside each of the six components that need to know whether the fog is in.
 * Before this pass three components each re-derived "is it fog?" from a phase,
 * a frozen flag and a timestamp, and they did not always agree.
 *
 * The transition guard runs here too, so a state the machine would reach
 * illegally never reaches a component at all.
 */
import { useSyncExternalStore } from 'react';
import {
  deriveRoundState,
  nextRoundState,
  type RoundState,
  type RoundStateInput,
} from './roundMachine';
import { useStore } from './store';

/** Fast enough that a beat boundary is never visibly late, cheap enough to be free. */
const TICK_MS = 80;

const listeners = new Set<() => void>();
/** The current state, and the `from` side of every transition check. */
let snapshot: RoundState = 'IDLE';
/**
 * The round the snapshot belongs to. When this changes, the transition table's
 * within-round bans no longer apply — see `nextRoundState`. Without it, a
 * player who left the Verify sheet open across a round boundary stayed in
 * VERIFICATION forever, with a stale result card over a live betting window.
 */
let snapshotRoundId: number | null = null;
/** Live while at least one component is mounted. */
let running: { interval: ReturnType<typeof setInterval>; unsubStore: () => void } | null = null;

function readInput(): RoundStateInput {
  const s = useStore.getState();
  return {
    connected: s.connected,
    phase: s.phase?.phase ?? null,
    phaseEndsAt: s.phase?.endsAt ?? 0,
    fogStartsAt: s.round?.fogStartsAt ?? null,
    hasBet: s.myFleet !== null,
    finalOrderUsed: s.finalOrderUsed,
    tideFrozen: s.tideReport?.frozen ?? false,
    verifyOpen: s.verifyRoundId !== null,
    now: Date.now(),
  };
}

function recompute(): void {
  const roundId = useStore.getState().round?.roundId ?? null;
  const roundChanged = roundId !== snapshotRoundId;
  const next = nextRoundState(snapshot, deriveRoundState(readInput()), roundChanged);
  snapshotRoundId = roundId;
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (running === null) {
    // Store changes drive the instant transitions (a bet lands, LANDFALL
    // arrives); the interval exists only for the purely temporal boundaries,
    // which is the fog's four beats and the impact beat.
    running = {
      interval: setInterval(recompute, TICK_MS),
      unsubStore: useStore.subscribe(recompute),
    };
  }
  recompute();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && running !== null) {
      clearInterval(running.interval);
      running.unsubStore();
      running = null;
    }
  };
}

function getSnapshot(): RoundState {
  return snapshot;
}

export function useRoundState(): RoundState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Non-hook read, for imperative call sites such as the Pixi scene bridge. */
export function readRoundState(): RoundState {
  return snapshot;
}
