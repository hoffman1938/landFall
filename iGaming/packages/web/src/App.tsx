/**
 * Four-zone shell: slim TopBar, compact wreck-history strip, the dominant
 * minimal chart bay, and a persistent bottom ControlDeck. Secondary
 * information (chat/activity) lives in one collapsible SecondaryPanel
 * that docks as a column on wide screens and becomes a drawer/sheet below.
 */
import { lazy, Suspense, useEffect } from 'react';
import { ControlDeck } from './components/ControlDeck';
import { LimitsModal } from './components/LimitsModal';
import { RealityCheck } from './components/RealityCheck';
import { ResultBanner } from './components/ResultBanner';
import { RulesModal } from './components/RulesModal';
import { SecondaryPanel } from './components/SecondaryPanel';
import { SkipperCard } from './components/SkipperCard';
import { StormClock } from './components/StormClock';
import { TableIntro } from './components/TableIntro';
import { TopBar } from './components/TopBar';
import { VerifyModal } from './components/VerifyModal';
import { WreckLog } from './components/WreckLog';
import { WreckLogSheet } from './components/WreckLogSheet';
import { useStore } from './store';

const HarborMap = lazy(() =>
  import('./components/HarborMap').then((module) => ({ default: module.HarborMap })),
);

export default function App() {
  const toast = useStore((s) => s.toast);
  const dismissToast = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 3500);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="relative flex min-h-0 flex-1">
        {/* the stage: bay + overlays + control deck */}
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0">
            <Suspense
              fallback={
                <div className="lf-bay flex h-full w-full items-center justify-center">
                  <span className="lf-surface rounded-full px-4 py-2 text-sm font-semibold text-[var(--lf-dim)]">
                    Preparing the bay…
                  </span>
                </div>
              }
            >
              <HarborMap />
            </Suspense>
          </div>

          <WreckLog />
          <StormClock />
          <TableIntro />
          <ResultBanner />
          <ControlDeck />

          {/* error toast — above the deck, never a modal */}
          {toast && (
            <div
              role="alert"
              aria-live="assertive"
              className="lf-rise lf-surface absolute left-1/2 z-30 -translate-x-1/2 rounded-lg border !border-[var(--lf-danger)]/60 px-4 py-2 text-sm font-semibold text-[var(--lf-text)]"
              style={{ bottom: 'calc(var(--lf-control-deck-height, 7.5rem) + 0.75rem)' }}
            >
              {toast}
            </div>
          )}
        </div>

        {/* chat / activity */}
        <SecondaryPanel />
      </main>
      <VerifyModal />
      <RulesModal />
      {/* E1/E2: cosmetic skipper cards + replay-card Wreck Log. */}
      <SkipperCard />
      <WreckLogSheet />
      {/* F1/F2: play limits, session clock, self-exclusion, reality checks. */}
      <LimitsModal />
      <RealityCheck />
    </div>
  );
}
