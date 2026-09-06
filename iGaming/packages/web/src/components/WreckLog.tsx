/**
 * Result tape — the last struck zones as a row of flat cells, newest at the
 * right, opening the full replay history on tap.
 *
 * It is a tape, not a pattern: only the newest cell is red (that is the round
 * that just happened), and everything behind it decays to grey. The strip is
 * deliberately unreadable as a trend — the telemetry rail carries the actual
 * counts, next to the flat statement that every zone stays 1 in 6.
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
      className="lf-glass pointer-events-auto absolute left-2 top-2 z-10 flex h-9 max-w-[calc(100%-4.5rem)] items-center gap-2 rounded-md pr-2"
      aria-label="Recent results"
    >
      <button
        type="button"
        onClick={() => {
          audio.click('nav');
          setWreckLogOpen(true);
        }}
        className="lf-label flex h-9 shrink-0 items-center border-r border-[var(--lf-line)] px-2.5 transition-colors hover:!text-[var(--lf-text)]"
        aria-label="Open round history"
        title="Open round history — recent results and replays"
      >
        {STR.history}
      </button>

      {visibleResults.length === 0 ? (
        <span className="truncate text-[11px] font-semibold text-[var(--lf-mute)]">
          No results yet
        </span>
      ) : (
        <ol className="flex min-w-0 flex-1 items-center gap-[3px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleResults.map((zone, index) => {
            const latest = index === visibleResults.length - 1;
            const label = `${latest ? 'Latest result. ' : ''}${zoneName(zone)} was hit.`;
            const age = visibleResults.length - 1 - index;

            return (
              <li key={index} className="shrink-0">
                <span
                  className={`flex h-[22px] w-[22px] items-center justify-center text-[11px] font-black tabular-nums ${
                    latest
                      ? 'bg-[var(--lf-accent)] text-black'
                      : 'bg-[var(--lf-surface-2)] text-[var(--lf-dim)]'
                  }`}
                  style={latest ? undefined : { opacity: Math.max(0.35, 1 - age * 0.06) }}
                  title={label}
                  aria-label={label}
                  aria-current={latest ? 'true' : undefined}
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
