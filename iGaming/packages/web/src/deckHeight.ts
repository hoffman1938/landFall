/**
 * The control deck's live height, as a value both React and Pixi can react to.
 *
 * The decks have always published this as the CSS variable
 * `--lf-control-deck-height`, which is right for the things that only need to
 * POSITION against it (the overlay slot sits `deck + 0.75rem` from the bottom).
 * It is wrong for the things that need to RE-LAYOUT when it changes: the board
 * reserves the deck's band when it places the six harbors, and a CSS variable
 * is not something a React render or a Pixi scene can subscribe to. The board
 * would keep the old band until something else happened to trigger a layout.
 *
 * So the decks write both: the variable for CSS, and this store for code.
 */
import { useSyncExternalStore } from 'react';

/** Matches the CSS fallback, for the frames before a deck has measured itself. */
const DEFAULT_HEIGHT = 120;

let height = DEFAULT_HEIGHT;
const listeners = new Set<() => void>();

export function getDeckHeight(): number {
  return height;
}

export function setDeckHeight(next: number): void {
  if (!Number.isFinite(next) || next <= 0) return;
  const rounded = Math.round(next);
  if (rounded === height) return;
  height = rounded;
  // Keep the CSS variable in step: it is what positions the overlay slot.
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--lf-control-deck-height', `${rounded}px`);
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDeckHeight(): number {
  return useSyncExternalStore(subscribe, getDeckHeight, getDeckHeight);
}

/** For the Pixi scene, which is not a React component. */
export function subscribeDeckHeight(listener: () => void): () => void {
  return subscribe(listener);
}
