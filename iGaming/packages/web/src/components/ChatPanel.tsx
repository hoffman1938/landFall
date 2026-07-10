import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { useStore } from '../store';

/** Player conversation only — wins/events live in SalvageLog. */
export function ChatPanel() {
  const chat = useStore((s) => s.chat);
  const myName = useStore((s) => s.name);
  const sendChat = useStore((s) => s.sendChat);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.length]);

  const submit = () => {
    if (draft.trim()) audio.click('send');
    sendChat(draft);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--lf-line)] px-3 py-2 text-sm font-semibold text-[var(--lf-dim)]">
        💬 Harbor Chat
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
        {chat.map((m, i) => (
          <div key={i}>
            <span
              className={
                m.name === myName
                  ? 'font-semibold text-[var(--lf-amber)]'
                  : 'font-semibold text-[var(--lf-dim)]'
              }
            >
              {m.name}:{' '}
            </span>
            <span>{m.text}</span>
          </div>
        ))}
        {chat.length === 0 && (
          <div className="text-[var(--lf-dim)] italic">Quiet harbor tonight…</div>
        )}
      </div>
      <div className="flex gap-2 border-t border-[var(--lf-line)] p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          maxLength={200}
          placeholder="Type a message…"
          className="min-w-0 flex-1 rounded-md border border-[var(--lf-line)] bg-[var(--lf-bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--lf-dim)]"
        />
        <button
          onClick={submit}
          className="rounded-md bg-[var(--lf-panel)] px-3 text-sm hover:bg-[var(--lf-line)]"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
