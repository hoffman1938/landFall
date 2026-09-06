/**
 * Telemetry rail — the dashboard's left column.
 *
 * The board answers "where do I bet"; this rail answers "where do I stand".
 * Everything here is a fact the server already published, arranged the way a
 * trading terminal arranges a position: your session first, this round second,
 * the table's flow third, the record last.
 *
 * INFORMATION DISCIPLINE. The rail never leaks anything the board is keeping
 * back. Exact pools do not exist publicly until the lock snapshot, so before
 * the lock the rail shows player counts and banded crowd only — the same
 * public Tide Report the map draws — and says plainly that the pot is sealed.
 * A dashboard that quietly knew more than the map would be a cheat surface.
 *
 * WHY A SESSION CURVE. It is the F1 reality check, drawn continuously instead
 * of fired on a timer: one honest line that does not reset on a win, is not
 * smoothed, and is not hidden while it is under water. Players track their
 * session anyway — on paper, in their head, badly. Doing it for them, exactly,
 * is the difference between a dashboard and a slot machine.
 *
 * WHY A STRIKE-FREQUENCY BLOCK. Players read streaks into any history strip
 * whether or not one is offered. Showing the counts *next to* the flat 1-in-6
 * line beats hiding them: the fallacy is answered where it is formed instead
 * of being left to run unchallenged behind the UI.
 */
import { useEffect, useRef, useState } from 'react';
import { ZONE_COUNT, type TideBand } from '@landfall/core';
import { audio } from '../audio/engine';
import { fmt, useStore, type SessionPoint } from '../store';
import { crowdLabel, zoneName } from '../strings';
import { ChartIcon, LockIcon, StormIcon, XIcon } from './icons';

/** How full a zone's crowd bar reads. Mirrors BAND_FILL in the bay layer. */
const BAND_FILL: Record<TideBand, number> = {
  seed: 0.12,
  light: 0.34,
  medium: 0.56,
  heavy: 0.79,
  packed: 1,
};

const TREND_GLYPH = { falling: '↓', stable: '·', rising: '↑' } as const;

/** Rounds counted by the strike-frequency block. */
const FREQUENCY_WINDOW = 24;

/**
 * Compact credits for a dashboard cell: 1 234 → 1.2k, 1 200 000 → 1.2M.
 * Precision is fixed at one decimal below a thousand rather than varying with
 * magnitude — these render as a column, and a column whose decimal place moves
 * from row to row cannot be scanned.
 */
function compact(minor: number): string {
  const units = Math.abs(minor) / 100;
  const sign = minor < 0 ? '−' : '';
  if (units >= 1_000_000) return `${sign}${(units / 1_000_000).toFixed(1)}M`;
  if (units >= 10_000) return `${sign}${Math.round(units / 1000)}k`;
  if (units >= 1_000) return `${sign}${(units / 1000).toFixed(1)}k`;
  return `${sign}${units.toFixed(1)}`;
}

function signed(minor: number): string {
  if (minor === 0) return '0.00';
  return `${minor > 0 ? '+' : '−'}${fmt(Math.abs(minor))}`;
}

function elapsed(from: number | null, now: number): string {
  if (from === null) return '—';
  const total = Math.max(0, Math.floor((now - from) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ blocks */

function Block({
  label,
  children,
  aside,
}: {
  label: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="border-b border-[var(--lf-line)] px-3 py-3 last:border-b-0">
      <header className="mb-2.5 flex items-center gap-2">
        <h3 className="lf-label">{label}</h3>
        {aside ? <span className="ml-auto shrink-0">{aside}</span> : null}
      </header>
      {children}
    </section>
  );
}

/** One label/value line. The rail is mostly made of these. */
function Row({
  label,
  value,
  tone = 'default',
  title,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'mine' | 'win' | 'loss' | 'muted';
  title?: string;
}) {
  const color =
    tone === 'mine'
      ? 'text-[var(--lf-text)]'
      : tone === 'win'
        ? 'text-[var(--lf-win)]'
        : tone === 'loss'
          ? 'text-[var(--lf-accent)]'
          : tone === 'muted'
            ? 'text-[var(--lf-mute)]'
            : 'text-[var(--lf-dim)]';
  return (
    <div className="flex items-baseline justify-between gap-2 py-[3px]" title={title}>
      <span className="truncate text-[11px] font-semibold text-[var(--lf-mute)]">{label}</span>
      <span className={`lf-num shrink-0 text-[13px] ${color}`}>{value}</span>
    </div>
  );
}

/**
 * The session curve. Cumulative net, zero-anchored, with the axis drawn — the
 * one chart on the screen, so it carries the coordinate lines that make the
 * whole surface read as an instrument.
 */
function SessionCurve({ series }: { series: SessionPoint[] }) {
  const W = 216;
  const H = 56;

  if (series.length < 2) {
    return (
      <div
        className="flex h-14 items-center justify-center border border-dashed border-[var(--lf-line)] text-[11px] font-semibold text-[var(--lf-mute)]"
        aria-hidden="true"
      >
        Curve starts after 2 rounds
      </div>
    );
  }

  const values = series.map((p) => p.cumulativeMinor);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = Math.max(1, max - min);
  const x = (i: number) => (i / (series.length - 1)) * (W - 2) + 1;
  const y = (v: number) => H - 4 - ((v - min) / span) * (H - 8);
  const zeroY = y(0);
  const last = values[values.length - 1] ?? 0;
  const stroke = last > 0 ? 'var(--lf-win)' : last < 0 ? 'var(--lf-accent)' : 'var(--lf-dim)';
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-14 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Session curve over ${series.length} rounds, currently ${signed(last)} credits`}
    >
      {/* coordinate lines — every sixth round, plus the zero axis */}
      {series.map((_, i) =>
        i % 6 === 0 && i > 0 ? (
          <line
            key={i}
            x1={x(i)}
            x2={x(i)}
            y1={2}
            y2={H - 2}
            stroke="var(--lf-line)"
            strokeWidth={1}
          />
        ) : null,
      )}
      <line
        x1={0}
        x2={W}
        y1={zeroY}
        y2={zeroY}
        stroke="var(--lf-line-2)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.5} fill={stroke} />
    </svg>
  );
}

/** Live per-zone flow — and a second, list-shaped way to pick a zone. */
function ZoneFlow() {
  const phase = useStore((s) => s.phase?.phase ?? null);
  const tideReport = useStore((s) => s.tideReport);
  const pools = useStore((s) => s.pools);
  const myFleet = useStore((s) => s.myFleet);
  const selectedZone = useStore((s) => s.selectedZone);
  const lastLandfall = useStore((s) => s.lastLandfall);
  const connected = useStore((s) => s.connected);
  const finalOrderUsed = useStore((s) => s.finalOrderUsed);
  const selectZone = useStore((s) => s.selectZone);

  const resolved = phase === 'RESOLVED' || phase === 'COOLDOWN';
  const locked = phase === 'LOCKED_STORM';
  const canPick = connected && phase === 'ANCHOR_OPEN' && !finalOrderUsed;
  const struck = resolved ? (lastLandfall?.struckZone ?? null) : null;
  // Bars are read against each other, so they scale to the biggest zone —
  // the same normalisation the board's pier gauges use, so the two surfaces
  // never disagree about which zone is heaviest.
  const peakTotal = Math.max(1, ...(pools?.totalsMinor ?? [1]));

  return (
    <div className="flex flex-col">
      {Array.from({ length: ZONE_COUNT }, (_, zone) => {
        const tide = tideReport?.entries.find((e) => e.zone === zone) ?? null;
        const total = pools?.totalsMinor[zone] ?? null;
        const boats =
          phase === 'ANCHOR_OPEN' ? (tide?.boatCount ?? 0) : (pools?.boatCounts[zone] ?? 0);
        const mine =
          myFleet?.primaryZone === zone ||
          (myFleet?.mode === 'SPLIT' && myFleet.secondaryZone === zone);
        const selected = !myFleet && selectedZone === zone;
        const hit = struck === zone;
        // Bar length: the banded crowd while bets are open, the exact pool
        // relative to the heaviest zone once the lock has published them.
        const fill =
          total !== null ? total / peakTotal : tide ? BAND_FILL[tide.band] : 0;

        return (
          <button
            key={zone}
            type="button"
            disabled={!canPick}
            onClick={() => {
              audio.click('tap');
              selectZone(zone);
            }}
            aria-pressed={mine || selected}
            aria-label={`${zoneName(zone)}. ${
              hit ? 'Hit by the storm.' : tide ? `${crowdLabel(tide.band)} crowd.` : ''
            } ${boats} ${boats === 1 ? 'player' : 'players'}.${
              mine ? ' Your bet is here.' : selected ? ' Selected.' : ''
            }`}
            className={`group flex items-center gap-2 rounded-r-md border-l-2 py-1.5 pl-2 pr-1 text-left transition-colors ${
              hit
                ? 'border-[var(--lf-accent)] bg-[var(--lf-accent-soft)]'
                : mine
                  ? 'border-white bg-[var(--lf-white-soft)]'
                  : selected
                    ? 'border-white/50'
                    : 'border-transparent hover:border-[var(--lf-line-2)] hover:bg-[var(--lf-surface-2)]'
            } ${canPick ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span
              className={`w-3 shrink-0 text-[11px] font-black tabular-nums ${
                hit
                  ? 'text-[var(--lf-accent)]'
                  : mine || selected
                    ? 'text-[var(--lf-text)]'
                    : 'text-[var(--lf-mute)]'
              }`}
            >
              {zone + 1}
            </span>

            {/* the flow bar — the rail's only repeated graphic */}
            <span className="relative h-[6px] min-w-0 flex-1 bg-[var(--lf-surface-2)]">
              <span
                className={`absolute inset-y-0 left-0 transition-[width] duration-300 ${
                  hit
                    ? 'bg-[var(--lf-accent)]'
                    : mine
                      ? 'bg-white'
                      : 'bg-[var(--lf-line-2)] group-hover:bg-[var(--lf-dim)]'
                }`}
                style={{ width: `${Math.min(100, Math.max(3, fill * 100))}%` }}
              />
            </span>

            <span className="flex w-14 shrink-0 items-center justify-end gap-1 text-[11px] font-bold tabular-nums text-[var(--lf-dim)]">
              {hit ? (
                <span className="text-[var(--lf-accent)]">
                  <StormIcon size={11} />
                </span>
              ) : locked ? (
                <span className="text-[var(--lf-mute)]">
                  <LockIcon size={11} />
                </span>
              ) : tide ? (
                <span className="text-[var(--lf-mute)]">{TREND_GLYPH[tide.trend]}</span>
              ) : null}
              <span className={mine ? 'text-[var(--lf-text)]' : ''}>
                {total !== null ? compact(total) : `${boats}p`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Struck-zone counts over the recent window, with the odds stated flat. */
function StrikeFrequency() {
  const wreckLog = useStore((s) => s.wreckLog);
  const window_ = wreckLog.slice(-FREQUENCY_WINDOW);
  const counts = Array.from(
    { length: ZONE_COUNT },
    (_, zone) => window_.filter((z) => z === zone).length,
  );
  const peak = Math.max(1, ...counts);

  return (
    <>
      <div className="flex items-end gap-1.5" role="img"
        aria-label={counts
          .map((c, z) => `${zoneName(z)} hit ${c} times`)
          .join(', ')}
      >
        {counts.map((count, zone) => (
          <div key={zone} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-bold tabular-nums text-[var(--lf-dim)]">
              {count}
            </span>
            <span
              className="w-full bg-[var(--lf-line-2)]"
              style={{ height: `${6 + (count / peak) * 26}px` }}
            />
            <span className="text-[10px] font-bold tabular-nums text-[var(--lf-mute)]">
              {zone + 1}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] font-semibold leading-snug text-[var(--lf-mute)]">
        Last {window_.length} rounds. Every zone stays exactly 1 in 6 next round — history never
        moves the odds.
      </p>
    </>
  );
}

/* -------------------------------------------------------------------- rail */

function RailBody() {
  const balanceMinor = useStore((s) => s.balanceMinor);
  const sessionSeries = useStore((s) => s.sessionSeries);
  const sessionStartAt = useStore((s) => s.sessionStartAt);
  const myFleet = useStore((s) => s.myFleet);
  const pools = useStore((s) => s.pools);
  const tideReport = useStore((s) => s.tideReport);
  const phase = useStore((s) => s.phase?.phase ?? null);
  const round = useStore((s) => s.round);
  const roomId = useStore((s) => s.roomId);
  const rooms = useStore((s) => s.rooms);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const net = sessionSeries.at(-1)?.cumulativeMinor ?? 0;
  const played = sessionSeries.filter((p) => p.played);
  const wins = played.filter((p) => p.netMinor > 0).length;
  const handle = pools?.totalsMinor.reduce((a, n) => a + n, 0) ?? null;
  const players =
    phase === 'ANCHOR_OPEN'
      ? (tideReport?.entries.reduce((a, e) => a + e.boatCount, 0) ?? 0)
      : (pools?.boatCounts.reduce((a, n) => a + n, 0) ?? 0);
  const myShare =
    handle && handle > 0 && myFleet ? (myFleet.stakeMinor / handle) * 100 : null;
  const tableName = rooms.find((r) => r.roomId === roomId)?.name ?? '—';

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <Block
        label="Session"
        aside={
          <span className="lf-num text-[11px] text-[var(--lf-mute)]">
            {elapsed(sessionStartAt, now)}
          </span>
        }
      >
        {/* the rail's leading figure (rule 3) */}
        <div
          key={net}
          className={`lf-display lf-tick text-[30px] ${
            net > 0
              ? 'text-[var(--lf-win)]'
              : net < 0
                ? 'text-[var(--lf-accent)]'
                : 'text-[var(--lf-text)]'
          }`}
          aria-label={`Session net ${signed(net)} credits`}
        >
          {signed(net)}
        </div>
        <div className="mt-2.5">
          <SessionCurve series={sessionSeries} />
        </div>
        <div className="mt-1.5 border-t border-[var(--lf-line)] pt-1.5">
          <Row label="Balance" value={fmt(balanceMinor)} tone="mine" />
          <Row
            label="Rounds played"
            value={`${played.length}`}
            title="Rounds this session where you had money on the board"
          />
          <Row
            label="Safe"
            value={played.length > 0 ? `${wins}/${played.length}` : '—'}
            title="Rounds you finished up. Each round is independent — this is a record, not a rate to predict from."
          />
        </div>
      </Block>

      <Block
        label="This round"
        aside={
          round ? (
            <span className="lf-num text-[11px] text-[var(--lf-mute)]">#{round.roundId}</span>
          ) : null
        }
      >
        <Row label="Table" value={tableName} tone="muted" />
        <Row
          label="Your stake"
          value={myFleet ? fmt(myFleet.stakeMinor) : '—'}
          tone={myFleet ? 'mine' : 'muted'}
        />
        <Row
          label="Your zone"
          value={
            myFleet
              ? myFleet.mode === 'SPLIT' && myFleet.secondaryZone !== null
                ? `${myFleet.primaryZone + 1} · ${myFleet.secondaryZone + 1}`
                : `${myFleet.primaryZone + 1}`
              : '—'
          }
          tone={myFleet ? 'mine' : 'muted'}
        />
        <Row label="Players in" value={players > 0 ? `${players}` : '—'} />
        {/*
         * Exact pools do not exist publicly until the lock snapshot. Saying so
         * is better than an empty cell: the seal is a rule of the game, and a
         * player who understands it stops hunting for a number that is not
         * being withheld from them personally.
         */}
        <Row
          label="Table pot"
          value={
            handle !== null ? (
              fmt(handle)
            ) : (
              <span className="inline-flex items-center gap-1 text-[var(--lf-mute)]">
                <LockIcon size={11} />
                sealed
              </span>
            )
          }
          tone={handle !== null ? 'default' : 'muted'}
          title={
            handle !== null
              ? 'Exact total staked this round'
              : 'Exact pots are published when bets lock — everyone sees them at the same moment'
          }
        />
        {myShare !== null && (
          <Row
            label="Your share"
            value={`${myShare.toFixed(1)}%`}
            tone="mine"
            title="Your stake as a share of the whole round. Capped at 25%."
          />
        )}
      </Block>

      <Block label="Zone flow">
        <ZoneFlow />
      </Block>

      <Block label="Where it hit">
        <StrikeFrequency />
      </Block>
    </div>
  );
}

function useIsWide(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches,
  );
  useEffect(() => {
    const q = window.matchMedia('(min-width: 1280px)');
    const update = () => setWide(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return wide;
}

export function TelemetryRail() {
  const wide = useIsWide();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const net = useStore((s) => s.sessionSeries.at(-1)?.cumulativeMinor ?? 0);

  // A drawer never survives into the docked breakpoint.
  useEffect(() => {
    if (wide) setDrawerOpen(false);
  }, [wide]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        launcherRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  if (wide) {
    return (
      <aside
        className="relative z-20 flex h-full w-[var(--lf-rail-width)] shrink-0 flex-col border-r border-[var(--lf-line)] bg-[var(--lf-bg-2)]"
        aria-label="Session and table telemetry"
      >
        <RailBody />
      </aside>
    );
  }

  return (
    <>
      {!drawerOpen && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => {
            audio.click('nav');
            setDrawerOpen(true);
          }}
          className="lf-surface absolute right-2 top-14 z-20 flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2.5 text-[var(--lf-dim)] transition-colors hover:border-[var(--lf-line-2)] hover:text-[var(--lf-text)]"
          aria-label={`Open session and table telemetry. Session ${signed(net)} credits.`}
          aria-expanded="false"
          aria-haspopup="dialog"
        >
          <ChartIcon size={16} />
          {/* The session figure rides along wherever there is room for it: on a
              phone the centre readout owns that band, so the chip shrinks to
              its icon rather than colliding with the round's leading number. */}
          <span
            className={`lf-num hidden text-[12px] sm:inline ${
              net > 0
                ? 'text-[var(--lf-win)]'
                : net < 0
                  ? 'text-[var(--lf-accent)]'
                  : 'text-[var(--lf-dim)]'
            }`}
          >
            {signed(net)}
          </span>
        </button>
      )}

      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/70"
            aria-hidden="true"
            onMouseDown={() => setDrawerOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Session and table telemetry"
            className="lf-sheet fixed bottom-0 left-0 top-12 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col border-r border-[var(--lf-line-2)] bg-[var(--lf-bg-2)]"
          >
            <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-[var(--lf-line)] px-3">
              <ChartIcon size={16} />
              <h2 className="lf-label !text-[var(--lf-dim)]">Telemetry</h2>
              <button
                type="button"
                onClick={() => {
                  audio.click('nav');
                  setDrawerOpen(false);
                  launcherRef.current?.focus();
                }}
                className="ml-auto flex h-11 w-11 items-center justify-center rounded-md text-[var(--lf-dim)] hover:bg-[var(--lf-surface-2)] hover:text-[var(--lf-text)]"
                aria-label="Close telemetry"
              >
                <XIcon size={16} />
              </button>
            </div>
            <RailBody />
          </aside>
        </>
      )}
    </>
  );
}
