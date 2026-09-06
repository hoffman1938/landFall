/**
 * Dashboard shell. Five zones, and nothing else competes for the screen:
 *
 *   TOP BAR      identity, table, jackpot, balance, settings — one hairline row
 *   LEFT RAIL    telemetry: session curve, this round, zone flow, the record
 *   BOARD        the plot area — zones, storm, and the round's leading figure
 *   RIGHT PANEL  chat / activity, collapsed by default
 *   DECK         stake, mode and the single primary action, always visible
 *
 * The rails are chrome (bg-2) and the board is the darkest surface on screen,
 * so the eye falls into the middle of the layout without a single shadow or
 * gradient doing the work. Below 1280px the rails become launcher-opened
 * drawers and the board takes the whole width — on a phone the board IS the
 * product, and a dashboard that cannot collapse is not a dashboard.
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
import { TelemetryRail } from './components/TelemetryRail';
import { TopBar } from './components/TopBar';
import { VerifyModal } from './components/VerifyModal';
import { WelcomeGate } from './components/WelcomeGate';
import { WreckLog } from './components/WreckLog';
import { WreckLogSheet } from './components/WreckLogSheet';
import { useStore } from './store';

const HarborMap = lazy(() =>
  import('./components/HarborMap').then((module) => ({ default: module.HarborMap })),
);

export default function App() {
  const toast = useStore((s) => s.toast);
  const toastTone = useStore((s) => s.toastTone);
  const dismissToast = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 3500);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  return (
    <div className="flex h-full flex-col bg-[var(--lf-bg)]">
      <TopBar />
      <main className="relative flex min-h-0 flex-1">
        <TelemetryRail />

        {/* the board: plot area + overlays + control deck */}
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

          <WreckLog />
          <StormClock />
          <TableIntro />
          <ResultBanner />
          <ControlDeck />

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
      {/* Entry gate — rules, then a table choice, before the first bet. */}
      <WelcomeGate />
    </div>
  );
}
