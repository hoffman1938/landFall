/**
 * Table intro (v3) — a brief, plain-words card that appears whenever the player
 * enters or switches a table, so the two limits are clear immediately:
 *   1. your bet range for this table (min–max is YOUR bet, not the round total);
 *   2. the 25% round-share cap (why your live max can be lower than the table max).
 *
 * It auto-dismisses, is dismissible by tap, and shows once per table entry.
 * No mechanics change — this is explanation only.
 */
import { useEffect, useRef, useState } from 'react';
import { fmt, useStore } from '../store';
import { SurgeIcon, XIcon } from './icons';

interface Intro {
  name: string;
  minMinor: number;
  maxMinor: number;
}

const AUTO_DISMISS_MS = 11_000;

export function TableIntro() {
  const roomId = useStore((s) => s.roomId);
  const welcomeOpen = useStore((s) => s.welcomeOpen);
  const welcomeChoseRoomId = useStore((s) => s.welcomeChoseRoomId);
  const [intro, setIntro] = useState<Intro | null>(null);
  const shownRoom = useRef<string | null>(null);

  useEffect(() => {
    // The entry gate names the table, its bet range and the round-share cap on
    // the way in, so that table needs no second introduction — including when
    // the player used the gate to switch away from the default. Marking it as
    // shown (rather than merely skipping) keeps it from firing a beat later.
    if (welcomeOpen || (roomId !== null && roomId === welcomeChoseRoomId)) {
      shownRoom.current = roomId;
      return;
    }
    if (!roomId || shownRoom.current === roomId) return;
    shownRoom.current = roomId;
    // Read the freshest room facts; WELCOME/JOIN_ROOM set them together.
    const s = useStore.getState();
    const name = s.rooms.find((r) => r.roomId === roomId)?.name ?? 'this table';
    setIntro({ name, minMinor: s.roomMinStakeMinor, maxMinor: s.roomMaxStakeMinor });
    const t = window.setTimeout(() => setIntro(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [roomId, welcomeOpen, welcomeChoseRoomId]);

  if (!intro) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3"
      role="status"
      aria-live="polite"
    >
      <div className="lf-rise lf-glass lf-rim pointer-events-auto relative w-full max-w-md rounded-2xl px-4 py-3">
        <button
          type="button"
          onClick={() => setIntro(null)}
          className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full text-[var(--lf-dim)] hover:text-[var(--lf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
          aria-label="Dismiss table info"
        >
          <XIcon size={15} />
        </button>

        <p className="pr-6 text-base font-black uppercase tracking-[0.06em] text-[var(--lf-brass)]">
          Welcome to {intro.name}
        </p>

        <ul className="mt-1.5 space-y-1.5 text-[13px] leading-snug text-[var(--lf-dim)]">
          <li className="flex gap-2">
            <span aria-hidden="true" className="font-black text-[var(--lf-focus)]">
              •
            </span>
            <span>
              <b className="text-[var(--lf-text)]">Your bet: {fmt(intro.minMinor)}–{fmt(intro.maxMinor)}</b>{' '}
              credits each round — that's your own stake, not everyone's total.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="font-black text-[var(--lf-focus)]">
              •
            </span>
            <span>
              No player can hold more than <b className="text-[var(--lf-text)]">25% of a round</b>,
              so your live max can be lower when the table is quiet.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-[var(--lf-amber)]">
              <SurgeIcon size={14} />
            </span>
            <span>Every round feeds the jackpot — one safe player wins it on a bonus round.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
