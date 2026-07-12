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
import { BoatIcon, LockIcon, StormIcon } from './icons';

interface BayAccessibilityLayerProps {
  onPick(zone: number): void;
  onFlag(zone: number, clientX: number, clientY: number): void;
}

interface CoveStatusCardProps {
  zone: number;
  layout: CoveLayout;
  width: number;
  phase: RoundPhase | null;
  tide: TideReportEntry | null;
  boatCount: number;
  lockedTotalMinor: number | null;
  fleet: FleetPlanPublic | null;
  struck: boolean;
  /** v3 P0-1 — tapped but not yet committed (Place Bet will commit it). */
  selected: boolean;
  canPick: boolean;
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

function ownership(fleet: FleetPlanPublic | null, zone: number) {
  if (!fleet) return null;
  if (fleet.primaryZone === zone) {
    return fleet.mode === 'SPLIT'
      ? { label: `Your bet · ${SPLIT_PRIMARY_PERCENT}%`, description: 'your main zone' }
      : { label: 'Your bet', description: 'your bet is here' };
  }
  if (fleet.mode === 'SPLIT' && fleet.secondaryZone === zone) {
    return {
      label: `Your bet · ${100 - SPLIT_PRIMARY_PERCENT}%`,
      description: 'your second zone',
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
  width,
  phase,
  tide,
  boatCount,
  lockedTotalMinor,
  fleet,
  struck,
  selected,
  canPick,
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
  const markerWidth =
    width >= 768
      ? Math.min(160, Math.max(132, width * 0.11))
      : Math.min(150, Math.max(124, width * 0.36));
  const cardDescription = [
    `${zoneName(zone)}.`,
    struck ? 'Hit by the storm.' : locked ? 'Bets locked.' : safe ? 'Safe.' : `${band} crowd.`,
    trend ? `Trend ${trend.label}.` : '',
    `${boatCount} ${boatCount === 1 ? 'player' : 'players'}.`,
    detail ? `${detail} credits.` : '',
    mine ? `${mine.description}.` : selected ? 'Selected — press Place Bet to confirm.' : 'Not selected.',
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
      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-[var(--lf-glass)] px-2.5 py-1.5 text-left text-[var(--lf-text)] shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--lf-focus)]/40 ${
        struck
          ? 'border-[var(--lf-danger)]'
          : mine
            ? 'border-[var(--lf-focus)] ring-1 ring-[var(--lf-focus)]/40'
            : selected
              ? 'border-2 border-dashed border-[var(--lf-focus)] ring-1 ring-[var(--lf-focus)]/30'
              : locked || safe
                ? 'border-[var(--lf-line)]'
                : 'border-[var(--lf-line)] hover:border-[var(--lf-focus)]/70'
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
      <span className="flex items-center gap-1.5 leading-none">
        <span className="truncate text-xs font-extrabold normal-case text-[var(--lf-text)]">
          {zoneName(zone)}
        </span>
        {(mine || selected) && (
          <span
            aria-hidden="true"
            className="ml-auto text-[11px] font-extrabold text-[var(--lf-focus)]"
          >
            ✓
          </span>
        )}
      </span>

      <span className="mt-1 flex min-w-0 items-center gap-1 text-[11px] leading-none text-[var(--lf-dim)]">
        {struck ? (
          <StormIcon size={12} aria-hidden="true" />
        ) : locked ? (
          <LockIcon size={12} aria-hidden="true" />
        ) : (
          <BoatIcon size={12} aria-hidden="true" />
        )}
        <span className={struck ? 'font-bold text-[var(--lf-danger)]' : 'font-semibold'}>
          {status}
        </span>
        {trend && !struck && !locked && (
          <span aria-label={`${trend.label} trend`} className="font-extrabold text-[var(--lf-focus)]">
            {trend.glyph}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-0.5 tabular-nums">
          {boatCount}
          <BoatIcon size={11} aria-hidden="true" />
        </span>
      </span>

      {(detail || mine) && (
        <span className="mt-1 flex items-center gap-1 border-t border-[var(--lf-line)]/70 pt-1 text-[10px] font-bold leading-none">
          <span className={mine ? 'text-[var(--lf-focus)]' : 'text-[var(--lf-dim)]'}>
            {mine?.label ?? detail}
          </span>
          {mine && detail && <span className="ml-auto tabular-nums text-[var(--lf-dim)]">{detail}</span>}
        </span>
      )}
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
  const fogActive = phase === 'ANCHOR_OPEN' && (tideReport?.frozen ?? false);
  const dialogOpen = rulesOpen || verifyRoundId !== null || flagPickerAt !== null;
  const canPick = connected && phase === 'ANCHOR_OPEN' && !finalOrderUsed && !dialogOpen;
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
            : 'Betting is open. Activate to select this zone.';

  const politeAnnouncement = !connected
    ? 'Connection lost. Reconnecting.'
    : phase === 'ANCHOR_OPEN'
      ? fogActive
        ? finalOrderUsed
          ? 'Last move accepted. Your bet is committed.'
          : 'Bets hidden. One last move remains.'
        : 'Betting open. Pick a zone. Press 1 through 6 to select.'
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
        aria-label="Zones. Use Tab or press number keys 1 through 6."
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
              width={size.width}
              phase={phase}
              tide={tide}
              boatCount={boatCount}
              lockedTotalMinor={pools?.totalsMinor[zone] ?? null}
              fleet={myFleet}
              struck={resolved && lastLandfall?.struckZone === zone}
              selected={myFleet === null && selectedZone === zone}
              canPick={canPick}
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
