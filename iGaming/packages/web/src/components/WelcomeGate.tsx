/**
 * Entry gate — the first thing a player sees, and the only screen between them
 * and their first bet.
 *
 * Two jobs, in this order:
 *   1. explain the game in four true sentences, well enough that someone who
 *      has never seen it wants to play;
 *   2. make them CHOOSE a table, so the first round is a decision they made
 *      rather than a room they were dropped into.
 *
 * Copy discipline: every word comes from `strings.ts`, and no new economy
 * figure appears here. A5 fixes the player-facing set at "survivors receive 88%
 * of the wrecked pool" and "long-run return ≈ 98%" — both live in the Rules
 * sheet, one tap away. The pitch here is "5 of the 6 survive", which is exact,
 * and it names the loss in the same breath rather than burying it.
 *
 * Returning players are not lectured twice: once the gate has been completed on
 * this device the explanation collapses behind a toggle and the screen becomes
 * what a regular actually wants — a table picker with their last table already
 * selected.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { RoomInfo } from '@landfall/core';
import { audio } from '../audio/engine';
import { fmt, useStore } from '../store';
import { ONE_LINER, STR, WELCOME_POINTS } from '../strings';
import {
  AnchorIcon,
  CrateIcon,
  LighthouseIcon,
  ShieldCheckIcon,
  StormIcon,
  SurgeIcon,
} from './icons';

const SEEN_KEY = 'landfall.welcomeSeen';

function hasSeenWelcome(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markWelcomeSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode — the gate simply stays expanded next time */
  }
}

/** The round in four pictures. Same visual language as the Rules sheet. */
function PitchStrip() {
  const frames: [React.ComponentType<{ size?: number }>, string, string][] = [
    [AnchorIcon, 'var(--lf-focus)', 'You pick a zone'],
    [StormIcon, 'var(--lf-danger)', 'The storm hits one'],
    [CrateIcon, 'var(--lf-amber)', 'Its pot pays the rest'],
    [SurgeIcon, 'var(--lf-amber)', 'Jackpot builds'],
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {frames.map(([Icon, color, label], i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--lf-brass-faint)] bg-[var(--lf-bg)] px-1 py-2.5 text-center"
        >
          <span style={{ color }} aria-hidden="true">
            <Icon size={24} />
          </span>
          <span className="text-[11px] font-bold leading-tight text-[var(--lf-text)]">{label}</span>
        </div>
      ))}
    </div>
  );
}

function TableCard({
  room,
  selected,
  onSelect,
}: {
  room: RoomInfo;
  selected: boolean;
  onSelect(): void;
}) {
  const liquidity = room.liquidity ?? 'quiet';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)] ${
        selected
          ? 'border-[var(--lf-focus)] bg-[var(--lf-focus)]/10 shadow-[0_0_18px_rgba(60,184,234,0.2)]'
          : 'border-[var(--lf-brass-faint)] bg-[var(--lf-surface-2)] hover:border-[var(--lf-brass-soft)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
          selected
            ? 'border-[var(--lf-focus)] bg-[var(--lf-focus)] text-[#03202f]'
            : 'border-[var(--lf-line)] text-transparent'
        }`}
      >
        ✓
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate text-sm font-extrabold text-[var(--lf-text)]">
            {room.name}
          </span>
          {/* Population honesty (C2): real humans, bots never counted. */}
          <span
            className={`shrink-0 rounded px-1.5 py-px text-[9px] font-black uppercase tracking-[0.08em] ${
              liquidity === 'busy'
                ? 'bg-[var(--lf-action)]/20 text-[var(--lf-safe)]'
                : liquidity === 'filling'
                  ? 'bg-[var(--lf-focus)]/15 text-[var(--lf-focus)]'
                  : 'bg-[var(--lf-line)]/60 text-[var(--lf-dim)]'
            }`}
          >
            {liquidity}
          </span>
        </span>
        <span className="mt-0.5 block text-xs font-semibold tabular-nums text-[var(--lf-dim)]">
          Bet {fmt(room.minStakeMinor)}–{fmt(room.maxStakeMinor)} · {room.humanCount}{' '}
          {room.humanCount === 1 ? 'player' : 'players'}
        </span>
      </span>
    </button>
  );
}

export function WelcomeGate() {
  const welcomeOpen = useStore((s) => s.welcomeOpen);
  const rooms = useStore((s) => s.rooms);
  const roomId = useStore((s) => s.roomId);
  const dismissWelcome = useStore((s) => s.dismissWelcome);
  const setRulesOpen = useStore((s) => s.setRulesOpen);

  const [picked, setPicked] = useState<string | null>(null);
  // Collapsed for returning players; the toggle is always available.
  const [showRules, setShowRules] = useState(() => !hasSeenWelcome());
  const playRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // The server has already seated the player in the busiest room they can
  // afford, so that is the honest default — but it stays a visible choice.
  const selected = picked ?? roomId ?? rooms[0]?.roomId ?? null;
  const selectedRoom = rooms.find((r) => r.roomId === selected) ?? null;

  const confirm = useCallback(() => {
    if (!selected) return;
    audio.click('send');
    markWelcomeSeen();
    dismissWelcome(selected);
  }, [selected, dismissWelcome]);

  useEffect(() => {
    if (!welcomeOpen) return;
    playRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape confirms the preselected table rather than doing nothing: a
      // modal with no keyboard exit is an accessibility trap, and a default is
      // still a choice. It never bypasses table selection — it takes the one
      // shown selected on screen.
      if (event.key === 'Escape') {
        event.preventDefault();
        confirm();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [welcomeOpen, confirm]);

  if (!welcomeOpen || rooms.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#02070a]/80 p-3 backdrop-blur-[3px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="lf-rise lf-glass lf-rim flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-y-auto rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="text-[var(--lf-brass)]" aria-hidden="true">
            <LighthouseIcon size={22} />
          </span>
          <span className="bg-gradient-to-b from-[#f6e3b6] to-[var(--lf-brass)] bg-clip-text text-lg font-black tracking-[0.16em] text-transparent">
            LANDFALL
          </span>
        </div>

        <h2 id={titleId} className="mt-2 text-lg font-extrabold leading-snug text-[var(--lf-text)]">
          {ONE_LINER}
        </h2>

        {showRules ? (
          <>
            <div className="mt-3">
              <PitchStrip />
            </div>

            <ol className="mt-3 space-y-2">
              {WELCOME_POINTS.map((point, i) => (
                <li key={point.title} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--lf-brass-soft)] text-[11px] font-black text-[var(--lf-brass)]"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold text-[var(--lf-text)]">
                      {point.title}
                    </span>
                    <span className="block text-[13px] leading-snug text-[var(--lf-dim)]">
                      {point.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              audio.click('nav');
              setShowRules(true);
            }}
            className="mt-3 flex min-h-11 items-center gap-2 self-start rounded-xl border border-dashed border-[var(--lf-brass-soft)] px-3 text-sm font-bold text-[var(--lf-brass)] hover:text-[var(--lf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
          >
            <ShieldCheckIcon size={15} />
            {STR.welcomeRulesToggle}
          </button>
        )}

        <div
          className="mt-4 mb-2 flex items-center gap-2"
          role="separator"
          aria-hidden="true"
        >
          <span className="h-px flex-1 bg-[var(--lf-brass-soft)]" />
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--lf-brass)]">
            {STR.welcomeChooseTable}
          </span>
          <span className="h-px flex-1 bg-[var(--lf-brass-soft)]" />
        </div>

        <div role="radiogroup" aria-label={STR.welcomeChooseTable} className="flex flex-col gap-1.5">
          {rooms.map((room) => (
            <TableCard
              key={room.roomId}
              room={room}
              selected={room.roomId === selected}
              onSelect={() => {
                audio.click('tap');
                setPicked(room.roomId);
              }}
            />
          ))}
        </div>

        <p className="mt-2 text-xs font-semibold text-[var(--lf-dim)]">{STR.welcomeTableHint}</p>

        <button
          ref={playRef}
          type="button"
          onClick={confirm}
          disabled={!selectedRoom}
          className="lf-breathe mt-3 flex min-h-14 w-full flex-col items-center justify-center rounded-xl bg-gradient-to-b from-[#2ad47c] to-[var(--lf-action-strong)] px-4 text-[#04240f] transition-[background-color,transform] duration-150 hover:from-[#33e087] hover:to-[var(--lf-action)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-lg font-black uppercase leading-tight tracking-[0.06em]">
            {STR.welcomePlayAt} {selectedRoom?.name ?? '—'}
          </span>
          {selectedRoom && (
            <span className="text-xs font-semibold leading-tight tabular-nums text-[#04240f]/70">
              Bet {fmt(selectedRoom.minStakeMinor)}–{fmt(selectedRoom.maxStakeMinor)} per round
            </span>
          )}
        </button>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-[var(--lf-dim)]">
            {STR.welcomeDisclaimer}
          </p>
          <button
            type="button"
            onClick={() => {
              audio.click('nav');
              setRulesOpen(true);
            }}
            className="min-h-11 rounded-lg px-1 text-xs font-bold text-[var(--lf-focus)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
          >
            Full rules & fairness →
          </button>
        </div>
      </div>
    </div>
  );
}
