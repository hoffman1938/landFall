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

type TopBarPhase = 'open' | 'fog' | 'storm' | 'landfall' | 'next' | 'waiting';

const PHASE_META: Record<TopBarPhase, { label: string; color: string }> = {
  open: { label: 'OPEN TIDE', color: 'var(--lf-focus)' },
  fog: { label: 'BLIND FOG', color: '#aebccf' },
  storm: { label: 'STORM', color: 'var(--lf-danger)' },
  landfall: { label: 'LANDFALL', color: 'var(--lf-danger)' },
  next: { label: 'NEXT TIDE', color: 'var(--lf-dim)' },
  waiting: { label: 'CONNECTING', color: 'var(--lf-dim)' },
};

export function TopBar() {
  const connected = useStore((s) => s.connected);
  const name = useStore((s) => s.name);
  const balanceMinor = useStore((s) => s.balanceMinor);
  const phase = useStore((s) => s.phase);
  const round = useStore((s) => s.round);
  const tideReport = useStore((s) => s.tideReport);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const roomId = useStore((s) => s.roomId);
  const rooms = useStore((s) => s.rooms);
  const joinRoom = useStore((s) => s.joinRoom);
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

  const fogActive =
    phase?.phase === 'ANCHOR_OPEN' &&
    (tideReport?.frozen === true || (round?.fogStartsAt != null && now >= round.fogStartsAt));
  const phaseKey: TopBarPhase = !phase
    ? 'waiting'
    : phase.phase === 'ANCHOR_OPEN'
      ? fogActive
        ? 'fog'
        : 'open'
      : phase.phase === 'LOCKED_STORM'
        ? 'storm'
        : phase.phase === 'RESOLVED'
          ? 'landfall'
          : 'next';
  const phaseMeta = PHASE_META[phaseKey];
  const surge = round?.surgeRound && phase?.phase !== 'COOLDOWN';

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-1.5 overflow-visible border-b border-[var(--lf-line)] bg-[var(--lf-bg)] px-2 sm:gap-2 sm:px-3">
      <div className="flex shrink-0 items-center gap-1.5" aria-label="Landfall">
        <span className="text-[var(--lf-focus)]">
          <LighthouseIcon size={18} />
        </span>
        <span className="hidden text-xs font-extrabold tracking-[0.12em] min-[480px]:inline">
          LANDFALL
        </span>
      </div>

      {/* Room switcher (C1/C2): lobby with real human counts, never bots. */}
      {rooms.length > 0 && (
        <>
          <span className="h-4 w-px shrink-0 bg-[var(--lf-line)]" aria-hidden="true" />
          <label className="sr-only" htmlFor="lf-room-select">
            Room
          </label>
          <select
            id="lf-room-select"
            value={roomId ?? ''}
            onChange={(e) => {
              audio.click('nav');
              joinRoom(e.target.value);
            }}
            className="h-11 max-w-40 shrink-0 rounded-md border border-[var(--lf-line)] bg-[var(--lf-surface)] px-1.5 text-sm font-bold text-[var(--lf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
            title="Switch rooms — your live order is refunded first"
          >
            {rooms.map((r) => (
              <option key={r.roomId} value={r.roomId}>
                {r.name} · {(r.minStakeMinor / 100).toFixed(0)}–{(r.maxStakeMinor / 100).toFixed(0)} · {r.humanCount} aboard
              </option>
            ))}
          </select>
        </>
      )}

      <span className="h-4 w-px shrink-0 bg-[var(--lf-line)]" aria-hidden="true" />
      <span
        className="shrink-0 text-[11px] font-bold tabular-nums text-[var(--lf-text)]"
        aria-label={round ? `Round ${round.roundId}` : 'Round unavailable'}
      >
        {round ? `#${round.roundId}` : '—'}
      </span>
      <span
        className="lf-round-phase flex shrink-0 items-center gap-1 text-[10px] font-extrabold tracking-[0.05em]"
        style={{ color: phaseMeta.color }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        {phaseMeta.label}
      </span>

      {round?.weather && phase?.phase !== 'COOLDOWN' && (
        <span
          className="hidden shrink-0 border-l border-[var(--lf-line)] pl-2 text-[10px] font-bold text-[var(--lf-dim)] sm:inline"
          title={round.weather.description}
        >
          {round.weather.shortLabel.toUpperCase()}
        </span>
      )}

      {round && (
        <span
          className={`hidden shrink-0 items-center gap-1 border-l border-[var(--lf-line)] pl-2 text-[10px] font-extrabold md:flex ${
            surge ? 'text-[var(--lf-amber)]' : 'text-[var(--lf-dim)]'
          }`}
          title={
            surge
              ? 'Surge round — one surviving skipper takes the whole pot'
              : 'Storm Surge pot — grows every round'
          }
        >
          <SurgeIcon size={12} />
          <span>SURGE</span>
          <span className="tabular-nums">{fmt(round.surgePotMinor)}</span>
          {surge && <span className="text-[var(--lf-text)]">LIVE</span>}
        </span>
      )}

      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1.5">
        <span
          className={`flex shrink-0 items-center gap-1 text-[10px] font-semibold ${
            connected ? 'text-[var(--lf-dim)]' : 'text-[var(--lf-danger)]'
          }`}
          title={connected ? 'Connected' : 'Connection lost — reconnecting'}
          aria-label={connected ? 'Connected' : 'Connection lost, reconnecting'}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? 'bg-[var(--lf-focus)]' : 'bg-[var(--lf-danger)]'
            }`}
            aria-hidden="true"
          />
          <span className="hidden xl:inline">{connected ? 'ONLINE' : 'RECONNECTING'}</span>
        </span>

        <span className="hidden max-w-28 truncate text-[10px] text-[var(--lf-dim)] 2xl:inline">
          {name ?? ''}
        </span>

        <span
          className="flex shrink-0 items-baseline gap-1 border-l border-[var(--lf-line)] pl-2 text-xs font-extrabold tabular-nums text-[var(--lf-text)]"
          aria-label={`Balance ${fmt(balanceMinor)} credits`}
        >
          <span className="hidden text-[9px] font-semibold text-[var(--lf-dim)] xl:inline">
            BAL
          </span>
          {fmt(balanceMinor)}
          <span className="hidden text-[9px] font-semibold text-[var(--lf-dim)] min-[420px]:inline">
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
                    Expert deck
                    <span className="block text-xs font-medium leading-snug text-[var(--lf-dim)]">
                      Show all deck controls immediately
                    </span>
                  </span>
                </label>
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
