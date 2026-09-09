/**
 * Progressive deck disclosure (remediation D5) — the UX doc §6.3 schedule for
 * the deck itself. A fresh profile sees three control groups (stake stepper,
 * presets, primary button); the rest unlocks as the player plays:
 *
 *   Focus/Split  after MODE_UNLOCK_ROUNDS completed rounds, or by tapping the
 *                dimmed teaser (which appears after the first completed round —
 *                a truly fresh profile sees exactly three groups);
 *   Flags        after FLAG_UNLOCK_ROUNDS completed rounds, or on the first
 *                rival flag seen (curiosity beats the schedule);
 *   ×2 ½ MAX     once the stake has been edited for the first time.
 *
 * Everything is monotonic: an unlock never re-locks, an expert is never
 * re-gated. Profiles that existed before D5 (a persisted playerId with no
 * progress record) are grandfathered fully unlocked. State transitions are
 * pure (unit-tested in test/deckProgress.test.ts); localStorage + a
 * useSyncExternalStore hook live at the bottom.
 */
import { useSyncExternalStore } from 'react';

export const MODE_UNLOCK_ROUNDS = 3;
export const FLAG_UNLOCK_ROUNDS = 5;

export interface DeckProgress {
  version: 1;
  roundsCompleted: number;
  /** Guards double-counting a round across remounts/reconnects. */
  lastCountedRoundId: number | null;
  stakeEdited: boolean;
  rivalFlagSeen: boolean;
  modesUnlockedByTap: boolean;
  /** Settings toggle: show every control immediately. */
  expert: boolean;
}

export interface DeckDisclosure {
  /** Focus/Split segmented control, fully interactive. */
  showModeToggle: boolean;
  /** Dimmed tap-to-unlock teaser in the mode slot (same footprint). */
  showModeTeaser: boolean;
  /** Signal-flag button (only ever visible while anchored). */
  showFlags: boolean;
  /** The ×2 / ½ / MAX chips after the presets. */
  showStakeTricks: boolean;
}

export function freshDeckProgress(): DeckProgress {
  return {
    version: 1,
    roundsCompleted: 0,
    lastCountedRoundId: null,
    stakeEdited: false,
    rivalFlagSeen: false,
    modesUnlockedByTap: false,
    expert: false,
  };
}

/** Pre-D5 profiles already know the deck — never re-gate a returning player. */
export function grandfatheredDeckProgress(): DeckProgress {
  return {
    ...freshDeckProgress(),
    roundsCompleted: FLAG_UNLOCK_ROUNDS,
    stakeEdited: true,
  };
}

export function resolveDisclosure(p: DeckProgress): DeckDisclosure {
  const modes = p.expert || p.modesUnlockedByTap || p.roundsCompleted >= MODE_UNLOCK_ROUNDS;
  return {
    showModeToggle: modes,
    showModeTeaser: !modes && p.roundsCompleted >= 1,
    showFlags: p.expert || p.rivalFlagSeen || p.roundsCompleted >= FLAG_UNLOCK_ROUNDS,
    showStakeTricks: p.expert || p.stakeEdited,
  };
}

/* ---------- pure transitions ---------- */

export function withRoundCompleted(p: DeckProgress, roundId: number): DeckProgress {
  if (p.lastCountedRoundId === roundId) return p;
  return { ...p, roundsCompleted: p.roundsCompleted + 1, lastCountedRoundId: roundId };
}

export function withStakeEdited(p: DeckProgress): DeckProgress {
  return p.stakeEdited ? p : { ...p, stakeEdited: true };
}

export function withRivalFlagSeen(p: DeckProgress): DeckProgress {
  return p.rivalFlagSeen ? p : { ...p, rivalFlagSeen: true };
}

export function withModesUnlockedByTap(p: DeckProgress): DeckProgress {
  return p.modesUnlockedByTap ? p : { ...p, modesUnlockedByTap: true };
}

export function withExpert(p: DeckProgress, expert: boolean): DeckProgress {
  return p.expert === expert ? p : { ...p, expert };
}

/* ---------- persistence + shared react store ---------- */

const STORAGE_KEY = 'landfall.deck-progress.v1';

/**
 * Sampled at module load — synchronously, before the store's WebSocket can
 * possibly deliver WELCOME (which writes landfall.playerId). Reading it lazily
 * would race a fast connection and mis-grandfather a brand-new profile.
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

function readStored(): DeckProgress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      // No record: a profile that has played before D5 shipped is a veteran.
      return HAD_PLAYER_ID_AT_BOOT ? grandfatheredDeckProgress() : freshDeckProgress();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || (parsed as DeckProgress).version !== 1) {
      return freshDeckProgress();
    }
    const c = parsed as Partial<DeckProgress>;
    return {
      version: 1,
      roundsCompleted:
        typeof c.roundsCompleted === 'number' && c.roundsCompleted >= 0 ? c.roundsCompleted : 0,
      lastCountedRoundId: typeof c.lastCountedRoundId === 'number' ? c.lastCountedRoundId : null,
      stakeEdited: c.stakeEdited === true,
      rivalFlagSeen: c.rivalFlagSeen === true,
      modesUnlockedByTap: c.modesUnlockedByTap === true,
      expert: c.expert === true,
    };
  } catch {
    return freshDeckProgress();
  }
}

let current: DeckProgress | null = null;
const listeners = new Set<() => void>();

export function getDeckProgress(): DeckProgress {
  if (current === null) current = readStored();
  return current;
}

export function updateDeckProgress(next: DeckProgress): void {
  if (next === getDeckProgress()) return; // pure transitions return the same object when no-op
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be disabled; disclosure then resets next session — harmless.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDeckProgress(): DeckProgress {
  return useSyncExternalStore(subscribe, getDeckProgress);
}
