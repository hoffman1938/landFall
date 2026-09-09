/**
 * FINAL ORDER — two controls, and then nothing.
 *
 * The Blind Fog rule has always been: while bets are hidden, every player gets
 * exactly one more action, and spending it is the end of their round. That is a
 * genuinely good mechanic that until now had no interface — the player was
 * expected to infer it from a frozen tide report, a halo on their token, and a
 * deck button that had quietly become unpressable.
 *
 * So: state it. Two large controls, one sentence, a countdown, and then the
 * word LOCKED. KEEP is not a no-op dressed as a button — pressing it spends
 * nothing and commits the player to what they already have, which is the
 * decision they are actually being asked to make. CHANGE reopens harbor
 * selection for the one order the server will accept.
 *
 * Nothing here can take an action the server would refuse: the same
 * `finalOrderUsed` flag the coordinator enforces gates both controls, and the
 * bar renders LOCKED the instant that flag is set.
 */
import { useEffect, useState } from 'react';
import { audio } from '../audio/engine';
import { useStore } from '../store';
import { zoneName } from '../strings';
import type { RoundState } from '../roundMachine';

export function FinalOrderBar({ state }: { state: RoundState }) {
  const myFleet = useStore((s) => s.myFleet);
  const finalOrderUsed = useStore((s) => s.finalOrderUsed);
  const phaseEndsAt = useStore((s) => s.phase?.endsAt ?? 0);
  /** null = undecided, 'keep' = committed to what is there, 'change' = picking. */
  const [choice, setChoice] = useState<'keep' | 'change' | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const roundId = useStore((s) => s.round?.roundId);
  useEffect(() => setChoice(null), [roundId]);

  const live = state === 'FINAL_ORDER';
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [live]);

  if (state !== 'FINAL_ORDER' && state !== 'FINAL_LOCK') return null;

  const sealed = state === 'FINAL_LOCK' || finalOrderUsed;
  const seconds = Math.max(0, Math.ceil((phaseEndsAt - now) / 1000));

  if (sealed) {
    return (
      <div
        role="status"
        className="lf-appear pointer-events-none flex w-[min(92vw,26rem)] flex-col items-center gap-1 rounded-lg border border-[var(--lf-line-2)] bg-[var(--lf-surface)] px-5 py-3 text-center"
      >
        <span className="lf-display text-[clamp(1.5rem,5vmin,2rem)] leading-none text-[var(--lf-text)]">
          LOCKED
        </span>
        <span className="text-[13px] text-[var(--lf-dim)]">
          {myFleet
            ? `${zoneName(myFleet.primaryZone)} is committed. The storm is choosing.`
            : 'Bets are closed for this round.'}
        </span>
      </div>
    );
  }

  // No bet on the board: there is no "keep", only a last chance to join.
  if (!myFleet) {
    return (
      <div
        role="status"
        className="lf-appear lf-overlay pointer-events-none w-[min(92vw,26rem)] rounded-lg px-5 py-3 text-center"
      >
        <div className="lf-label">Final order</div>
        <p className="mt-1.5 text-[14px] font-semibold text-[var(--lf-text)]">
          Last chance to pick a harbor — {seconds}s
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="Final order"
      className="lf-appear lf-overlay pointer-events-auto w-[min(92vw,26rem)] rounded-lg px-4 py-3"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="lf-label">Final order</h2>
        <span
          className="lf-num text-[15px] text-[var(--lf-warn)]"
          aria-label={`${seconds} seconds left`}
        >
          {seconds}s
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          aria-pressed={choice === 'keep'}
          onClick={() => {
            // KEEP sends nothing: the bet is already with the server, and the
            // one hidden order stays unspent. It exists because "do nothing" is
            // a decision the player deserves to make on purpose rather than by
            // running out of clock.
            audio.click('tap');
            setChoice('keep');
          }}
          className={`flex min-h-[64px] flex-col items-center justify-center rounded-md border px-3 text-center transition-colors ${
            choice === 'keep'
              ? 'border-white bg-white text-black'
              : 'border-[var(--lf-line-2)] bg-[var(--lf-surface-2)] text-[var(--lf-text)] hover:border-white'
          }`}
        >
          <span className="text-[15px] font-black uppercase tracking-[0.1em]">Keep</span>
          <span
            className={`mt-0.5 text-[12px] font-semibold ${
              choice === 'keep' ? 'text-black/70' : 'text-[var(--lf-dim)]'
            }`}
          >
            {zoneName(myFleet.primaryZone)}
          </span>
        </button>

        <button
          type="button"
          aria-pressed={choice === 'change'}
          onClick={() => {
            // CHANGE arms the board rather than sending anything itself. The
            // move IS the order, so the player has to name the harbor — and
            // tapping one is already the path the server accepts as the round's
            // single hidden action.
            audio.click('tap');
            setChoice('change');
          }}
          className={`flex min-h-[64px] flex-col items-center justify-center rounded-md border px-3 text-center transition-colors ${
            choice === 'change'
              ? 'border-[var(--lf-warn)] text-[var(--lf-warn)]'
              : 'border-[var(--lf-line-2)] bg-[var(--lf-surface-2)] text-[var(--lf-text)] hover:border-white'
          }`}
        >
          <span className="text-[15px] font-black uppercase tracking-[0.1em]">Change</span>
          <span className="mt-0.5 text-[12px] font-semibold text-[var(--lf-dim)]">
            Pick another harbor
          </span>
        </button>
      </div>

      <p
        role={choice === 'change' ? 'status' : undefined}
        className="mt-2 text-center text-[12px] leading-snug text-[var(--lf-mute)]"
      >
        {choice === 'keep'
          ? 'Kept. Nothing more to do this round.'
          : choice === 'change'
            ? 'Tap a harbor on the board — that move ends your round.'
            : 'One change only, and it ends your round either way.'}
      </p>
    </section>
  );
}
