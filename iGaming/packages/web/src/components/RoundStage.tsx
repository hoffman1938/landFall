/**
 * The stage — one overlay slot above the board, and exactly one thing in it.
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
 *      TIDE_REPORT              the crowd card
 *      FINAL_ORDER/FINAL_LOCK   keep / change, then LOCKED
 *      RESULT/VERIFICATION/RESET  the result card
 *      everything else          nothing — the board is the message
 *
 * The signal-flag card is the single exception, and it is placed in a different
 * corner rather than in this slot, because it is ambient information rather
 * than the round's current question.
 */
import { useStore } from '../store';
import { FinalOrderBar } from './FinalOrderBar';
import { RoundResultCard } from './RoundResultCard';
import { SignalFlagCard } from './SignalFlagCard';
import { TideReportCard } from './TideReportCard';
import type { RoundState } from '../roundMachine';

export function RoundStage({ state }: { state: RoundState }) {
  const tideReport = useStore((s) => s.tideReport);

  return (
    <>
      {/* the one slot, sitting clear of the deck */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-3"
        style={{ bottom: 'calc(var(--lf-control-deck-height, 7.5rem) + 0.75rem)' }}
      >
        {state === 'TIDE_REPORT' && <TideReportCard report={tideReport} />}
        {(state === 'FINAL_ORDER' || state === 'FINAL_LOCK') && <FinalOrderBar state={state} />}
        {(state === 'RESULT' || state === 'VERIFICATION' || state === 'RESET') && (
          <RoundResultCard state={state} />
        )}
      </div>

      {/* ambient, and deliberately not in the slot above */}
      <div className="pointer-events-none absolute left-3 top-3 z-[9] hidden lg:block">
        <SignalFlagCard state={state} />
      </div>
    </>
  );
}
