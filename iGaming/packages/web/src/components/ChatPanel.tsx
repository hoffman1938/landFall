import { CHAT_MAX_LEN } from '@landfall/core';
import { useEffect, useId, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { useStore } from '../store';

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

interface ChatPanelProps {
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

/** Player conversation only; system and win events live in SalvageLog. */
export function ChatPanel({ showHeader = true, dense = false }: ChatPanelProps) {
  const chat = useStore((state) => state.chat);
  const myName = useStore((state) => state.name);
  const connected = useStore((state) => state.connected);
  const sendChat = useStore((state) => state.sendChat);
  const openSkipper = useStore((state) => state.openSkipper);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.length]);

  const trimmedDraft = draft.trim();
  const canSend = connected && trimmedDraft.length > 0;

  const submit = () => {
    if (!canSend) return;
    audio.click('send');
    sendChat(trimmedDraft);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-chat-panel>
      {showHeader ? (
        <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-[var(--lf-line)] px-3 py-2 text-sm font-semibold text-[var(--lf-dim)]">
          <span>Harbor Chat</span>
          <span
            className={`ml-auto h-2 w-2 rounded-full ${connected ? 'bg-[var(--lf-safe)]' : 'bg-[var(--lf-danger)]'}`}
            aria-hidden="true"
          />
          <span className="sr-only">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      ) : null}

      {!connected ? (
        <div
          className="shrink-0 border-b border-[var(--lf-line)] bg-[var(--lf-danger)]/10 px-3 py-2 text-xs font-semibold text-[var(--lf-text)]"
          role="status"
        >
          Reconnecting. Messages remain readable; sending is paused.
        </div>
      ) : null}

      <div
        ref={scrollRef}
        role="log"
        aria-label="Harbor chat messages"
        aria-live="polite"
        aria-relevant="additions text"
        className={`min-h-0 flex-1 overflow-y-auto px-3 ${dense ? 'py-1.5 text-xs' : 'py-2 text-sm'}`}
      >
        {chat.length > 0 ? (
          chat.map((message, index) => {
            const mine = myName !== null && message.name === myName;
            const visibleTime = formatTime(message.at);
            const fullTime = formatDateTime(message.at);

            return (
              <div
                key={`${message.at}-${message.name}-${index}`}
                className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 border-b border-[var(--lf-line)]/45 py-1.5 last:border-b-0"
              >
                <time
                  dateTime={new Date(message.at).toISOString()}
                  title={fullTime}
                  className="pt-0.5 text-[10px] tabular-nums text-[var(--lf-dim)]"
                >
                  {visibleTime}
                </time>
                <p className="min-w-0 break-words leading-relaxed">
                  {/* E1: a name opens that skipper's cosmetic record card. */}
                  <button
                    type="button"
                    onClick={() => {
                      audio.click('nav');
                      openSkipper(message.name);
                    }}
                    title={`View ${message.name}'s skipper record`}
                    className={`inline min-h-0 cursor-pointer rounded-sm p-0 text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)] ${
                      mine
                        ? 'font-bold text-[var(--lf-focus)]'
                        : 'font-semibold text-[var(--lf-dim)]'
                    }`}
                  >
                    {message.name}
                    {mine ? <span className="sr-only"> (you)</span> : null}:
                  </button>{' '}
                  <span className="text-[var(--lf-text)]">{message.text}</span>
                </p>
              </div>
            );
          })
        ) : (
          <div className="flex h-full min-h-28 items-center justify-center px-4 text-center text-[var(--lf-dim)]">
            <p>
              <span className="block font-semibold text-[var(--lf-text)]">No messages yet</span>
              Harbor Chat will appear here as players join the conversation.
            </p>
          </div>
        )}
      </div>

      <form
        className="flex shrink-0 gap-2 border-t border-[var(--lf-line)] bg-[var(--lf-glass)] p-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Message to Harbor Chat
        </label>
        <input
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={CHAT_MAX_LEN}
          autoComplete="off"
          disabled={!connected}
          placeholder={connected ? 'Type a message…' : 'Reconnecting…'}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--lf-line)] bg-[var(--lf-bg)] px-3 py-2 text-base outline-none placeholder:text-[var(--lf-dim)] focus:border-[var(--lf-focus)] disabled:cursor-not-allowed disabled:opacity-65"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="min-h-11 min-w-14 rounded-xl bg-[var(--lf-focus)] px-3 text-sm font-extrabold text-black hover:brightness-110 disabled:cursor-not-allowed disabled:bg-[var(--lf-panel)] disabled:text-[var(--lf-dim)] disabled:opacity-70"
          aria-label="Send chat message"
        >
          Send
        </button>
      </form>
    </div>
  );
}
