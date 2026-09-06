/**
 * Wreck Log sheet (remediation E2) — the last ~20 rounds as Wreck Wake Replay
 * cards: fog movement arrows, struck cove value, biggest salvage, flag honesty
 * reveals, and a local save-as-image action (canvas render, no external
 * service). Built from public round data only. History players expect, paired
 * with verification — never a pattern oracle.
 */
import { useEffect } from 'react';
import { audio } from '../audio/engine';
import { fmt, useStore, type ReplayCard } from '../store';
import { STR, zoneName } from '../strings';
import { downloadReplayCard } from '../replayCardImage';
import { CrateIcon, ShieldCheckIcon, StormIcon, SurgeIcon, XIcon } from './icons';

function ReplayCardView({ card }: { card: ReplayCard }) {
  const openVerify = useStore((s) => s.openVerify);
  const moves = (card.replay.fogNetBoats ?? [])
    .map((net, zone) => ({ net, zone }))
    .filter(({ net }) => net !== 0);
  const reveals = card.replay.flagReveals ?? [];
  const mult = card.stormPower ? card.stormPower.mNum / card.stormPower.mDen : 1;

  return (
    <li className="rounded-md border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/50 p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-extrabold tabular-nums text-[var(--lf-dim)]">
          #{card.roundId}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--lf-text)]">
          {card.replay.headline}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1 font-extrabold text-[var(--lf-accent)]">
          <StormIcon size={12} />
          {zoneName(card.struckZone)} hit
        </span>
        <span className="tabular-nums text-[var(--lf-dim)]">
          wreck {fmt(card.replay.struckPoolMinor)}
        </span>
        {mult >= 2 ? (
          <span className="flex items-center gap-1 font-extrabold text-[var(--lf-amber)]">
            <StormIcon size={12} />
            {card.stormPower!.label} ×{mult}
            {card.powerCapped ? ' (capped)' : ''}
          </span>
        ) : null}
      </div>

      {/* Net fog movement arrows — color + shape + count, never color alone. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
        <span className="font-semibold text-[var(--lf-dim)]">Fog:</span>
        {moves.length === 0 ? (
          <span className="text-[var(--lf-dim)]">held steady</span>
        ) : (
          moves.map(({ net, zone }) => (
            <span
              key={zone}
              className={`font-extrabold ${net > 0 ? 'text-[var(--lf-safe)]' : 'text-[var(--lf-danger)]'}`}
            >
              {net > 0 ? '▲' : '▼'}
              {Math.abs(net)} Z{zone + 1}
            </span>
          ))
        )}
      </div>

      {card.replay.biggestSalvage ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--lf-win)]">
          <CrateIcon size={12} />
          {card.replay.biggestSalvage.name} salvaged +{fmt(card.replay.biggestSalvage.amountMinor)}
        </div>
      ) : null}
      {card.surge ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--lf-amber)]">
          <SurgeIcon size={12} />
          {card.surge.winnerName
            ? `Golden Anchor: ${card.surge.winnerName} +${fmt(card.surge.potMinor)}`
            : `Golden Anchor pot rolled over (${fmt(card.surge.potMinor)})`}
        </div>
      ) : null}

      {reveals.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {reveals.map((flag, index) => (
            <li
              key={`${flag.name}-${index}`}
              className={`text-xs font-semibold ${flag.honest ? 'text-[var(--lf-safe)]' : 'text-[var(--lf-danger)]'}`}
            >
              {flag.honest ? '✓ honest' : '✗ bluff'} — {flag.name}: {flag.kind} Z{flag.zone + 1}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => {
            audio.click('tap');
            void downloadReplayCard(card);
          }}
          className="min-h-11 flex-1 rounded-lg border border-[var(--lf-line)] px-2 text-xs font-extrabold text-[var(--lf-dim)] hover:border-[var(--lf-dim)] hover:text-[var(--lf-text)]"
        >
          Save image
        </button>
        <button
          type="button"
          onClick={() => {
            audio.click('nav');
            openVerify(card.roundId);
          }}
          className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-[var(--lf-line)] px-3 text-xs font-extrabold text-[var(--lf-dim)] hover:border-[var(--lf-dim)] hover:text-[var(--lf-text)]"
        >
          <ShieldCheckIcon size={12} />
          Verify
        </button>
      </div>
    </li>
  );
}

export function WreckLogSheet() {
  const wreckLogOpen = useStore((s) => s.wreckLogOpen);
  const setWreckLogOpen = useStore((s) => s.setWreckLogOpen);
  const replayCards = useStore((s) => s.replayCards);

  useEffect(() => {
    if (!wreckLogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWreckLogOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [wreckLogOpen, setWreckLogOpen]);

  if (!wreckLogOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setWreckLogOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Round history"
        className="lf-sheet lf-overlay flex max-h-[86dvh] w-full max-w-md flex-col rounded-lg"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--lf-line)] px-4 py-3">
          <StormIcon size={18} />
          <h2 className="lf-label !text-[var(--lf-dim)]">{STR.history}</h2>
          <span className="text-[11px] font-semibold text-[var(--lf-mute)]">
            last {replayCards.length} round{replayCards.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => {
              audio.click('nav');
              setWreckLogOpen(false);
            }}
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-md text-[var(--lf-dim)] hover:bg-[var(--lf-panel)] hover:text-[var(--lf-text)]"
            aria-label="Close round history"
          >
            <XIcon size={18} />
          </button>
        </div>

        {replayCards.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--lf-dim)]">
            Replay cards appear here after each landfall you witness.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {[...replayCards].reverse().map((card) => (
              <ReplayCardView key={card.roundId} card={card} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
