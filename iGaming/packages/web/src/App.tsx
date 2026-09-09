/**
 * The shell — two layouts over one game.
 *
 * BEGINNER (the default for a new profile)
 *
 *   ┌──────────────────────────────────────┐
 *   │ LANDFALL          12.50   ADVANCED   │  three items
 *   ├──────────────────────────────────────┤
 *   │                                      │
 *   │        the board: six harbors,      │  everything
 *   │        the storm, one overlay        │
 *   │                                      │
 *   ├──────────────────────────────────────┤
 *   │  − 5.00 +   [ LOCK IN ]              │  one action
 *   └──────────────────────────────────────┘
 *
 * ADVANCED — the shipped dashboard, unchanged: telemetry rail, chat column,
 * full top bar, full control deck, plus the same round overlays.
 *
 * Both render from `useRoundState()`, so the two layouts can never disagree
 * about what phase the round is in. The mode is a persisted per-profile choice
 * (uiMode.ts), offered after five rounds and reversible from the Advanced
 * sheet. Nothing is deleted in beginner mode — everything advanced is one tap
 * away, which is the whole difference between hiding and removing.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { BeginnerDeck } from './components/BeginnerDeck';
import { BeginnerTopBar } from './components/BeginnerTopBar';
import { AdvancedSheet } from './components/AdvancedSheet';
import { ControlDeck } from './components/ControlDeck';
import { LimitsModal } from './components/LimitsModal';
import { RealityCheck } from './components/RealityCheck';
import { ResultBanner } from './components/ResultBanner';
import { RoundStage } from './components/RoundStage';
import { RulesModal } from './components/RulesModal';
import { SecondaryPanel } from './components/SecondaryPanel';
import { SkipperCard } from './components/SkipperCard';
import { StormClock } from './components/StormClock';
import { TableIntro } from './components/TableIntro';
import { TelemetryRail } from './components/TelemetryRail';
import { TopBar } from './components/TopBar';
import { VerifyModal } from './components/VerifyModal';
import { WelcomeGate } from './components/WelcomeGate';
import { WreckLog } from './components/WreckLog';
import { WreckLogSheet } from './components/WreckLogSheet';
import { useDeckProgress } from './deckProgress';
import { useDeckProgressTriggers } from './useDeckProgressTriggers';
import { useRoundState } from './useRoundState';
import type { RoundState } from './roundMachine';
import {
  getUiMode,
  setUiMode,
  shouldOfferAdvanced,
  useUiMode,
  withMode,
  withOfferDismissed,
} from './uiMode';
import { useStore } from './store';

const HarborMap = lazy(() =>
  import('./components/HarborMap').then((module) => ({ default: module.HarborMap })),
);

export default function App() {
  const toast = useStore((s) => s.toast);
  const toastTone = useStore((s) => s.toastTone);
  const dismissToast = useStore((s) => s.dismissToast);
  const roundState = useRoundState();
  const uiMode = useUiMode();
  const progress = useDeckProgress();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const beginner = uiMode.mode === 'beginner';

  // Counts rounds and first-flag sightings for BOTH layouts (see the module).
  useDeckProgressTriggers();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 3500);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  return (
    <div className="flex h-full flex-col bg-[var(--lf-bg)]">
      {beginner ? <BeginnerTopBar onOpenAdvanced={() => setAdvancedOpen(true)} /> : <TopBar />}

      <main className="relative flex min-h-0 flex-1">
        {!beginner && <TelemetryRail />}

        {/* the board — in beginner mode it is the entire window */}
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0">
            <Suspense
              fallback={
                <div className="lf-bay flex h-full w-full items-center justify-center">
                  <span className="lf-label">Loading board</span>
                </div>
              }
            >
              <HarborMap />
            </Suspense>
          </div>

          {!beginner && <WreckLog />}
          <StormClock />
          <TableIntro />

          {/* One overlay slot, one thing in it (RoundStage enforces this). The
              old ResultBanner keeps its job on the advanced board, where the
              storm-power chip and replay strip still have an audience. */}
          <RoundStage state={roundState} />
          {!beginner && <ResultBanner />}

          {beginner ? <BeginnerDeck state={roundState} /> : <ControlDeck />}

          {/* error toast — above the deck, never a modal */}
          {toast && (
            <div
              role={toastTone === 'error' ? 'alert' : 'status'}
              aria-live={toastTone === 'error' ? 'assertive' : 'polite'}
              className={`lf-rise absolute left-1/2 z-30 max-w-[min(92vw,34rem)] -translate-x-1/2 rounded-md border bg-[var(--lf-surface)] px-4 py-2 text-center text-sm font-semibold text-[var(--lf-text)] ${
                toastTone === 'error'
                  ? 'border-[var(--lf-accent-line)]'
                  : 'border-[var(--lf-line-2)]'
              }`}
              style={{ bottom: 'calc(var(--lf-control-deck-height, 7.5rem) + 0.75rem)' }}
            >
              {toast}
            </div>
          )}
        </div>

        {!beginner && <SecondaryPanel />}
      </main>

      <AdvancedSheet open={advancedOpen} onClose={() => setAdvancedOpen(false)} />
      <AdvancedOffer roundsCompleted={progress.roundsCompleted} state={roundState} />

      <VerifyModal />
      <RulesModal />
      {/* E1/E2: cosmetic skipper cards + replay-card Wreck Log. */}
      <SkipperCard />
      <WreckLogSheet />
      {/* F1/F2: play limits, session clock, self-exclusion, reality checks. */}
      <LimitsModal />
      <RealityCheck />
      {/* Entry gate — rules, then a table choice, before the first bet. */}
      <WelcomeGate />
    </div>
  );
}

/**
 * The one time the product asks a beginner a question.
 *
 * It arrives after five completed rounds — long enough that the player has
 * their own reason to want more, short enough that they have not yet decided
 * the game is shallow. It is a strip above the deck rather than a modal,
 * because it must never interrupt a live round, and it is asked exactly once
 * either way.
 */
function AdvancedOffer({ roundsCompleted, state }: { roundsCompleted: number; state: RoundState }) {
  const uiMode = useUiMode();
  // SELECTING only. It shares the overlay slot with the tide report, the final
  // order and the result card, and the one rule that slot exists to enforce is
  // that exactly one thing is ever in it. SELECTING is the only state where the
  // slot is empty AND the player has nothing they must read.
  if (state !== 'SELECTING') return null;
  if (!shouldOfferAdvanced(uiMode, roundsCompleted)) return null;

  return (
    <div
      className="lf-rise pointer-events-auto fixed left-1/2 z-30 flex w-[min(94vw,30rem)] -translate-x-1/2 items-center gap-3 rounded-md border border-[var(--lf-line-2)] bg-[var(--lf-surface)] px-3 py-2.5"
      style={{ bottom: 'calc(var(--lf-control-deck-height, 7.5rem) + 0.75rem)' }}
      role="status"
    >
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--lf-text)]">
        There is more here: play styles, signals, live table activity and your session chart.
      </p>
      <button
        type="button"
        onClick={() => setUiMode(withMode(getUiMode(), 'advanced'))}
        className="min-h-[40px] shrink-0 rounded-md border border-white px-3 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--lf-text)]"
      >
        Show me
      </button>
      <button
        type="button"
        onClick={() => setUiMode(withOfferDismissed(getUiMode()))}
        aria-label="Keep the simple board"
        className="min-h-[40px] shrink-0 px-2 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--lf-mute)] hover:text-[var(--lf-text)]"
      >
        No thanks
      </button>
    </div>
  );
}
