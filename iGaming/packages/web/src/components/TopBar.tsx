/**
 * Night Watch top bar: quiet identity and authoritative round/account status.
 * The large countdown remains in StormClock; this bar keeps the phase visible
 * when other map overlays are obscured. Settings holds the expert-deck toggle
 * (D5) — experts skip the progressive disclosure schedule entirely.
 */
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import {
  getDeckProgress,
  updateDeckProgress,
  useDeckProgress,
  withExpert,
} from '../deckProgress';
import { fmt, useStore } from '../store';
import {
  LighthouseIcon,
  QuestionIcon,
  SlidersIcon,
  SoundOffIcon,
  SoundOnIcon,
  SurgeIcon,
} from './icons';

export function TopBar() {
  const connected = useStore((s) => s.connected);
  const name = useStore((s) => s.name);
  const balanceMinor = useStore((s) => s.balanceMinor);
  const phase = useStore((s) => s.phase);
  const round = useStore((s) => s.round);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const roomId = useStore((s) => s.roomId);
  const rooms = useStore((s) => s.rooms);
  const joinRoom = useStore((s) => s.joinRoom);
  const setLimitsOpen = useStore((s) => s.setLimitsOpen);
  const openSkipper = useStore((s) => s.openSkipper);
  const quickBet = useStore((s) => s.quickBet);
  const setQuickBet = useStore((s) => s.setQuickBet);
  const [muted, setMuted] = useState(audio.prefs.muted);
  const [volume, setVolume] = useState(audio.prefs.volume);
  const [now, setNow] = useState(Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const deckProgress = useDeckProgress();
  const lastTickSecond = useRef(-1);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = phase ? Math.max(0, (phase.endsAt - now) / 1000) : 0;

  useEffect(() => {
    if (phase?.phase !== 'ANCHOR_OPEN') return;
    const second = Math.ceil(remaining);
    if (second <= 3 && second >= 1 && second !== lastTickSecond.current) {
      lastTickSecond.current = second;
      audio.tick();
    }
  }, [phase?.phase, remaining]);

  const surge = round?.surgeRound && phase?.phase !== 'COOLDOWN';

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-1.5 overflow-visible border-b border-[var(--lf-brass-soft)] bg-gradient-to-b from-[#0d1a1e] to-[var(--lf-bg)] px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:gap-2 sm:px-3">
      <div className="flex shrink-0 items-center gap-1.5" aria-label="Landfall">
        <span className="text-[var(--lf-brass)]">
          <LighthouseIcon size={18} />
        </span>
        <span className="hidden bg-gradient-to-b from-[#f6e3b6] to-[var(--lf-brass)] bg-clip-text text-xs font-extrabold tracking-[0.16em] text-transparent min-[480px]:inline">
          LANDFALL
        </span>
      </div>

      {/* v3 P0-7: round #, phase, and weather live in the Storm Clock; the room
          switcher moved into Settings. The jackpot pot stays visible EVERY round
          (calm/dim while it grows), and lights up amber "LIVE" on a bonus round —
          amber is otherwise reserved for payout moments. */}
      {round && (
        <>
          <span className="h-5 w-px shrink-0 bg-[var(--lf-brass-soft)]" aria-hidden="true" />
          {/* The jackpot meter — the loudest number a casino floor owns, so it
              is legible every round (brass frame while it grows) and turns to
              a solid gold fill only on a bonus round, when it is actually
              about to pay out. Amber stays payout-only. */}
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 leading-none ${
              surge
                ? 'lf-gold border-[var(--lf-amber)]'
                : 'border-[var(--lf-brass-soft)] bg-[#12100a]'
            }`}
            title={
              surge
                ? 'Bonus round — one safe player wins the whole jackpot'
                : 'Jackpot — grows every round until a bonus round pays it out'
            }
            aria-label={`Jackpot ${fmt(round.surgePotMinor)} credits${surge ? ', live this round' : ''}`}
          >
            <span className={surge ? 'lf-pulse' : 'text-[var(--lf-brass)]'} aria-hidden="true">
              <SurgeIcon size={14} />
            </span>
            <span className="flex flex-col gap-[3px]">
              <span
                className={`hidden text-[8px] font-extrabold uppercase leading-none tracking-[0.14em] sm:block ${
                  surge ? 'text-black/60' : 'text-[var(--lf-brass)]'
                }`}
              >
                Jackpot
              </span>
              <span
                className={`text-[13px] font-extrabold leading-none tabular-nums ${
                  surge ? 'text-black' : 'text-[var(--lf-text)]'
                }`}
              >
                {fmt(round.surgePotMinor)}
              </span>
            </span>
            {surge && (
              <span className="rounded bg-black/25 px-1 py-0.5 text-[9px] font-black uppercase leading-none tracking-[0.1em] text-black">
                Live
              </span>
            )}
          </span>
        </>
      )}

      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1.5">
        {/* v3 P0-7: connection is shown only when it is lost (otherwise silent);
            display name moved into Settings. */}
        {!connected && (
          <span
            className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[var(--lf-danger)]"
            title="Connection lost — reconnecting"
            aria-label="Connection lost, reconnecting"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--lf-danger)]" aria-hidden="true" />
            <span className="hidden xl:inline">RECONNECTING</span>
          </span>
        )}

        {/* The player's own bankroll: the second-loudest number on the floor. */}
        <span
          className="flex shrink-0 items-baseline gap-1 rounded-lg border border-[var(--lf-brass-soft)] bg-[#0c1418] px-2.5 py-1 text-sm font-extrabold leading-none tabular-nums text-[var(--lf-text)]"
          aria-label={`Balance ${fmt(balanceMinor)} credits`}
        >
          <span className="hidden text-[8px] font-extrabold uppercase tracking-[0.14em] text-[var(--lf-brass)] xl:inline">
            Bal
          </span>
          {fmt(balanceMinor)}
          <span className="hidden text-[9px] font-bold text-[var(--lf-dim)] min-[420px]:inline">
            CR
          </span>
        </span>

        <div className="group relative flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => {
              const nextMuted = !muted;
              setMuted(nextMuted);
              audio.setPrefs({ muted: nextMuted });
            }}
            className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--lf-dim)] hover:bg-[var(--lf-surface-2)] hover:text-[var(--lf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <SoundOffIcon size={16} /> : <SoundOnIcon size={16} />}
          </button>
          <div className="absolute right-0 top-full z-30 mt-1 hidden rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] p-2 shadow-xl group-hover:block group-focus-within:block">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => {
                const nextVolume = Number(event.target.value);
                setVolume(nextVolume);
                audio.setPrefs({ volume: nextVolume, muted: false });
                setMuted(false);
              }}
              className="w-24 accent-[var(--lf-focus)]"
              aria-label="Volume"
            />
          </div>
        </div>

        <div className="relative flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => {
              audio.click('nav');
              setSettingsOpen((v) => !v);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--lf-dim)] hover:bg-[var(--lf-surface-2)] hover:text-[var(--lf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
            aria-label="Settings"
            aria-haspopup="true"
            aria-expanded={settingsOpen}
          >
            <SlidersIcon size={16} />
          </button>
          {settingsOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                aria-hidden="true"
                onMouseDown={() => setSettingsOpen(false)}
              />
              <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] p-1.5 shadow-xl">
                {/* v3 P0-7: Table switcher moved out of the top bar into Settings,
                    styled as selectable cards (no raw native <select>). */}
                {rooms.length > 0 && (
                  <div className="px-2 py-1.5">
                    <div className="flex items-baseline justify-between px-0.5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--lf-dim)]">
                        Table
                      </span>
                      {name && (
                        <span className="max-w-32 truncate text-[11px] font-semibold text-[var(--lf-dim)]">
                          as {name}
                        </span>
                      )}
                    </div>
                    <div
                      role="radiogroup"
                      aria-label="Table"
                      className="mt-1.5 flex flex-col gap-1"
                    >
                      {rooms.map((r) => {
                        const active = r.roomId === roomId;
                        return (
                          <button
                            key={r.roomId}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => {
                              if (active) return;
                              audio.click('nav');
                              joinRoom(r.roomId);
                            }}
                            title={
                              active
                                ? 'You are at this table'
                                : 'Switch tables — your live bet is refunded first'
                            }
                            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)] ${
                              active
                                ? 'border-[var(--lf-focus)] bg-[var(--lf-focus)]/10'
                                : 'border-[var(--lf-line)] bg-[var(--lf-surface-2)] hover:border-[var(--lf-focus)]/50 hover:bg-[var(--lf-surface-2)]/70'
                            }`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-[var(--lf-text)]">
                                {r.name}
                              </span>
                              <span className="mt-0.5 block text-[11px] font-semibold tabular-nums text-[var(--lf-dim)]">
                                Bet {(r.minStakeMinor / 100).toFixed(0)}–
                                {(r.maxStakeMinor / 100).toFixed(0)} · {r.humanCount}{' '}
                                {r.humanCount === 1 ? 'player' : 'players'}
                              </span>
                            </span>
                            <span
                              aria-hidden="true"
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${
                                active
                                  ? 'border-[var(--lf-focus)] bg-[var(--lf-focus)] text-[#03202f]'
                                  : 'border-[var(--lf-line)] text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="my-1 h-px bg-[var(--lf-line)]" aria-hidden="true" />
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 text-sm font-semibold text-[var(--lf-text)] hover:bg-[var(--lf-surface-2)]">
                  <input
                    type="checkbox"
                    checked={deckProgress.expert}
                    onChange={(event) => {
                      audio.click('tap');
                      updateDeckProgress(withExpert(getDeckProgress(), event.target.checked));
                    }}
                    className="h-4 w-4 shrink-0 accent-[var(--lf-focus)]"
                  />
                  <span>
                    Expert mode
                    <span className="block text-xs font-medium leading-snug text-[var(--lf-dim)]">
                      Show all controls immediately
                    </span>
                  </span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 text-sm font-semibold text-[var(--lf-text)] hover:bg-[var(--lf-surface-2)]">
                  <input
                    type="checkbox"
                    checked={quickBet}
                    onChange={(event) => {
                      audio.click('tap');
                      setQuickBet(event.target.checked);
                    }}
                    className="h-4 w-4 shrink-0 accent-[var(--lf-focus)]"
                  />
                  <span>
                    Quick bet
                    <span className="block text-xs font-medium leading-snug text-[var(--lf-dim)]">
                      Tap a zone to bet instantly (skip Place Bet)
                    </span>
                  </span>
                </label>
                {/* F1/F2: server-enforced limits, session clock, self-exclusion. */}
                <button
                  type="button"
                  onClick={() => {
                    audio.click('nav');
                    setSettingsOpen(false);
                    setLimitsOpen(true);
                  }}
                  className="flex min-h-11 w-full items-center rounded-md px-2 py-1 text-left text-sm font-semibold text-[var(--lf-text)] hover:bg-[var(--lf-surface-2)]"
                >
                  <span>
                    Play limits & session
                    <span className="block text-xs font-medium leading-snug text-[var(--lf-dim)]">
                      Loss limits, reality checks, take a break
                    </span>
                  </span>
                </button>
                {/* E1: your own cosmetic skipper record. */}
                <button
                  type="button"
                  disabled={!name}
                  onClick={() => {
                    audio.click('nav');
                    setSettingsOpen(false);
                    if (name) openSkipper(name);
                  }}
                  className="flex min-h-11 w-full items-center rounded-md px-2 py-1 text-left text-sm font-semibold text-[var(--lf-text)] hover:bg-[var(--lf-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>
                    Player stats
                    <span className="block text-xs font-medium leading-snug text-[var(--lf-dim)]">
                      Streaks and wins — for fun, no bearing on odds
                    </span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            audio.click('nav');
            setRulesOpen(true);
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--lf-dim)] hover:bg-[var(--lf-surface-2)] hover:text-[var(--lf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
          aria-label="How to play"
        >
          <QuestionIcon size={16} />
        </button>
      </div>
    </header>
  );
}
