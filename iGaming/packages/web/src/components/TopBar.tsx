/**
 * Top bar — one hairline row of account and table status.
 *
 * It carries only what must be true at a glance and cannot live anywhere else:
 * who you are playing as (the mark), which table, the jackpot, and your
 * balance. The round's own numbers belong to the board's centre readout, and
 * the settings menu holds everything that is a preference rather than a fact.
 *
 * Balance is the second-loudest number in the product and the only one here at
 * display weight. It sits alone on the right so a player can check it without
 * reading anything else — the single most common glance in a betting session.
 */
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { getDeckProgress, updateDeckProgress, useDeckProgress, withExpert } from '../deckProgress';
import { fmt, useStore } from '../store';
import { QuestionIcon, SlidersIcon, SoundOffIcon, SoundOnIcon, SurgeIcon } from './icons';

export function TopBar({ onSimple }: { onSimple?: () => void }) {
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
  const tableName = rooms.find((r) => r.roomId === roomId)?.name ?? null;

  const iconButton =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--lf-dim)] transition-colors hover:bg-[var(--lf-surface-2)] hover:text-[var(--lf-text)]';

  return (
    <header className="relative z-[var(--lf-z-chrome)] flex h-12 shrink-0 items-center gap-2 border-b border-[var(--lf-line)] bg-[var(--lf-bg-2)] px-2 sm:px-3">
      {onSimple && (
        <button
          type="button"
          onClick={onSimple}
          className="min-h-11 rounded-md border border-[var(--lf-line)] px-3 text-[13px] font-semibold"
        >
          Simple view
        </button>
      )}
      {/* The mark: one red square and the word. That is all the brand this
          interface gets — a dashboard is not a poster. */}
      <div className="flex shrink-0 items-center gap-2" aria-label="Landfall">
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center bg-[var(--lf-accent)] text-[11px] font-black leading-none text-black"
        >
          L
        </span>
        <span className="hidden text-[12px] font-extrabold tracking-[0.22em] text-[var(--lf-text)] min-[480px]:inline">
          LANDFALL
        </span>
      </div>

      {tableName && (
        <>
          <span className="h-4 w-px shrink-0 bg-[var(--lf-line)]" aria-hidden="true" />
          <span
            className="hidden max-w-40 shrink truncate text-[13px] font-semibold text-[var(--lf-dim)] md:inline"
            title="Your table — switch it in Settings"
          >
            {tableName}
          </span>
        </>
      )}

      {/*
       * The jackpot. It is legible every round in plain grey while it grows,
       * and only fills orange on the round it can actually pay out. A meter
       * that shouts every round teaches players to stop reading it.
       */}
      {round && (
        <span
          className={`flex shrink-0 items-center gap-2 rounded-md border px-2 py-1 leading-none ${
            surge
              ? 'border-[var(--lf-warn)] bg-[var(--lf-warn)] text-black'
              : 'border-[var(--lf-line)] bg-[var(--lf-surface)]'
          }`}
          title={
            surge
              ? `${tableName ?? 'This table'} jackpot — one safe player here wins the whole pot this round. A bigger bet is a better chance.`
              : `${tableName ?? 'This table'} jackpot. Every table has its own, built only from rounds played here, and it grows until a jackpot round pays it out.`
          }
          aria-label={`${tableName ?? 'Table'} jackpot ${fmt(round.surgePotMinor)} credits${surge ? ', live this round' : ''}`}
        >
          <span className={surge ? 'lf-pulse' : 'text-[var(--lf-mute)]'} aria-hidden="true">
            <SurgeIcon size={13} />
          </span>
          <span className="flex flex-col gap-1">
            <span
              className={`lf-label hidden max-w-24 truncate sm:block ${surge ? '!text-black/60' : ''}`}
            >
              {tableName ? `${tableName} pot` : 'Jackpot'}
            </span>
            <span
              className={`lf-num text-[15px] leading-none ${
                surge ? 'text-black' : 'text-[var(--lf-text)]'
              }`}
            >
              {fmt(round.surgePotMinor)}
            </span>
          </span>
          {surge && (
            <span className="rounded-sm bg-black/20 px-1 py-0.5 text-[9px] font-black uppercase leading-none tracking-[0.1em] text-black">
              Live
            </span>
          )}
        </span>
      )}

      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1.5">
        {/* Connection is silent until it is lost. */}
        {!connected && (
          <span
            className="flex shrink-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--lf-accent)]"
            title="Connection lost — reconnecting"
            aria-label="Connection lost, reconnecting"
          >
            <span className="lf-pulse h-1.5 w-1.5 bg-[var(--lf-accent)]" aria-hidden="true" />
            <span className="hidden xl:inline">Reconnecting</span>
          </span>
        )}

        {/* `key` restarts the edge flash on every change: the balance moved,
            and the player is told so without the number itself jumping. */}
        <span
          key={balanceMinor}
          className="lf-edge flex shrink-0 items-baseline gap-1.5 rounded-md border border-[var(--lf-line)] bg-[var(--lf-surface)] px-2.5 py-1"
          aria-label={`Balance ${fmt(balanceMinor)} credits`}
        >
          <span className="lf-label-soft hidden xl:inline">Bal</span>
          <span className="lf-metric text-[var(--lf-text)]">{fmt(balanceMinor)}</span>
          <span className="hidden text-[10px] font-bold text-[var(--lf-mute)] min-[420px]:inline">
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
            className={iconButton}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <SoundOffIcon size={16} /> : <SoundOnIcon size={16} />}
          </button>
          <div className="lf-overlay absolute right-0 top-full z-[2] mt-1 hidden rounded-md p-2 group-hover:block group-focus-within:block">
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
              className="w-28"
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
            className={iconButton}
            aria-label="Settings"
            aria-haspopup="true"
            aria-expanded={settingsOpen}
          >
            <SlidersIcon size={16} />
          </button>
          {settingsOpen && (
            <>
              <div
                className="fixed inset-0 z-[1]"
                aria-hidden="true"
                onMouseDown={() => setSettingsOpen(false)}
              />
              {/* Scrolls: the table list grows with the tier ladder, and the
                  rows under it must stay reachable on a short phone screen. */}
              <div className="lf-overlay absolute right-0 top-full z-[2] mt-1 max-h-[calc(100dvh-4.5rem)] w-64 overflow-y-auto rounded-md p-1.5">
                {rooms.length > 0 && (
                  <div className="px-1.5 py-1.5">
                    <div className="flex items-baseline justify-between px-0.5">
                      <span className="lf-label">Table</span>
                      {name && (
                        <span className="max-w-32 truncate text-[11px] font-semibold text-[var(--lf-mute)]">
                          as {name}
                        </span>
                      )}
                    </div>
                    <div role="radiogroup" aria-label="Table" className="mt-2 flex flex-col gap-1">
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
                            className={`flex items-center gap-2.5 rounded-r-md border-l-2 px-2.5 py-2 text-left transition-colors ${
                              active
                                ? 'border-white bg-[var(--lf-white-soft)]'
                                : 'border-[var(--lf-line)] bg-[var(--lf-surface-2)] hover:border-[var(--lf-line-2)]'
                            }`}
                          >
                            <span
                              className="lf-radio"
                              data-checked={active ? 'true' : 'false'}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="min-w-0 truncate text-[13px] font-bold text-[var(--lf-text)]">
                                  {r.name}
                                </span>
                                {/* Population honesty (C2): real humans only. */}
                                <span
                                  className={`shrink-0 rounded-sm px-1 py-px text-[9px] font-black uppercase tracking-[0.08em] ${
                                    r.liquidity === 'busy'
                                      ? 'bg-[var(--lf-win-soft)] text-[var(--lf-win)]'
                                      : r.liquidity === 'filling'
                                        ? 'bg-[var(--lf-white-soft)] text-[var(--lf-dim)]'
                                        : 'bg-[var(--lf-surface)] text-[var(--lf-mute)]'
                                  }`}
                                >
                                  {r.liquidity ?? 'quiet'}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-[11px] font-semibold tabular-nums text-[var(--lf-mute)]">
                                Bet {(r.minStakeMinor / 100).toFixed(0)}–
                                {(r.maxStakeMinor / 100).toFixed(0)} · {r.humanCount}{' '}
                                {r.humanCount === 1 ? 'player' : 'players'}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="my-1 h-px bg-[var(--lf-line)]" aria-hidden="true" />
                <label className="relative flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1 text-[13px] font-semibold text-[var(--lf-text)] transition-colors hover:bg-[var(--lf-surface-2)]">
                  <input
                    type="checkbox"
                    checked={deckProgress.expert}
                    onChange={(event) => {
                      audio.click('tap');
                      updateDeckProgress(withExpert(getDeckProgress(), event.target.checked));
                    }}
                    className="lf-switch-input"
                  />
                  <span className="lf-switch" aria-hidden="true" />
                  <span>
                    Expert mode
                    <span className="block text-[11px] font-medium leading-snug text-[var(--lf-mute)]">
                      Show all controls immediately
                    </span>
                  </span>
                </label>
                <label className="relative flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1 text-[13px] font-semibold text-[var(--lf-text)] transition-colors hover:bg-[var(--lf-surface-2)]">
                  <input
                    type="checkbox"
                    checked={quickBet}
                    onChange={(event) => {
                      audio.click('tap');
                      setQuickBet(event.target.checked);
                    }}
                    className="lf-switch-input"
                  />
                  <span className="lf-switch" aria-hidden="true" />
                  <span>
                    Quick bet
                    <span className="block text-[11px] font-medium leading-snug text-[var(--lf-mute)]">
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
                  className="flex min-h-11 w-full items-center px-2 py-1 text-left text-[13px] font-semibold text-[var(--lf-text)] hover:bg-[var(--lf-surface-2)]"
                >
                  <span>
                    Play limits &amp; session
                    <span className="block text-[11px] font-medium leading-snug text-[var(--lf-mute)]">
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
                  className="flex min-h-11 w-full items-center px-2 py-1 text-left text-[13px] font-semibold text-[var(--lf-text)] hover:bg-[var(--lf-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>
                    Player stats
                    <span className="block text-[11px] font-medium leading-snug text-[var(--lf-mute)]">
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
          className={iconButton}
          aria-label="How to play"
        >
          <QuestionIcon size={16} />
        </button>
      </div>
    </header>
  );
}
