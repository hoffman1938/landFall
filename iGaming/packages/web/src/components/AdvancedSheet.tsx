/**
 * The Advanced sheet — everything a beginner does not need, one tap away.
 *
 * The rule this enforces: nothing is REMOVED from the product in beginner mode,
 * only moved. A player who wants the crowd table, the play style, the flags,
 * the history, the fairness record or the full dashboard finds all six here,
 * in the order they tend to be wanted, on a surface that can be dismissed.
 *
 * It is a bottom sheet rather than a modal because it is reached one-handed on
 * a phone and because a modal in the middle of a 20-second round would hide the
 * board. It closes on Escape, on the scrim, and on the handle.
 */
import { useEffect, useRef } from 'react';
import { SPLIT_PRIMARY_PERCENT } from '@landfall/core';
import { useStore } from '../store';
import { STR, zoneName } from '../strings';
import { setUiMode, useUiMode, withMode } from '../uiMode';
import { TideReportCard } from './TideReportCard';
import { ShieldCheckIcon, SplitBoatsIcon, BoatIcon, XIcon } from './icons';

export function AdvancedSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const tideReport = useStore((s) => s.tideReport);
  const wreckLog = useStore((s) => s.wreckLog);
  const round = useStore((s) => s.round);
  const environment = useStore((s) => s.environment);
  const chainCommitment = useStore((s) => s.chainCommitment);
  const lastLandfall = useStore((s) => s.lastLandfall);
  const openVerify = useStore((s) => s.openVerify);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const setWreckLogOpen = useStore((s) => s.setWreckLogOpen);
  const fleetMode = useStore((s) => s.fleetMode);
  const setFleetMode = useStore((s) => s.setFleetMode);
  const uiMode = useUiMode();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Advanced"
        className="lf-sheet lf-overlay flex max-h-[86vh] w-full max-w-[30rem] flex-col overflow-y-auto rounded-t-xl sm:rounded-xl"
      >
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--lf-line)] bg-[var(--lf-surface)] px-4 py-3">
          <h2 className="lf-label !text-[var(--lf-text)]">Advanced</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close advanced"
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-md border border-[var(--lf-line)] text-[var(--lf-dim)] transition-colors hover:border-[var(--lf-line-2)] hover:text-[var(--lf-text)]"
          >
            <XIcon size={16} />
          </button>
        </header>

        <div className="flex flex-col gap-3 p-4">
          {/* 1 — play style. The one mechanic a beginner might actually adopt. */}
          <section className="rounded-lg border border-[var(--lf-line)] p-3">
            <h3 className="lf-label">Play style</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <PlayStyleOption
                selected={fleetMode === 'FOCUS'}
                onSelect={() => setFleetMode('FOCUS')}
                title={STR.oneZone}
                body="Your whole bet sits on one harbor. Five of six harbors survive, so most rounds you take a share of the pot."
                icon={<BoatIcon size={18} />}
                diagram={<FocusDiagram />}
              />
              <PlayStyleOption
                selected={fleetMode === 'SPLIT'}
                onSelect={() => setFleetMode('SPLIT')}
                title={STR.twoZones}
                body={`${SPLIT_PRIMARY_PERCENT}% on one harbor, ${100 - SPLIT_PRIMARY_PERCENT}% on another. You are hit more often, and you lose less when you are.`}
                icon={<SplitBoatsIcon size={18} />}
                diagram={<SplitDiagram />}
              />
            </div>
          </section>

          {/* 2 — the crowd, in full. */}
          <section>
            <TideReportCard report={tideReport} />
          </section>

          {/* 3 — history. */}
          <section className="rounded-lg border border-[var(--lf-line)] p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="lf-label">{STR.history}</h3>
              <button
                type="button"
                onClick={() => {
                  setWreckLogOpen(true);
                  onClose();
                }}
                className="min-h-[36px] rounded-md border border-[var(--lf-line)] px-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--lf-dim)] hover:border-[var(--lf-line-2)] hover:text-[var(--lf-text)]"
              >
                Full log
              </button>
            </div>
            <ol className="mt-2 flex flex-wrap gap-1.5" aria-label="Recent hit harbors">
              {wreckLog.length === 0 && (
                <li className="text-[13px] text-[var(--lf-mute)]">No rounds settled yet.</li>
              )}
              {wreckLog
                .slice(-20)
                .reverse()
                .map((zone, i) => (
                  <li
                    key={`${zone}-${i}`}
                    className="lf-num flex h-8 w-8 items-center justify-center rounded border border-[var(--lf-line)] text-[13px] text-[var(--lf-dim)]"
                    title={`${zoneName(zone)} was hit`}
                  >
                    {zone + 1}
                  </li>
                ))}
            </ol>
            <p className="mt-2 text-[12px] leading-snug text-[var(--lf-mute)]">
              Past results are exactly that. Every harbor is drawn at 1 in 6 every round, and no run
              of results changes the next one.
            </p>
          </section>

          {/* 4 — this round's cosmetics, named so the rare ones are recognisable. */}
          {(environment || round) && (
            <section className="rounded-lg border border-[var(--lf-line)] p-3">
              <h3 className="lf-label">This round</h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                {environment && (
                  <>
                    <dt className="text-[var(--lf-mute)]">Sea</dt>
                    <dd className="text-right font-semibold text-[var(--lf-text)]">
                      {environment.label}
                      <span className="ml-1.5 text-[11px] uppercase text-[var(--lf-mute)]">
                        {environment.rarity}
                      </span>
                    </dd>
                  </>
                )}
                {round && (
                  <>
                    <dt className="text-[var(--lf-mute)]">Conditions</dt>
                    <dd className="text-right font-semibold text-[var(--lf-text)]">
                      {round.weather.label}
                    </dd>
                    <dt className="text-[var(--lf-mute)]">Round</dt>
                    <dd className="text-right font-semibold tabular-nums text-[var(--lf-text)]">
                      #{round.roundId}
                    </dd>
                  </>
                )}
              </dl>
              <p className="mt-2 text-[12px] leading-snug text-[var(--lf-mute)]">
                The sea is decoration, drawn from its own sealed number. It cannot move the result —
                and Verify proves that, because the two come from different keys.
              </p>
            </section>
          )}

          {/* 5 — fairness. */}
          <section className="rounded-lg border border-[var(--lf-line)] p-3">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon size={15} />
              <h3 className="lf-label !text-[var(--lf-text)]">{STR.fairness}</h3>
            </div>
            {chainCommitment && (
              <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-[var(--lf-mute)]">
                {chainCommitment}
              </p>
            )}
            <p className="mt-1.5 text-[12px] leading-snug text-[var(--lf-dim)]">
              Every result this season comes from a seed chain committed to that hash before the
              first round. Each round reveals its link, and the link has to hash back.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                disabled={!lastLandfall}
                onClick={() => {
                  if (lastLandfall) openVerify(lastLandfall.roundId);
                  onClose();
                }}
                className="min-h-[44px] flex-1 rounded-md border border-[var(--lf-line)] text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--lf-dim)] hover:border-[var(--lf-line-2)] hover:text-[var(--lf-text)] disabled:opacity-40"
              >
                Verify last round
              </button>
              <button
                type="button"
                onClick={() => {
                  setRulesOpen(true);
                  onClose();
                }}
                className="min-h-[44px] flex-1 rounded-md border border-[var(--lf-line)] text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--lf-dim)] hover:border-[var(--lf-line-2)] hover:text-[var(--lf-text)]"
              >
                How it works
              </button>
            </div>
          </section>

          {/* 6 — the full dashboard. */}
          <section className="rounded-lg border border-[var(--lf-line)] p-3">
            <h3 className="lf-label">Layout</h3>
            <p className="mt-1.5 text-[13px] leading-snug text-[var(--lf-dim)]">
              {uiMode.mode === 'beginner'
                ? 'The full board adds a session chart, live table activity and chat around the harbors.'
                : 'The simple board hides the side panels and leaves the harbors the whole screen.'}
            </p>
            <button
              type="button"
              onClick={() =>
                setUiMode(withMode(uiMode, uiMode.mode === 'beginner' ? 'advanced' : 'beginner'))
              }
              className="mt-2.5 min-h-[44px] w-full rounded-md border border-[var(--lf-line-2)] text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--lf-text)] hover:border-white"
            >
              {uiMode.mode === 'beginner' ? 'Show the full board' : 'Back to the simple board'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function PlayStyleOption({
  selected,
  onSelect,
  title,
  body,
  icon,
  diagram,
}: {
  selected: boolean;
  onSelect(): void;
  title: string;
  body: string;
  icon: React.ReactNode;
  diagram: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-[44px] flex-col gap-1.5 rounded-md border p-2.5 text-left transition-colors ${
        selected
          ? 'border-white bg-[var(--lf-white-soft)]'
          : 'border-[var(--lf-line)] hover:border-[var(--lf-line-2)]'
      }`}
    >
      <span className="flex items-center gap-1.5 text-[14px] font-bold text-[var(--lf-text)]">
        {icon}
        {title}
      </span>
      {diagram}
      <span className="text-[12px] leading-snug text-[var(--lf-dim)]">{body}</span>
    </button>
  );
}

/**
 * The explanation is a picture, not a paragraph: six boxes, and the ones your
 * money is on are filled. It animates once on hover/selection rather than
 * looping — a diagram that never stops moving is decoration.
 */
function FocusDiagram() {
  return (
    <span aria-hidden="true" className="flex gap-1">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-2.5 flex-1 rounded-[1px] ${i === 2 ? 'bg-white' : 'bg-[var(--lf-line)]'}`}
        />
      ))}
    </span>
  );
}

function SplitDiagram() {
  return (
    <span aria-hidden="true" className="flex gap-1">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-2.5 flex-1 rounded-[1px] ${
            i === 2 ? 'bg-white' : i === 4 ? 'bg-white/45' : 'bg-[var(--lf-line)]'
          }`}
        />
      ))}
    </span>
  );
}
