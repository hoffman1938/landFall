/**
 * The D5 unlock triggers, hoisted out of the deck.
 *
 * They used to live in `ControlDeck`'s effects, which was fine while there was
 * exactly one deck. v4 added a second one: beginner mode renders `BeginnerDeck`
 * and never mounts `ControlDeck` at all — so for a brand-new player, the one
 * player these unlocks exist for, `roundsCompleted` stayed at zero forever. The
 * deck's own unlocks would have fired the moment they switched to the advanced
 * board, and the advanced-mode offer (which is gated on the same counter) would
 * never have been made at all.
 *
 * So the triggers belong to the app, not to a deck: mounted once in `App`, they
 * run in both layouts and count the same rounds.
 */
import { useEffect } from 'react';
import {
  getDeckProgress,
  updateDeckProgress,
  withRivalFlagSeen,
  withRoundCompleted,
} from './deckProgress';
import { useStore } from './store';

export function useDeckProgressTriggers(): void {
  const landfallRoundId = useStore((s) => s.lastLandfall?.roundId);
  const signals = useStore((s) => s.signals);
  const myName = useStore((s) => s.name);

  // A round is counted once, by id — remounts and reconnects cannot double it.
  useEffect(() => {
    if (landfallRoundId === undefined) return;
    updateDeckProgress(withRoundCompleted(getDeckProgress(), landfallRoundId));
  }, [landfallRoundId]);

  // Curiosity beats the schedule: seeing someone else fly a flag unlocks flags.
  useEffect(() => {
    if (myName === null) return;
    if (signals.some((s) => s.name !== myName)) {
      updateDeckProgress(withRivalFlagSeen(getDeckProgress()));
    }
  }, [signals, myName]);
}
