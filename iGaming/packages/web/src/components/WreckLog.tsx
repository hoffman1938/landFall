/**
 * Compact strip of recent struck-cove results — small chips, latest
 * highlighted. The strip itself opens the Wreck Log sheet (E2): the same
 * history retold as replay cards with fog arrows, salvage and flag reveals.
 */
import { audio } from '../audio/engine';
import { useStore } from '../store';
import { STR, zoneName } from '../strings';

const MAX_VISIBLE_RESULTS = 14;

export function WreckLog() {
  const wreckLog = useStore((s) => s.wreckLog);
  const setWreckLogOpen = useStore((s) => s.setWreckLogOpen);
  const visibleResults = wreckLog.slice(-MAX_VISIBLE_RESULTS);

  return (
    <section
      className="lf-glass lf-rim pointer-events-auto absolute left-2 top-2 z-10 flex h-9 max-w-[calc(100%-4.5rem)] items-center gap-2 rounded-xl px-2.5"
      aria-label="Recent results"
    >
      <button
        type="button"
        onClick={() => {
          audio.click('nav');
          setWreckLogOpen(true);
        }}
        className="-mx-2.5 flex h-11 shrink-0 items-center self-center rounded-xl px-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--lf-brass)] hover:text-[var(--lf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
        aria-label="Open round history"
        title="Open round history — recent results and replays"
      >
        {STR.history}
      </button>

      <span className="h-4 w-px shrink-0 bg-[var(--lf-brass-soft)]" aria-hidden="true" />

      {visibleResults.length === 0 ? (
        <span className="truncate text-xs font-semibold text-[var(--lf-dim)]">
          No results yet
        </span>
      ) : (
        <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleResults.map((zone, index) => {
            const latest = index === visibleResults.length - 1;
            const label = `${latest ? 'Latest result. ' : ''}${zoneName(zone)} was hit.`;
            // Recency as opacity: the strip reads as a decaying trail rather
            // than a wall of equal chips. (History is history — it never
            // implies a pattern; strike odds stay 1/6, see the Rules sheet.)
            const age = visibleResults.length - 1 - index;

            return (
              <li key={index} className="shrink-0">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)] ${
                    latest
                      ? 'bg-[var(--lf-danger)] text-white shadow-[0_0_14px_rgba(240,54,74,0.55)] ring-1 ring-[#ff8b96]'
                      : 'bg-[var(--lf-surface-2)] text-[var(--lf-dim)] ring-1 ring-[var(--lf-line)]'
                  }`}
                  style={latest ? undefined : { opacity: Math.max(0.42, 1 - age * 0.055) }}
                  title={label}
                  aria-label={label}
                  aria-current={latest ? 'true' : undefined}
                  tabIndex={0}
                >
                  {zone + 1}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
