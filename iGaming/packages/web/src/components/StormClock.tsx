/**
 * Round status instrument — phase, countdown and the next instruction in one
 * compact card. Readable in under a second, never interactive, never moves.
 *
 * D6: the countdown track carries a fog segment sized from this round's
 * `fogStartsAt` (weather-dependent — Heavy Fog is a longer segment), so an
 * early fog never reads as a broken timer; and each weather pattern shows one
 * short caption on its first encounter (persisted per profile).
 */
import { useEffect, useRef, useState } from 'react';
import type { WeatherId } from '@landfall/core';
import { fogSegmentFraction } from '../clockMath';
import { AnchorIcon, FogIcon, LockIcon, StormIcon } from './icons';
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

const MODE_META: Record<ClockMode, { label: string; color: string }> = {
  open: { label: STR.phaseBetting, color: 'var(--lf-focus)' },
  fog: { label: STR.phaseHidden, color: '#aebccf' },
  storm: { label: STR.phaseStorm, color: 'var(--lf-danger)' },
  landfall: { label: STR.phaseResult, color: 'var(--lf-danger)' },
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

export function StormClock() {
  const phase = useStore((s) => s.phase);
  const round = useStore((s) => s.round);
  const tideReport = useStore((s) => s.tideReport);
  const myFleet = useStore((s) => s.myFleet);
  const finalOrderUsed = useStore((s) => s.finalOrderUsed);
  const fleetMode = useStore((s) => s.fleetMode);
  const lastLandfall = useStore((s) => s.lastLandfall);
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
  const finalSeconds = (mode === 'open' || mode === 'fog') && remaining < 3200;
  const meta = MODE_META[mode];
  const color = finalSeconds ? 'var(--lf-danger)' : meta.color;
  const text = instruction(
    mode,
    !!myFleet,
    finalOrderUsed,
    fleetMode === 'SPLIT',
    lastLandfall?.struckZone ?? null,
  );
  const Icon =
    mode === 'open' ? AnchorIcon : mode === 'fog' ? FogIcon : mode === 'storm' ? LockIcon : StormIcon;

  return (
    <div className="pointer-events-none absolute left-1/2 top-11 z-10 -translate-x-1/2">
      <section
        className={`lf-surface relative w-40 overflow-hidden rounded-xl px-3 pb-2 pt-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.45)] ${
          round?.surgeRound && mode !== 'next' ? 'ring-1 ring-[var(--lf-amber)]/70' : ''
        }`}
        role="timer"
        aria-label={`Round ${round?.roundId ?? 'unknown'}. ${meta.label}. ${seconds} seconds. ${text}.`}
      >
        <div className="flex items-center justify-between gap-1 text-[9px] font-bold tracking-[0.04em] text-[var(--lf-dim)]">
          <span className="shrink-0 tabular-nums">{round ? `#${round.roundId}` : '—'}</span>
          <span className="flex shrink-0 items-center gap-1" style={{ color }}>
            <Icon size={11} />
            {meta.label}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-2.5">
          <span
            className="text-[34px] font-extrabold leading-none tabular-nums tracking-[-0.04em]"
            style={{ color }}
            aria-hidden="true"
          >
            {String(seconds).padStart(2, '0')}
          </span>
          <span className="line-clamp-2 min-w-0 text-[11px] font-semibold leading-[1.25] text-[var(--lf-text)]">
            {text}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-1 bg-[var(--lf-line)]/60" aria-hidden="true">
          <span
            className="block h-full origin-left transition-[width,background-color] duration-100 ease-linear"
            style={{ width: `${progress * 100}%`, backgroundColor: color }}
          />
          {/* fog segment overlay — sized per this round's weather (D6) */}
          {fogFraction > 0 && (
            <span
              className="absolute inset-y-0 left-0 bg-[#c6d5e5]/45"
              style={{ width: `${fogFraction * 100}%` }}
            />
          )}
        </div>
      </section>

      {/* one-time weather caption (first encounter per pattern) */}
      {captionFor && round && (
        <p
          role="status"
          className="lf-caption mx-auto mt-1.5 w-max max-w-60 rounded-md border border-[var(--lf-line)] bg-[var(--lf-glass)] px-2.5 py-1 text-center text-[13px] font-semibold leading-snug text-[var(--lf-text)]"
        >
          <span className="text-[var(--lf-dim)]">{round.weather.label}:</span>{' '}
          {WEATHER_CAPTIONS[captionFor]}
        </p>
      )}
    </div>
  );
}
