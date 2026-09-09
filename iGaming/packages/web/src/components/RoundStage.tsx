/**
 * The stage — the round's own surface, and exactly one of them.
 *
 * This component exists to enforce a rule the brief states and the shipped
 * client broke: **avoid multiple simultaneous popups**. Before this pass the
 * tide report, the fog notice, the result banner, the storm-power chip, the
 * jackpot chip and the replay strip could all be on screen at once, stacked
 * upward from the deck, at the exact second a player is asking the simplest
 * question they will ever ask.
 *
 * Here the round state chooses the surface, and there is only ever one:
 *
 *      TIDE_REPORT                the crowd card
 *      FINAL_ORDER/FINAL_LOCK     keep / change, then LOCKED
 *      RESULT/VERIFICATION/RESET  the result card
 *      everything else            nothing — the board is the message
 *
 * It does NOT position itself. The shell owns one bottom column holding this
 * slot with the notice band beneath it, so a card and a toast stack instead of
 * landing in the same pixels — which is what happened when three components
 * each pinned themselves to `bottom: calc(deck + 0.75rem)` independently.
 */
import { useStore } from '../store';
import { FinalOrderBar } from './FinalOrderBar';
import { RoundResultCard } from './RoundResultCard';
import { TideReportCard } from './TideReportCard';
import type { RoundState } from '../roundMachine';

export function RoundStage({ state }: { state: RoundState }) {
  const tideReport = useStore((s) => s.tideReport);

  if (state === 'TIDE_REPORT') return <TideReportCard report={tideReport} />;
  if (state === 'FINAL_ORDER' || state === 'FINAL_LOCK') return <FinalOrderBar state={state} />;
  if (state === 'RESULT' || state === 'VERIFICATION' || state === 'RESET') {
    return <RoundResultCard state={state} />;
  }
  return null;
}
