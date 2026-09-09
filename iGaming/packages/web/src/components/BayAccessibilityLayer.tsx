import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  SPLIT_PRIMARY_PERCENT,
  ZONE_COUNT,
  type FleetPlanPublic,
  type RoundPhase,
  type TideBand,
  type TideReportEntry,
} from '@landfall/core';
import { getCoveLayouts, type CoveLayout } from '../coveLayout';
import { useStore, type LandfallInfo } from '../store';
import { crowdLabel, zoneName } from '../strings';
import { MUTABLE_STATES } from '../roundMachine';
import { useRoundState } from '../useRoundState';
import { useSurfaces } from '../uiMode';
import { BoatIcon, LockIcon, StormIcon } from './icons';

interface BayAccessibilityLayerProps {
  onPick(zone: number): void;
  onFlag(zone: number, clientX: number, clientY: number): void;
}

interface CoveStatusCardProps {
  zone: number;
  layout: CoveLayout;
  phase: RoundPhase | null;
  tide: TideReportEntry | null;
  boatCount: number;
  lockedTotalMinor: number | null;
  fleet: FleetPlanPublic | null;
  struck: boolean;
  /** v3 P0-1 — tapped but not yet committed (Place Bet will commit it). */
  selected: boolean;
  canPick: boolean;
  /**
   * Beginner mode drops the crowd meter and the exact pot from the card.
   * Neither is needed to make the only decision on screen — pick a harbor —
   * and both are one tap away in the Advanced sheet's tide report.
   */
  showDetail: boolean;
  actionDescription: string;
  onPick(zone: number): void;
  onFlag(zone: number, clientX: number, clientY: number): void;
}

const BAND_LABELS: Record<TideBand, string> = {
  seed: crowdLabel('seed'),
  light: crowdLabel('light'),
  medium: crowdLabel('medium'),
  heavy: crowdLabel('heavy'),
  packed: crowdLabel('packed'),
};

const TREND = {
  falling: { glyph: '↘', label: 'falling' },
  stable: { glyph: '→', label: 'steady' },
  rising: { glyph: '↗', label: 'rising' },
} as const;

/**
 * How full the crowd meter reads per band. Mirrors BAND_FRAC in BayScene so
 * the card and the pier gauge tell the same story. The meter is the casino
 * read of the tide report: "Medium" is a word, a half-full pot is a picture —
 * and it stays banded, so it still leaks nothing beyond the public report.
 */
const BAND_FILL: Record<TideBand, number> = {
  seed: 0.12,
  light: 0.34,
  medium: 0.56,
  heavy: 0.79,
  packed: 1,
};

const CROWD_SEGMENTS = 6;

/**
 * Banded crowd meter — six flat ticks, grey. It reports how many other people
 * are here, which is information rather than an outcome, so it gets no hue.
 * Renders nothing once the band is gone (lock onward): that is exactly when
 * the status word is at its longest and the exact pot takes over the story,
 * so the meter's width is better spent on the label at narrow widths.
 */
function CrowdMeter({ band }: { band: TideBand | null }) {
  if (!band) return null;
  const lit = Math.round(BAND_FILL[band] * CROWD_SEGMENTS);
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-[2px]">
      {Array.from({ length: CROWD_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-[3px] ${
            i < lit ? 'bg-[var(--lf-dim)]' : 'bg-[var(--lf-line)]'
          }`}
          style={i < lit ? { opacity: 0.55 + (i / CROWD_SEGMENTS) * 0.45 } : undefined}
        />
      ))}
    </span>
  );
}

/**
 * What the player has riding on this zone. `stakeMinor` is the fleet total, so
 * a Split is apportioned here — the card shows the money actually at risk on
 * THIS zone, never the whole fleet (which read as "your bet: 110" next to a
 * 50-credit bet before).
 */
function ownership(fleet: FleetPlanPublic | null, zone: number) {
  if (!fleet) return null;
  const split = fleet.mode === 'SPLIT' && fleet.secondaryZone !== null;
  if (fleet.primaryZone === zone) {
    const mineMinor = split
      ? Math.round((fleet.stakeMinor * SPLIT_PRIMARY_PERCENT) / 100)
      : fleet.stakeMinor;
    return split
      ? { label: `Yours · ${SPLIT_PRIMARY_PERCENT}%`, mineMinor, description: 'your main harbor' }
      : { label: 'Your bet', mineMinor, description: 'your bet is here' };
  }
  if (split && fleet.secondaryZone === zone) {
    return {
      label: `Yours · ${100 - SPLIT_PRIMARY_PERCENT}%`,
      mineMinor: fleet.stakeMinor - Math.round((fleet.stakeMinor * SPLIT_PRIMARY_PERCENT) / 100),
      description: 'your second harbor',
    };
  }
  return null;
}

function formatCredits(minor: number): string {
  return (minor / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function resultAnnouncement(result: LandfallInfo | null): string {
  if (!result) return '';
  const round = `Round ${result.roundId}. The storm hit ${zoneName(result.struckZone)}.`;
  const net = Math.abs(result.yourResult.netMinor) / 100;
  const credits = `${net.toFixed(2)} credits`;

  switch (result.yourResult.outcome) {
    case 'SAFE':
      return `${round} You are safe and won ${credits}.`;
    case 'WRECKED':
      return `${round} Your zone was hit and you lost ${credits}.`;
    case 'SPLIT':
      return result.yourResult.netMinor === 0
        ? `${round} Your two-zone bet broke even.`
        : `${round} Your two-zone bet settled and you ${
            result.yourResult.netMinor > 0 ? 'won' : 'lost'
          } ${credits}.`;
    case 'SPECTATOR':
      return `${round} You sat out this round.`;
  }
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function CoveStatusCard({
  zone,
  layout,
  phase,
  tide,
  boatCount,
  lockedTotalMinor,
  fleet,
  struck,
  selected,
  canPick,
  showDetail,
  actionDescription,
  onPick,
  onFlag,
}: CoveStatusCardProps) {
  const longPressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const mine = ownership(fleet, zone);
  const trend = tide ? TREND[tide.trend] : null;
  const locked = phase === 'LOCKED_STORM';
  const safe = !struck && (phase === 'RESOLVED' || phase === 'COOLDOWN');
  const band = tide ? BAND_LABELS[tide.band] : 'Waiting';
  const status = struck ? 'Hit' : locked ? 'Locked' : safe ? 'Safe' : band;
  const detail = lockedTotalMinor !== null ? formatCredits(lockedTotalMinor) : null;
  // Bigger seats: the markers are the product's primary betting surface, so on
  // a wide table they get real presence instead of hugging a 132px minimum.
  // The size lives in coveLayout so the Pixi scene can frame this exact box
  // rather than guess at it — a marker drawn inside it would be invisible.
  const markerWidth = layout.markerWidth;
  const cardDescription = [
    `${zoneName(zone)}.`,
    struck
      ? 'Hit by the storm.'
      : locked
        ? 'Bets locked.'
        : safe
          ? 'Safe.'
          : showDetail
            ? `${band} crowd.`
            : '',
    showDetail && trend ? `Trend ${trend.label}.` : '',
    `${boatCount} ${boatCount === 1 ? 'player' : 'players'}.`,
    showDetail ? (detail ? `Pot ${detail} credits.` : 'Exact pot hidden until bets lock.') : '',
    mine
      ? `${formatCredits(mine.mineMinor)} credits of yours are here — ${mine.description}.`
      : selected
        ? 'Selected — press Place Bet to confirm.'
        : 'Not selected.',
    actionDescription,
    `Keyboard shortcut ${zone + 1}.`,
  ]
    .filter(Boolean)
    .join(' ');

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => clearLongPress, []);

  const startLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canPick || event.button !== 0) return;
    clearLongPress();
    const { clientX, clientY } = event;
    longPressTimer.current = window.setTimeout(() => {
      suppressClick.current = true;
      onFlag(zone, clientX, clientY);
    }, 480);
  };

  return (
    <button
      type="button"
      data-cove={zone + 1}
      className={`lf-glass pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border px-3 py-2 text-left text-[var(--lf-text)] transition-[border-color,background-color] duration-150 ${
        struck
          ? '!border-[var(--lf-accent)]'
          : mine
            ? '!border-white'
            : selected
              ? 'border-dashed !border-white/60'
              : locked || safe
                ? ''
                : 'hover:!border-[var(--lf-line-2)]'
      } ${canPick ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ left: layout.markerX, top: layout.markerY, width: markerWidth }}
      aria-label={cardDescription}
      aria-keyshortcuts={`${zone + 1}`}
      aria-pressed={!!mine || selected}
      aria-disabled={!canPick}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (canPick) onPick(zone);
      }}
      onContextMenu={(event) => {
        if (!canPick) return;
        event.preventDefault();
        onFlag(zone, event.clientX, event.clientY);
      }}
      onPointerDown={startLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
    >
      {/* struck / mine wash — the state is felt before it is read */}
      {(struck || mine) && (
        <span
          aria-hidden="true"
          className={`absolute inset-0 ${
            struck ? 'bg-[var(--lf-accent-soft)]' : 'bg-[var(--lf-white-soft)]'
          }`}
        />
      )}

      <span className="relative flex items-center gap-1.5 leading-none">
        <span className="truncate text-[14px] font-bold uppercase tracking-[0.07em] text-[var(--lf-text)]">
          {zoneName(zone)}
        </span>
        {(mine || selected) && (
          <span
            aria-hidden="true"
            className={`ml-auto h-2 w-2 shrink-0 ${mine ? 'bg-white' : 'bg-white/45'}`}
          />
        )}
      </span>

      {/* the pot: a banded chip meter, the crowd word, and the fleet count */}
      <span className="relative mt-1.5 flex min-w-0 items-center gap-1.5 leading-none">
        {/*
         * The meter and the word say the same thing. On a phone-sized card
         * there is room for one of them, and the word wins: "MEDIUM" is
         * unambiguous where a half-lit bar has to be learned.
         */}
        {showDetail && markerWidth >= 150 && (
          <CrowdMeter band={tide && !struck && !locked && !safe ? tide.band : null} />
        )}
        {/*
         * Beginner mode shows the PHASE words (Hit / Locked / Safe) and drops
         * the crowd band. The band is a ratio against this round's average, so
         * on a quiet table "FULL" can sit next to the figure 2 — true, and
         * unreadable as anything but a contradiction to someone meeting the
         * game for the first time. The advanced board keeps it, next to the
         * meter and the tide report that give it its scale.
         */}
        {(showDetail || struck || locked || safe) && (
          <span
            className={`truncate text-[12px] font-semibold uppercase ${
              struck ? 'text-[var(--lf-accent)]' : 'text-[var(--lf-dim)]'
            }`}
          >
            {status}
          </span>
        )}
        {showDetail && trend && !struck && !locked && (
          <span
            aria-label={`${trend.label} trend`}
            className="shrink-0 text-[12px] font-extrabold text-[var(--lf-dim)]"
          >
            {trend.glyph}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[12px] font-bold tabular-nums text-[var(--lf-dim)]">
          {struck ? (
            <StormIcon size={13} aria-hidden="true" />
          ) : locked ? (
            <LockIcon size={13} aria-hidden="true" />
          ) : null}
          {boatCount}
          <BoatIcon size={12} aria-hidden="true" />
        </span>
      </span>

      {/* Money row. Always rendered so the marker never changes height between
          phases — the exact pot only exists after the lock snapshot, and a
          card that grows at lock reads as the table twitching. Your own stake
          on this zone sits left of the pot, so the two are never confused.

          In beginner mode the pot column is dropped and the row carries only
          your own stake: a player choosing between six harbors for the first
          time is not choosing on pool size, and six pot figures is six numbers
          to read before making a decision that needs none of them. */}
      <span className="relative mt-1.5 flex items-baseline gap-2 border-t border-[var(--lf-line)] pt-1.5 leading-none">
        {mine ? (
          <span className="flex min-w-0 shrink items-baseline gap-1 text-white">
            <span className="lf-label-soft shrink-0 !text-white/70">{mine.label}</span>
            <span className="lf-num truncate text-[16px]">
              {formatCredits(mine.mineMinor)}
            </span>
          </span>
        ) : showDetail ? (
          <span className="lf-label-soft shrink-0">Pot</span>
        ) : (
          // Beginner mode: the row keeps its height (so a card never grows when
          // a bet lands) but says nothing. Six cards each announcing that they
          // hold no bet is six labels reporting the absence of news.
          <span aria-hidden="true">&nbsp;</span>
        )}
        {showDetail && (
          <span
            className={`ml-auto flex shrink-0 items-baseline gap-1 ${
              detail ? 'text-[var(--lf-text)]' : 'text-[var(--lf-mute)]/60'
            }`}
          >
            {mine && <span className="lf-label-soft">Pot</span>}
            <span className="lf-num text-[16px]">{detail ?? '—'}</span>
          </span>
        )}
      </span>
    </button>
  );
}

export function BayAccessibilityLayer({ onPick, onFlag }: BayAccessibilityLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const connected = useStore((state) => state.connected);
  const phase = useStore((state) => state.phase?.phase ?? null);
  const tideReport = useStore((state) => state.tideReport);
  const pools = useStore((state) => state.pools);
  const myFleet = useStore((state) => state.myFleet);
  const selectedZone = useStore((state) => state.selectedZone);
  const finalOrderUsed = useStore((state) => state.finalOrderUsed);
  const lastLandfall = useStore((state) => state.lastLandfall);
  const rulesOpen = useStore((state) => state.rulesOpen);
  const verifyRoundId = useStore((state) => state.verifyRoundId);
  const flagPickerAt = useStore((state) => state.flagPickerAt);
  const welcomeOpen = useStore((state) => state.welcomeOpen);
  const roundState = useRoundState();
  const surfaces = useSurfaces();
  const fogActive = phase === 'ANCHOR_OPEN' && (tideReport?.frozen ?? false);
  const dialogOpen = rulesOpen || welcomeOpen || verifyRoundId !== null || flagPickerAt !== null;
  /*
   * One source for "can this harbor be tapped": the round machine's mutable
   * set. `finalOrderUsed` still appears because spending the hidden order is a
   * player-scoped fact the machine folds into FINAL_LOCK — belt and braces on
   * the one control that spends money.
   */
  const canPick =
    connected && MUTABLE_STATES.has(roundState) && !finalOrderUsed && !dialogOpen;
  const layouts = getCoveLayouts(size.width, size.height);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    });
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        !canPick ||
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTextEntryTarget(event.target)
      ) {
        return;
      }
      const zone = Number(event.key) - 1;
      if (!Number.isInteger(zone) || zone < 0 || zone >= ZONE_COUNT) return;
      event.preventDefault();
      onPick(zone);
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [canPick, onPick]);

  const actionDescription = !connected
    ? 'Unavailable while reconnecting.'
    : dialogOpen
      ? 'Unavailable while another control is open.'
      : phase !== 'ANCHOR_OPEN'
        ? 'Bets are locked. No moves are accepted now.'
        : finalOrderUsed
          ? 'Your last move is submitted. No more moves this round.'
          : fogActive
            ? 'Bets hidden. Activate to make your one last move here.'
            : 'Betting is open. Activate to select this harbor.';

  const politeAnnouncement = !connected
    ? 'Connection lost. Reconnecting.'
    : phase === 'ANCHOR_OPEN'
      ? fogActive
        ? finalOrderUsed
          ? 'Last move accepted. Your bet is committed.'
          : 'Bets hidden. One last move remains.'
        : 'Betting open. Pick a harbor. Press 1 through 6 to select.'
      : phase === 'LOCKED_STORM'
        ? 'Bets locked. Storm approaching. No more moves.'
        : phase === 'RESOLVED'
          ? 'Result. The storm has hit.'
          : phase === 'COOLDOWN'
            ? 'Round complete. Next round soon.'
            : 'Connecting to Landfall.';

  return (
    <>
      <div
        ref={layerRef}
        className="pointer-events-none absolute inset-0 z-[2]"
        role="group"
        aria-label="Harbors. Use Tab or press number keys 1 through 6."
      >
        {layouts.map((layout, zone) => {
          const resolved = phase === 'RESOLVED' || phase === 'COOLDOWN';
          const tide = tideReport?.entries.find((entry) => entry.zone === zone) ?? null;
          const boatCount =
            phase === 'ANCHOR_OPEN' ? (tide?.boatCount ?? 0) : (pools?.boatCounts[zone] ?? 0);

          return (
            <CoveStatusCard
              key={zone}
              zone={zone}
              layout={layout}
              phase={phase}
              tide={tide}
              boatCount={boatCount}
              lockedTotalMinor={pools?.totalsMinor[zone] ?? null}
              fleet={myFleet}
              struck={resolved && lastLandfall?.struckZone === zone}
              selected={myFleet === null && selectedZone === zone}
              canPick={canPick}
              showDetail={surfaces.showHarborDetail}
              actionDescription={actionDescription}
              onPick={onPick}
              onFlag={onFlag}
            />
          );
        })}
      </div>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {politeAnnouncement}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {resultAnnouncement(lastLandfall)}
      </div>
    </>
  );
}
