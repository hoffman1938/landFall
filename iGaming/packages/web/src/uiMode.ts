/**
 * Beginner / Advanced — progressive disclosure one level above the deck.
 *
 * `deckProgress.ts` (D5) already unlocks controls INSIDE the deck as a player
 * plays. This is the layer above it: which SURFACES exist at all.
 *
 * The reasoning is the brief's, and it is simple. A first-time player has to
 * hold four ideas — choose a harbor, lock in, watch the storm, see the result.
 * The shipped dashboard puts a session P&L curve, a chat column, a jackpot
 * ticker, a weather chip, a round id and a room switcher on screen at the same
 * time. Every one of those is useful to somebody, and none of them is useful to
 * a person who has not yet placed a bet.
 *
 * So beginner mode does not simplify the game — it hides the instruments until
 * the player has a reason to want one, and offers the switch rather than
 * forcing it. Nothing is removed: `advanced` is the shipped dashboard, every
 * advanced surface is one tap away from beginner mode via the Advanced sheet,
 * and the choice is remembered per profile and never quietly reversed.
 */
import { useSyncExternalStore } from 'react';

export type UiMode = 'beginner' | 'advanced';

/** Completed rounds after which advanced mode is OFFERED (never imposed). */
export const ADVANCED_OFFER_ROUNDS = 5;

export interface UiModeState {
  version: 1;
  mode: UiMode;
  /** The player has answered the offer, either way — never ask twice. */
  offerAnswered: boolean;
}

export interface UiSurfaces {
  /** Left telemetry rail: session curve, round stats, the record. */
  showTelemetryRail: boolean;
  /** Right chat / activity column. */
  showActivityPanel: boolean;
  /** Room switcher, round id, weather chip, jackpot ticker in the top bar. */
  showTopBarInstruments: boolean;
  /** Exact pot figures on the harbor cards before the lock snapshot. */
  showHarborDetail: boolean;
  /** Play style (1 harbor / 2 harbors) and signal flags in the deck. */
  showTacticalControls: boolean;
}

export function surfacesFor(mode: UiMode): UiSurfaces {
  const advanced = mode === 'advanced';
  return {
    showTelemetryRail: advanced,
    showActivityPanel: advanced,
    showTopBarInstruments: advanced,
    showHarborDetail: advanced,
    showTacticalControls: advanced,
  };
}

export function freshUiMode(): UiModeState {
  return { version: 1, mode: 'beginner', offerAnswered: false };
}

/**
 * A profile that existed before this pass has already learned the dashboard.
 * Dropping it back into beginner mode would be a downgrade dressed as
 * onboarding, so returning players keep everything they had.
 */
export function grandfatheredUiMode(): UiModeState {
  return { version: 1, mode: 'advanced', offerAnswered: true };
}

/** Should the "unlock the full board?" offer be shown right now? */
export function shouldOfferAdvanced(state: UiModeState, roundsCompleted: number): boolean {
  return (
    state.mode === 'beginner' && !state.offerAnswered && roundsCompleted >= ADVANCED_OFFER_ROUNDS
  );
}

export function withMode(state: UiModeState, mode: UiMode): UiModeState {
  return state.mode === mode ? state : { ...state, mode, offerAnswered: true };
}

export function withOfferDismissed(state: UiModeState): UiModeState {
  return state.offerAnswered ? state : { ...state, offerAnswered: true };
}

/* ---------- persistence + shared react store ---------- */

const STORAGE_KEY = 'landfall.ui-mode.v1';

/**
 * Sampled at module load, before the socket can deliver WELCOME and write
 * `landfall.playerId` — the same race `deckProgress.ts` documents. Reading it
 * lazily would mis-grandfather a brand-new profile on a fast connection.
 */
const HAD_PLAYER_ID_AT_BOOT = (() => {
  try {
    return (
      typeof window !== 'undefined' && window.localStorage.getItem('landfall.playerId') !== null
    );
  } catch {
    return false;
  }
})();

function readStored(): UiModeState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      /*
       * Decide once, then WRITE IT DOWN.
       *
       * The grandfathering test is "did this browser already have a playerId
       * when the page booted?", and a brand-new player acquires one within a
       * second of arriving — the WELCOME message stores it. So a first-time
       * player who simply reloads would boot a second time, test true, and be
       * dropped into the full dashboard they have never seen. Persisting the
       * verdict on the first read makes the classification a fact about the
       * profile rather than about how many times the tab has been refreshed.
       */
      const decided = HAD_PLAYER_ID_AT_BOOT ? grandfatheredUiMode() : freshUiMode();
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(decided));
      } catch {
        // Storage disabled: the player simply gets the same decision next boot.
      }
      return decided;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return freshUiMode();
    const c = parsed as Partial<UiModeState>;
    if (c.version !== 1) return freshUiMode();
    return {
      version: 1,
      mode: c.mode === 'advanced' ? 'advanced' : 'beginner',
      offerAnswered: c.offerAnswered === true,
    };
  } catch {
    return freshUiMode();
  }
}

let current: UiModeState | null = null;
const listeners = new Set<() => void>();

export function getUiMode(): UiModeState {
  if (current === null) current = readStored();
  return current;
}

export function setUiMode(next: UiModeState): void {
  if (next === getUiMode()) return; // pure transitions return the same object on a no-op
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be disabled; the mode then resets next session — harmless.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUiMode(): UiModeState {
  return useSyncExternalStore(subscribe, getUiMode);
}

export function useSurfaces(): UiSurfaces {
  return surfacesFor(useUiMode().mode);
}
