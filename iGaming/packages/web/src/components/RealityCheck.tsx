/**
 * Reality check (remediation F1) — every N minutes (player-chosen): net
 * position + elapsed time. Calm styling by design law: neutral surfaces,
 * NEVER amber (amber is payout-only), no sound, fully dismissible.
 */
import { audio } from '../audio/engine';
import { fmt, useStore } from '../store';
import { TimerIcon } from './icons';

export function RealityCheck() {
  const realityCheck = useStore((s) => s.realityCheck);
  const dismissRealityCheck = useStore((s) => s.dismissRealityCheck);
  const setLimitsOpen = useStore((s) => s.setLimitsOpen);

  if (!realityCheck) return null;
  const { elapsedMinutes, sessionNetMinor } = realityCheck;
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  const elapsedLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reality check"
        className="lf-rise lf-surface w-full max-w-sm rounded-2xl p-5"
      >
        <div className="flex items-center gap-2 text-[var(--lf-dim)]">
          <TimerIcon size={18} />
          <h2 className="text-sm font-extrabold tracking-wide text-[var(--lf-text)]">
            REALITY CHECK
          </h2>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/60 px-3 py-2">
            <dt className="text-[11px] font-semibold text-[var(--lf-dim)]">Time at sea</dt>
            <dd className="text-lg font-extrabold tabular-nums text-[var(--lf-text)]">
              {elapsedLabel}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/60 px-3 py-2">
            <dt className="text-[11px] font-semibold text-[var(--lf-dim)]">Session net</dt>
            <dd className="text-lg font-extrabold tabular-nums text-[var(--lf-text)]">
              {sessionNetMinor >= 0 ? '+' : '−'}
              {fmt(Math.abs(sessionNetMinor))}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-sm leading-snug text-[var(--lf-dim)]">
          You asked to see this every so often. Keep sailing, take a break, or adjust your
          limits — your call.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              audio.click('nav');
              dismissRealityCheck();
              setLimitsOpen(true);
            }}
            className="min-h-11 flex-1 rounded-xl border border-[var(--lf-line)] px-3 text-sm font-bold text-[var(--lf-dim)] hover:border-[var(--lf-dim)] hover:text-[var(--lf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
          >
            Adjust limits
          </button>
          <button
            type="button"
            onClick={() => {
              audio.click('nav');
              dismissRealityCheck();
            }}
            className="min-h-11 flex-1 rounded-xl bg-[var(--lf-surface-2)] px-3 text-sm font-extrabold text-[var(--lf-text)] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
