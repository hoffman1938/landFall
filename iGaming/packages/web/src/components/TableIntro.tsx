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
import { resolveStakeLimit } from '../stakeLimits';
import { fmt, stakeLimitInput, useStore } from '../store';
import { SurgeIcon, XIcon } from './icons';

interface Intro {
  name: string;
  minMinor: number;
  maxMinor: number;
  /**
   * What this table will actually accept right now, or null when the cap is not
   * yet knowable or is not biting — in which case the card explains the rule
   * without quoting a figure that is about to change.
   */
  liveMaxMinor: number | null;
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
    /*
     * The same limit the deck and the rail show. Quote the figure only when it
     * actually binds — on a busy table the tier maximum is the real ceiling and
     * a second number would just be noise.
     */
    const liveMaxMinor = resolveStakeLimit(stakeLimitInput(s)).maxMinor;
    setIntro({
      name,
      minMinor: s.roomMinStakeMinor,
      maxMinor: s.roomMaxStakeMinor,
      liveMaxMinor: liveMaxMinor < s.roomMaxStakeMinor ? liveMaxMinor : null,
    });
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
      <div className="lf-rise lf-overlay pointer-events-auto relative w-full max-w-md rounded-lg px-4 py-3">
        <button
          type="button"
          onClick={() => setIntro(null)}
          className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-[var(--lf-dim)] hover:text-[var(--lf-text)]"
          aria-label="Dismiss table info"
        >
          <XIcon size={15} />
        </button>

        <p className="pr-6 text-[15px] font-black uppercase tracking-[0.12em] text-[var(--lf-text)]">
          {intro.name}
        </p>

        <ul className="mt-2 space-y-1.5 text-[12px] leading-snug text-[var(--lf-dim)]">
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
            {/*
             * The tier range above is what the table is FOR. This is what it
             * will take from you right now, which on a quiet table is a much
             * smaller number — and the deck shows it live as "Max now". Saying
             * it here, on the way in, is the difference between a rule and an
             * unexplained rejection ten seconds later.
             */}
            <span>
              {intro.liveMaxMinor === null ? (
                <>While the table is quiet your bet is capped below that maximum</>
              ) : (
                <>
                  While the table is quiet your bet is capped at{' '}
                  <b className="text-[var(--lf-warn)]">{fmt(intro.liveMaxMinor)}</b>
                </>
              )}{' '}
              — payouts come out of the hit zone's pot, so there is little for a bigger bet to win.
              The deck shows the live number as <b className="text-[var(--lf-text)]">Max now</b>,
              and it rises as players join.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-[var(--lf-amber)]">
              <SurgeIcon size={14} />
            </span>
            <span>
              This table has <b className="text-[var(--lf-text)]">its own jackpot</b>, built only
              from rounds played here. One safe player wins it on a jackpot round — the bigger
              your bet, the better your chance.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
