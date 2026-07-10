import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { fmt, useStore } from '../store';

const PHASE_LABEL: Record<string, string> = {
  ANCHOR_OPEN: 'anchors lock in',
  LOCKED_STORM: 'storm approaching',
  RESOLVED: 'landfall',
  COOLDOWN: 'next round in',
};

export function TopBar() {
  const { connected, name, balanceMinor, phase, round, setRulesOpen } = useStore();
  const [now, setNow] = useState(Date.now());
  const [muted, setMuted] = useState(audio.prefs.muted);
  const [volume, setVolume] = useState(audio.prefs.volume);
  const lastTickSecond = useRef(-1);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  const remaining = phase ? Math.max(0, (phase.endsAt - now) / 1000) : 0;
  const fogActive =
    phase?.phase === 'ANCHOR_OPEN' && round?.fogStartsAt != null && now >= round.fogStartsAt;
  const fogIn =
    phase?.phase === 'ANCHOR_OPEN' && round?.fogStartsAt != null
      ? Math.max(0, (round.fogStartsAt - now) / 1000)
      : 0;
  const showTimer = phase?.phase === 'ANCHOR_OPEN' || phase?.phase === 'COOLDOWN';
  const surge = round?.surgeRound && phase?.phase !== 'COOLDOWN';

  // Soft countdown ticks in the final 3 seconds of the anchor window.
  useEffect(() => {
    if (phase?.phase !== 'ANCHOR_OPEN') return;
    const sec = Math.ceil(remaining);
    if (sec <= 3 && sec >= 1 && sec !== lastTickSecond.current) {
      lastTickSecond.current = sec;
      audio.tick();
    }
  }, [phase?.phase, remaining]);

  return (
    <header
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 ${
        surge ? 'border-[var(--lf-amber)] bg-[#1c1508]' : 'border-[var(--lf-line)]'
      }`}
    >
      <div className="text-lg font-bold tracking-wide">
        <span className="text-[var(--lf-amber)]">⛯</span> LANDFALL
      </div>
      <div className="text-sm text-[var(--lf-dim)]">
        {round ? `Round #${round.roundId}` : '—'}
        {phase && (
          <span
            className={
              fogActive || (phase.phase === 'ANCHOR_OPEN' && remaining < 3)
                ? 'lf-pulse ml-2'
                : 'ml-2'
            }
          >
            {fogActive ? 'blind fog' : PHASE_LABEL[phase.phase]}
            {showTimer && ` ${remaining.toFixed(1)}s`}
            {!fogActive && phase.phase === 'ANCHOR_OPEN' && fogIn > 0 && (
              <span className="ml-1 text-[var(--lf-amber)]">fog in {fogIn.toFixed(1)}s</span>
            )}
          </span>
        )}
      </div>

      {surge ? (
        <div className="lf-pulse rounded-md bg-[var(--lf-amber)] px-3 py-0.5 text-sm font-extrabold text-black">
          ⚡ SURGE ROUND — pot {fmt(round!.surgePotMinor)} pays out NOW
        </div>
      ) : (
        round && (
          <div
            className="rounded-md border border-[var(--lf-amber)]/40 px-2.5 py-0.5 text-sm font-semibold text-[var(--lf-amber)]"
            title="Storm Surge pot — grows every round; on a surge round one surviving skipper takes it ALL"
          >
            ⚡ {fmt(round.surgePotMinor)}
          </div>
        )
      )}

      {round?.weather && phase?.phase !== 'COOLDOWN' && (
        <div
          className={`rounded-md border px-2.5 py-0.5 text-sm font-semibold ${
            round.weather.id === 'HEAVY_FOG'
              ? 'border-slate-300/50 text-slate-200'
              : round.weather.id === 'CROSSWIND'
                ? 'border-cyan-300/50 text-cyan-200'
                : round.weather.id === 'HIGH_SWELL'
                  ? 'border-[var(--lf-danger)]/60 text-[var(--lf-danger)]'
                  : 'border-[var(--lf-line)] text-[var(--lf-dim)]'
          }`}
          title={round.weather.description}
        >
          {round.weather.shortLabel}
        </div>
      )}

      <div className="ml-auto flex items-center gap-3 text-sm">
        {!connected && <span className="text-[var(--lf-danger)]">reconnecting…</span>}
        <span className="text-[var(--lf-dim)]">{name ?? ''}</span>
        <span className="rounded-md bg-[var(--lf-panel)] px-2 py-1 font-semibold">
          {fmt(balanceMinor)} cr
        </span>
        <div className="group relative flex items-center">
          <button
            onClick={() => {
              const m = !muted;
              setMuted(m);
              audio.setPrefs({ muted: m });
            }}
            className="h-7 w-7 rounded-full border border-[var(--lf-line)] text-[var(--lf-dim)] hover:border-[var(--lf-dim)] hover:text-[var(--lf-text)]"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <div className="absolute right-0 top-9 z-30 hidden rounded-md border border-[var(--lf-line)] bg-[var(--lf-panel)] p-2 group-hover:block">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                audio.setPrefs({ volume: v, muted: false });
                setMuted(false);
              }}
              className="w-24 accent-[var(--lf-amber)]"
            />
          </div>
        </div>
        <button
          onClick={() => {
            audio.click('nav');
            setRulesOpen(true);
          }}
          className="h-7 w-7 rounded-full border border-[var(--lf-line)] text-[var(--lf-dim)] hover:border-[var(--lf-dim)] hover:text-[var(--lf-text)]"
          title="How to play"
        >
          ?
        </button>
      </div>
    </header>
  );
}
