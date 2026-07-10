/** Compact strip of recent struck-cove results — small chips, latest highlighted. */
import { HARBOR_NAMES } from '@landfall/core';
import { useStore } from '../store';

const MAX_VISIBLE_RESULTS = 14;

export function WreckLog() {
  const wreckLog = useStore((s) => s.wreckLog);
  const visibleResults = wreckLog.slice(-MAX_VISIBLE_RESULTS);

  return (
    <section
      className="lf-surface pointer-events-auto absolute left-2 top-2 z-10 flex h-7 max-w-[calc(100%-4.5rem)] items-center gap-1.5 rounded-lg px-2"
      aria-label="Recent wreck history"
    >
      <span
        className="shrink-0 text-[9px] font-extrabold tracking-[0.05em] text-[var(--lf-dim)]"
        aria-hidden="true"
      >
        WRECKS
      </span>

      {visibleResults.length === 0 ? (
        <span className="truncate text-[10px] font-medium text-[var(--lf-dim)]">
          No results yet
        </span>
      ) : (
        <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleResults.map((zone, index) => {
            const latest = index === visibleResults.length - 1;
            const harborName = HARBOR_NAMES[zone] ?? `Cove ${zone + 1}`;
            const label = `${latest ? 'Latest result. ' : ''}Cove ${zone + 1}, ${harborName}, was struck.`;

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
