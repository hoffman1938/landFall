import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { CrateIcon, SurgeIcon } from './icons';

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const KIND_STYLE: Record<string, string> = {
  golden: 'font-bold text-[var(--lf-amber)]',
  surge: 'font-semibold text-[var(--lf-amber)]/90',
  salvage: 'text-[var(--lf-amber)]',
  info: 'text-[var(--lf-dim)]',
};

interface SalvageLogProps {
  /** SecondaryPanel already supplies the visible tab label. */
  showHeader?: boolean;
  /** Uses compact rows without reducing interactive target sizes. */
  dense?: boolean;
}

function formatTime(at: number): string {
  return Number.isFinite(at) ? TIME_FORMATTER.format(new Date(at)) : '';
}

function formatDateTime(at: number): string {
  return Number.isFinite(at) ? DATE_TIME_FORMATTER.format(new Date(at)) : '';
}

/** Authoritative wins and system events, deliberately separate from player chat. */
export function SalvageLog({ showHeader = true, dense = false }: SalvageLogProps) {
  const events = useStore((state) => state.events);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [events.length]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-activity-log>
      {showHeader ? (
        <div className="flex min-h-11 shrink-0 items-center gap-1.5 border-b border-[var(--lf-line)] px-3 py-2 text-sm font-semibold text-[var(--lf-dim)]">
          <CrateIcon size={15} />
          Activity <span className="font-normal">— wins &amp; events</span>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        role="log"
        aria-label="Round activity, wins, and events"
        aria-live="polite"
        aria-relevant="additions text"
        className={`min-h-0 flex-1 overflow-y-auto px-3 ${dense ? 'py-1.5 text-xs' : 'py-2 text-sm'}`}
      >
        {events.length > 0 ? (
          events.map((event, index) => {
            const Icon =
              event.kind === 'golden' || event.kind === 'surge'
                ? SurgeIcon
                : event.kind === 'salvage'
                  ? CrateIcon
                  : null;
            const visibleTime = formatTime(event.at);
            const fullTime = formatDateTime(event.at);

            return (
              <div
                key={`${event.at}-${event.kind}-${index}`}
                className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 border-b border-[var(--lf-line)]/45 py-1.5 last:border-b-0"
              >
                <time
                  dateTime={new Date(event.at).toISOString()}
                  title={fullTime}
                  className="pt-0.5 text-[10px] tabular-nums text-[var(--lf-dim)]"
                >
                  {visibleTime}
                </time>
                <div className={`flex min-w-0 items-start gap-1.5 leading-relaxed ${KIND_STYLE[event.kind] ?? KIND_STYLE.info}`}>
                  {Icon ? (
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                      <Icon size={13} />
                    </span>
                  ) : (
                    <span className="shrink-0" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <span className="min-w-0 break-words">{event.text}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex h-full min-h-28 items-center justify-center px-4 text-center text-[var(--lf-dim)]">
            <p>
              <span className="block font-semibold text-[var(--lf-text)]">No activity yet</span>
              Salvage, Surge, and round events will appear here when the server publishes them.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
