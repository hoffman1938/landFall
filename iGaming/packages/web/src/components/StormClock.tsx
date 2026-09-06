/**
 * The round instrument — the leading figure of the whole screen.
 *
 * On a wide board this is the centre readout: the phase, one very large
 * countdown, a drain bar and the single next instruction, sitting in the
 * middle of the plot area where the eye already is (design rule 3). On a
 * narrow board the same content collapses to a compact strip above the zones,
 * because the centre there belongs to the zone cards.
 *
 * It is never interactive and it never moves. A player who looks at exactly
 * one thing on this screen should still know what is happening and what to do.
 *
 * D6: the drain carries a fog segment sized from this round's `fogStartsAt`
 * (weather-dependent — Heavy Fog is a longer segment), so an early fog never
 * reads as a broken timer; and each weather pattern shows one short caption on
 * its first encounter (persisted per profile).
 */
import { useEffect, useRef, useState } from 'react';
import type { WeatherId } from '@landfall/core';
import { fogSegmentFraction } from '../clockMath';
import { FogIcon, LockIcon, StormIcon, TimerIcon } from './icons';
import { useStore } from '../store';
import { STR, zoneName } from '../strings';

type ClockMode = 'open' | 'fog' | 'storm' | 'landfall' | 'next';

/** ≤ 6 words each (D6). Single map so localization swaps in one place. */
const WEATHER_CAPTIONS: Record<WeatherId, string> = {
  CLEAR_TIDE: 'Standard tide, standard fog',
  HEAVY_FOG: 'Fog rolls in a second early',
  CROSSWIND: 'Signal flags arrive slightly delayed',
  HIGH_SWELL: 'Bigger waves — same odds',
};

const WEATHER_SEEN_KEY = 'landfall.weather-seen.v1';

function readSeenWeather(): WeatherId[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(WEATHER_SEEN_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === 'string') as WeatherId[]) : [];
  } catch {
    return [];
  }
}

function markSeenWeather(id: WeatherId): void {
  try {
    const seen = readSeenWeather();
    if (!seen.includes(id)) {
      window.localStorage.setItem(WEATHER_SEEN_KEY, JSON.stringify([...seen, id]));
    }
  } catch {
    // Storage may be disabled; the caption then reappears next session — harmless.
  }
}

/*
 * Phase colour is the color law in miniature: white while the decision is
 * yours, grey while the table is sealed and nothing you do matters, red the
 * moment the storm owns the round.
 */
const MODE_META: Record<ClockMode, { label: string; color: string }> = {
  open: { label: STR.phaseBetting, color: '#ffffff' },
  fog: { label: STR.phaseHidden, color: 'var(--lf-warn)' },
  storm: { label: STR.phaseStorm, color: 'var(--lf-accent)' },
  landfall: { label: STR.phaseResult, color: 'var(--lf-accent)' },
  next: { label: STR.phaseNext, color: 'var(--lf-dim)' },
};

function instruction(
  mode: ClockMode,
  hasFleet: boolean,
  finalOrderUsed: boolean,
  splitMode: boolean,
  struckZone: number | null,
): string {
  switch (mode) {
    case 'open':
      if (!hasFleet) return splitMode ? STR.hintPickTwoZones : STR.hintPickZone;
      return STR.hintCanMove;
    case 'fog':
      if (!hasFleet) return STR.hintOneLastMove;
      return finalOrderUsed ? STR.hintLastMoveSet : STR.hintOneLastMove;
    case 'storm':
      return STR.hintLocked;
    case 'landfall':
      return struckZone === null ? STR.hintResult : `${zoneName(struckZone)} was hit`;
    case 'next':
      return STR.hintNext;
  }
}

/** ≥ 1024px puts the readout in the middle of the plot; below, it is a strip. */
function useCentred(): boolean {
  const [centred, setCentred] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    const q = window.matchMedia('(min-width: 1024px)');
    const update = () => setCentred(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return centred;
}

export function StormClock() {
  const phase = useStore((s) => s.phase);
  const round = useStore((s) => s.round);
  const tideReport = useStore((s) => s.tideReport);
  const myFleet = useStore((s) => s.myFleet);
  const finalOrderUsed = useStore((s) => s.finalOrderUsed);
  const fleetMode = useStore((s) => s.fleetMode);
  const lastLandfall = useStore((s) => s.lastLandfall);
  const centred = useCentred();
  const [now, setNow] = useState(Date.now());
  const [captionFor, setCaptionFor] = useState<WeatherId | null>(null);
  const phaseStart = useRef<{ key: string; at: number }>({ key: '', at: Date.now() });
  const roundId = round?.roundId ?? null;
  const weatherId = round?.weather.id ?? null;
  const anchorOpen = phase?.phase === 'ANCHOR_OPEN';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  // First encounter of a weather pattern: show its caption once, then persist.
  useEffect(() => {
    if (roundId === null || weatherId === null || !anchorOpen) return;
    if (readSeenWeather().includes(weatherId)) return;
    markSeenWeather(weatherId);
    setCaptionFor(weatherId);
    const timer = window.setTimeout(() => setCaptionFor(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [roundId, weatherId, anchorOpen]);

  if (!phase) return null;

  const phaseKey = `${phase.phase}:${phase.endsAt}`;
  if (phaseStart.current.key !== phaseKey) {
    phaseStart.current = { key: phaseKey, at: now };
  }

  const fogActive =
    phase.phase === 'ANCHOR_OPEN' &&
    (tideReport?.frozen === true || (round?.fogStartsAt != null && now >= round.fogStartsAt));
  const mode: ClockMode =
    phase.phase === 'ANCHOR_OPEN'
      ? fogActive
        ? 'fog'
        : 'open'
      : phase.phase === 'LOCKED_STORM'
        ? 'storm'
        : phase.phase === 'RESOLVED'
          ? 'landfall'
          : 'next';

  const remaining = Math.max(0, phase.endsAt - now);
  const total = Math.max(1, phase.endsAt - phaseStart.current.at);
  const progress = Math.max(0, Math.min(1, remaining / total));
  // The bar drains right→left, so Blind Fog (the final stretch) is the
  // leftmost segment: the tip reaches it exactly when the fog begins.
  const fogFraction =
    phase.phase === 'ANCHOR_OPEN' && round?.fogStartsAt != null
      ? fogSegmentFraction(phaseStart.current.at, round.fogStartsAt, phase.endsAt)
      : 0;
  const seconds = Math.ceil(remaining / 1000);
  // The last three seconds of a betting window turn red — the only time the
  // storm's colour is used for time rather than for the storm itself, and the
  // one moment where urgency is the honest reading.
  const finalSeconds = (mode === 'open' || mode === 'fog') && remaining < 3200;
  const meta = MODE_META[mode];
  const color = finalSeconds ? 'var(--lf-accent)' : meta.color;
  const text = instruction(
    mode,
    !!myFleet,
    finalOrderUsed,
    fleetMode === 'SPLIT',
    lastLandfall?.struckZone ?? null,
  );
  const Icon =
    mode === 'open'
      ? TimerIcon
      : mode === 'fog'
        ? FogIcon
        : mode === 'storm'
          ? LockIcon
          : StormIcon;
  const surge = round?.surgeRound && mode !== 'next';
  const label = `Round ${round?.roundId ?? 'unknown'}. ${meta.label}. ${seconds} seconds. ${text}.`;
  /*
   * At the reveal the countdown is no longer the story — the struck zone is.
   * The leading figure switches to it for those seconds so the single biggest
   * thing on screen is always the single thing that matters right now, and a
   * player who looks up late still reads the result without hunting for it.
   */
  const struck = lastLandfall?.struckZone ?? null;
  const figure =
    mode === 'landfall' && struck !== null
      ? String(struck + 1)
      : String(seconds).padStart(2, '0');
  const figureLabel = mode === 'landfall' && struck !== null ? 'Zone hit' : meta.label;

  /* ------------------------------------------------------------- centred */

  if (centred) {
    return (
      <div className="pointer-events-none absolute inset-0 z-[3] flex flex-col items-center justify-center">
        <section
          role="timer"
          aria-label={label}
          className="flex w-[min(30rem,46%)] flex-col items-center"
        >
          <div className="flex w-full items-center justify-between gap-3">
            <span className="lf-label">{round ? `Round ${round.roundId}` : '—'}</span>
            <span
              className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em]"
              style={{ color }}
            >
              <Icon size={13} />
              {figureLabel}
            </span>
          </div>

          {/* the leading figure of the entire product */}
          <span
            className="lf-display mt-1 text-[clamp(5rem,13vmin,10rem)]"
            style={{ color }}
            aria-hidden="true"
          >
            {figure}
          </span>

          {/* the drain — coordinate-line thin, full width, no glow */}
          <div className="relative mt-3 h-[3px] w-full bg-[var(--lf-surface-2)]" aria-hidden="true">
            <span
              className="absolute inset-y-0 left-0 transition-[width] duration-100 ease-linear"
              style={{ width: `${progress * 100}%`, backgroundColor: color }}
            />
            {fogFraction > 0 && (
              <>
                <span
                  className="absolute inset-y-0 left-0 bg-[var(--lf-warn)]/25"
                  style={{ width: `${fogFraction * 100}%` }}
                />
                <span
                  className="absolute inset-y-[-3px] w-px bg-[var(--lf-warn)]"
                  style={{ left: `${fogFraction * 100}%` }}
                />
              </>
            )}
          </div>

          <p className="mt-2.5 text-center text-[13px] font-semibold text-[var(--lf-dim)]">
            {text}
          </p>

          {surge && (
            <p className="mt-2 rounded-md border border-[var(--lf-warn)]/50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--lf-warn)]">
              Jackpot round
            </p>
          )}

          {captionFor && round && (
            <p role="status" className="lf-caption mt-2 text-center text-[12px] text-[var(--lf-mute)]">
              <span className="font-bold text-[var(--lf-dim)]">{round.weather.label}</span> ·{' '}
              {WEATHER_CAPTIONS[captionFor]}
            </p>
          )}
        </section>
      </div>
    );
  }

  /* -------------------------------------------------------------- compact */

  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 z-[3] flex flex-col items-center px-3">
      <section
        role="timer"
        aria-label={label}
        className={`lf-glass relative w-full max-w-[16.5rem] overflow-hidden rounded-md px-3 pb-2 pt-1.5 ${
          surge ? '!border-[var(--lf-warn)]/60' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="lf-label">{round ? `#${round.roundId}` : '—'}</span>
          <span
            className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.16em]"
            style={{ color }}
          >
            <Icon size={11} />
            {figureLabel}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-3">
          <span className="lf-display text-[42px]" style={{ color }} aria-hidden="true">
            {figure}
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-semibold leading-tight text-[var(--lf-dim)]">
            {text}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--lf-surface-2)]" aria-hidden="true">
          <span
            className="absolute inset-y-0 left-0 transition-[width] duration-100 ease-linear"
            style={{ width: `${progress * 100}%`, backgroundColor: color }}
          />
          {fogFraction > 0 && (
            <>
              <span
                className="absolute inset-y-0 left-0 bg-[var(--lf-warn)]/25"
                style={{ width: `${fogFraction * 100}%` }}
              />
              <span
                className="absolute inset-y-0 w-px bg-[var(--lf-warn)]"
                style={{ left: `${fogFraction * 100}%` }}
              />
            </>
          )}
        </div>
      </section>

      {captionFor && round && (
        <p
          role="status"
          className="lf-caption lf-surface mt-1.5 w-max max-w-[17rem] rounded-md px-2.5 py-1 text-center text-[12px] font-semibold leading-snug text-[var(--lf-dim)]"
        >
          <span className="text-[var(--lf-mute)]">{round.weather.label}:</span>{' '}
          {WEATHER_CAPTIONS[captionFor]}
        </p>
      )}
    </div>
  );
}
