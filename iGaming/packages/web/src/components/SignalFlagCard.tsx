/**
 * Signal flags, as information cards.
 *
 * A signal flag is one player publicly claiming something about a harbor. It
 * is a bluffing instrument: RALLY/HOLD claim "I am here", FLEE claims "I am
 * not", and the round's replay later reveals which of them were honest. Nothing
 * about a flag is a prediction, and nothing about it touches settlement.
 *
 * Drawn as pennants on a mast at the edge of a harbor card, that was
 * unreadable — a new player saw a coloured triangle appear and had no way to
 * learn what it meant. Drawn as a card that says what happened in a sentence,
 * it is legible on the first encounter:
 *
 *      SIGNAL FLAG
 *      WESTERN CURRENT
 *      Three players signalled they are staying in the western harbors.
 *      Players talking, not a forecast.                              [ ✕ ]
 *
 * One card at a time, summarising the flags currently flying, dismissible, and
 * gone the moment the round locks.
 */
import { useEffect, useState } from 'react';
import type { SignalKind, SignalPublic } from '@landfall/core';
import { useStore } from '../store';
import { zoneName } from '../strings';
import { FleeFlagIcon, HoldFlagIcon, RallyFlagIcon, XIcon } from './icons';
import type { RoundState } from '../roundMachine';
import { MUTABLE_STATES } from '../roundMachine';

/** West column is harbors 1·3·5, east is 2·4·6 — same geometry as the board. */
const WEST = new Set([0, 2, 4]);

interface FlagSummary {
  kind: SignalKind;
  title: string;
  body: string;
  count: number;
}

/**
 * Reduce the flags flying into the one worth a card: the kind with the most
 * flags behind it. Ties go to the most recently added kind in the array, which
 * is the server's publication order.
 */
export function summariseSignals(
  signals: readonly SignalPublic[],
  myName: string | null,
): FlagSummary | null {
  const others = signals.filter((s) => s.name !== myName);
  if (others.length === 0) return null;

  const byKind = new Map<SignalKind, SignalPublic[]>();
  for (const signal of others) {
    const list = byKind.get(signal.kind) ?? [];
    list.push(signal);
    byKind.set(signal.kind, list);
  }
  let best: [SignalKind, SignalPublic[]] | null = null;
  for (const entry of byKind) {
    if (best === null || entry[1].length >= best[1].length) best = entry;
  }
  if (best === null) return null;

  const [kind, list] = best;
  const zones = [...new Set(list.map((s) => s.zone))];
  const allWest = zones.every((z) => WEST.has(z));
  const allEast = zones.every((z) => !WEST.has(z));
  const side = allWest ? 'western' : allEast ? 'eastern' : null;
  const where =
    zones.length === 1
      ? zoneName(zones[0]!)
      : side
        ? `the ${side} harbors`
        : `${zones.length} harbors`;

  const people = `${list.length} player${list.length === 1 ? '' : 's'}`;
  const title = side
    ? `${side === 'western' ? 'Western' : 'Eastern'} current`
    : zones.length === 1
      ? `${zoneName(zones[0]!)} signal`
      : 'Scattered signals';

  const body =
    kind === 'RALLY'
      ? `${people} called others to ${where}.`
      : kind === 'FLEE'
        ? `${people} signalled they are avoiding ${where}.`
        : `${people} signalled they are staying in ${where}.`;

  return { kind, title, body, count: list.length };
}

const ICON = {
  RALLY: RallyFlagIcon,
  FLEE: FleeFlagIcon,
  HOLD: HoldFlagIcon,
} as const;

export function SignalFlagCard({ state }: { state: RoundState }) {
  const signals = useStore((s) => s.signals);
  const myName = useStore((s) => s.name);
  const roundId = useStore((s) => s.round?.roundId);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => setDismissed(false), [roundId]);

  const summary = summariseSignals(signals, myName);
  if (dismissed || !summary || !MUTABLE_STATES.has(state)) return null;

  const Icon = ICON[summary.kind];

  return (
    <aside
      role="status"
      className="lf-appear pointer-events-none flex w-[min(92vw,20rem)] items-start gap-2.5 rounded-md border border-[var(--lf-line-2)] bg-[var(--lf-surface)] px-3 py-2.5"
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--lf-dim)]">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="lf-label-soft">Signal flag</div>
        <div className="mt-0.5 text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--lf-text)]">
          {summary.title}
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-[var(--lf-dim)]">{summary.body}</p>
        <p className="mt-1 text-[11px] leading-snug text-[var(--lf-mute)]">
          Players talking — not a forecast. Some of them are bluffing, and the replay says who.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss signal flag"
        className="pointer-events-auto -mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center text-[var(--lf-mute)] transition-colors hover:text-[var(--lf-text)]"
      >
        <XIcon size={14} />
      </button>
    </aside>
  );
}
