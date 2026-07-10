import { useEffect, useRef } from 'react';
import { useStore } from '../store';

const KIND_STYLE: Record<string, string> = {
  golden: 'font-bold text-[var(--lf-amber)]',
  surge: 'font-semibold text-[var(--lf-amber)]/90',
  salvage: 'text-emerald-300/90',
  info: 'text-[var(--lf-dim)]',
};

const KIND_ICON: Record<string, string> = {
  golden: '⚡⚓',
  surge: '⚡',
  salvage: '⚑',
  info: '·',
};

/** Wins & events feed — deliberately separate from Harbor Chat. */
export function SalvageLog() {
  const events = useStore((s) => s.events);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [events.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--lf-line)] px-3 py-2 text-sm font-semibold text-[var(--lf-dim)]">
        ⚑ Salvage Log <span className="font-normal">— wins &amp; events</span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-xs">
        {events.map((e, i) => (
          <div key={i} className={KIND_STYLE[e.kind]}>
            {KIND_ICON[e.kind]} {e.text}
          </div>
        ))}
        {events.length === 0 && (
          <div className="text-[var(--lf-dim)] italic">Waiting for the next wreck…</div>
        )}
      </div>
    </div>
  );
}
