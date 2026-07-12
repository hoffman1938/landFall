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
      className="lf-surface pointer-events-auto absolute left-2 top-2 z-10 flex h-7 max-w-[calc(100%-4.5rem)] items-center gap-1.5 rounded-lg px-2"
      aria-label="Recent results"
    >
      <button
        type="button"
        onClick={() => {
          audio.click('nav');
          setWreckLogOpen(true);
        }}
        className="-mx-2 flex h-11 shrink-0 items-center self-center rounded-lg px-2 text-[9px] font-extrabold tracking-[0.05em] text-[var(--lf-dim)] hover:text-[var(--lf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
        aria-label="Open round history"
        title="Open round history — recent results and replays"
      >
        {STR.history}
      </button>

      {visibleResults.length === 0 ? (
        <span className="truncate text-[10px] font-medium text-[var(--lf-dim)]">
          No results yet
        </span>
      ) : (
        <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleResults.map((zone, index) => {
            const latest = index === visibleResults.length - 1;
            const label = `${latest ? 'Latest result. ' : ''}${zoneName(zone)} was hit.`;

            return (
              <li key={index} className="shrink-0">
                <span
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-extrabold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)] ${
                    latest
                      ? 'bg-[var(--lf-danger)]/20 text-[var(--lf-danger)] ring-1 ring-[var(--lf-danger)]/60'
                      : 'bg-[var(--lf-surface-2)] text-[var(--lf-dim)]'
                  }`}
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
