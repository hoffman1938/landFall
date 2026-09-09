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
import { BoardNotices } from './components/BoardNotices';
import { ControlDeck } from './components/ControlDeck';
import { LimitsModal } from './components/LimitsModal';
import { RealityCheck } from './components/RealityCheck';
import { RoundStage } from './components/RoundStage';
import { RulesModal } from './components/RulesModal';
import { SecondaryPanel } from './components/SecondaryPanel';
import { SkipperCard } from './components/SkipperCard';
import { SignalFlagCard } from './components/SignalFlagCard';
import { StormClock } from './components/StormClock';
import { TelemetryRail } from './components/TelemetryRail';
import { TopBar } from './components/TopBar';
import { VerifyModal } from './components/VerifyModal';
import { WelcomeGate } from './components/WelcomeGate';
import { WreckLog } from './components/WreckLog';
import { WreckLogSheet } from './components/WreckLogSheet';
import { useDeckProgressTriggers } from './useDeckProgressTriggers';
import { useRoundState } from './useRoundState';
import { useBoardTopBand } from './useShortViewport';
import { useUiMode } from './uiMode';
import { useStore } from './store';

const HarborMap = lazy(() =>
  import('./components/HarborMap').then((module) => ({ default: module.HarborMap })),
);

export default function App() {
  const toast = useStore((s) => s.toast);
  const dismissToast = useStore((s) => s.dismissToast);
  const roundState = useRoundState();
  const uiMode = useUiMode();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const beginner = uiMode.mode === 'beginner';
  const topBand = useBoardTopBand();

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

          {/*
            Ambient signal card. `top-14` clears the history strip (`top-2`,
            36px tall) that the advanced board puts in the same corner — at
            `top-3` the two drew straight through each other. It keeps the
            offset in beginner mode too: one geometry beats two.
          */}
          <div className="pointer-events-none absolute left-3 top-14 z-[var(--lf-z-hud)] hidden lg:block">
            <SignalFlagCard state={roundState} />
          </div>

          {/*
            ONE bottom column. The round's surface and the notice band are
            siblings in a flex column anchored above the deck, so they stack
            rather than overlap; previously three components pinned themselves
            to this same offset independently and any two could collide.
          */}
          <div
            className="pointer-events-none absolute inset-x-0 z-[var(--lf-z-stage)] flex flex-col items-center justify-end gap-2 overflow-hidden px-3"
            style={{
              top: topBand,
              bottom: 'calc(var(--lf-control-deck-height, 7.5rem) + 0.75rem)',
            }}
          >
            <RoundStage state={roundState} />
            <BoardNotices state={roundState} />
          </div>

          {beginner ? <BeginnerDeck state={roundState} /> : <ControlDeck />}
        </div>

        {!beginner && <SecondaryPanel />}
      </main>

      <AdvancedSheet open={advancedOpen} onClose={() => setAdvancedOpen(false)} />

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
