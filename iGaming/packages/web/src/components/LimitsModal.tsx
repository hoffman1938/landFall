/**
 * Play limits & session sheet (remediation F1/F2). Everything here is
 * SERVER-enforced — this UI only asks; the coordinator's accept path holds
 * the line. Setting/tightening a limit is instant; loosening one queues
 * behind the 24h cooldown (shown as "pending"). Self-exclusion only extends.
 * Demo build: credits are play money, but the plumbing is the real one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '../useDialog';
import type { LimitsPending } from '@landfall/core';
import { audio } from '../audio/engine';
import { fmt, useStore } from '../store';
import { TimerIcon, XIcon } from './icons';

const FIELD_LABELS: Record<LimitsPending['field'], string> = {
  sessionLossLimitMinor: 'Session loss limit',
  dailyLossLimitMinor: 'Daily loss limit',
  stakePerRoundCapMinor: 'Stake per round',
};

function LimitRow({
  label,
  hint,
  valueMinor,
  onSet,
}: {
  label: string;
  hint: string;
  valueMinor: number | null;
  onSet: (minor: number | null) => void;
}) {
  const [draft, setDraft] = useState('');

  return (
    <div className="rounded-md border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/50 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-[var(--lf-text)]">{label}</span>
        <span className="text-sm font-extrabold tabular-nums text-[var(--lf-text)]">
          {valueMinor !== null ? `${fmt(valueMinor)} cr` : 'off'}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-[var(--lf-dim)]">{hint}</p>
      <div className="mt-2 flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="credits"
          aria-label={`${label} in credits`}
          className="min-h-11 w-24 min-w-0 flex-1 rounded-lg border border-[var(--lf-line)] bg-[var(--lf-bg)] px-2 text-sm tabular-nums outline-none placeholder:text-[var(--lf-dim)] focus:border-[var(--lf-focus)]"
        />
        <button
          type="button"
          disabled={!(Number(draft) > 0)}
          onClick={() => {
            audio.click('tap');
            onSet(Math.round(Number(draft) * 100));
            setDraft('');
          }}
          className="min-h-11 rounded-lg bg-[var(--lf-focus)] px-3 text-sm font-extrabold text-black hover:brightness-110 disabled:cursor-not-allowed disabled:bg-[var(--lf-panel)] disabled:text-[var(--lf-dim)]"
        >
          Set
        </button>
        <button
          type="button"
          disabled={valueMinor === null}
          onClick={() => {
            audio.click('tap');
            onSet(null);
          }}
          className="min-h-11 rounded-lg border border-[var(--lf-line)] px-3 text-sm font-bold text-[var(--lf-dim)] hover:border-[var(--lf-dim)] hover:text-[var(--lf-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export function LimitsModal() {
  const limitsOpen = useStore((s) => s.limitsOpen);
  const setLimitsOpen = useStore((s) => s.setLimitsOpen);
  const limits = useStore((s) => s.limits);
  const sessionStartAt = useStore((s) => s.sessionStartAt);
  const sendLimits = useStore((s) => s.sendLimits);
  const sendExclusion = useStore((s) => s.sendExclusion);
  const [now, setNow] = useState(Date.now());
  const [confirmExclusion, setConfirmExclusion] = useState<number | null>(null);

  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setLimitsOpen(false), [setLimitsOpen]);
  useDialog({ open: limitsOpen, onClose: close, initialFocus: closeRef });

  useEffect(() => {
    if (!limitsOpen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [limitsOpen]);

  useEffect(() => {
    if (!limitsOpen) setConfirmExclusion(null);
  }, [limitsOpen]);

  if (!limitsOpen) return null;

  const sessionMs = sessionStartAt !== null ? Math.max(0, now - sessionStartAt) : 0;
  const sessionClock = new Date(sessionMs).toISOString().slice(11, 19);
  const excluded = limits?.excludedUntil != null && limits.excludedUntil > now;

  return (
    <div
      className="fixed inset-0 z-[var(--lf-z-modal)] flex items-center justify-center bg-black/80 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setLimitsOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Play limits and session"
        className="lf-sheet lf-overlay flex max-h-[86dvh] w-full max-w-md flex-col rounded-lg"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--lf-line)] px-4 py-3">
          <TimerIcon size={18} />
          <h2 className="text-sm font-black uppercase tracking-[0.1em] text-[var(--lf-mute)]">
            PLAY LIMITS & SESSION
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => {
              audio.click('nav');
              setLimitsOpen(false);
            }}
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-md text-[var(--lf-dim)] hover:bg-[var(--lf-panel)] hover:text-[var(--lf-text)]"
            aria-label="Close play limits"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {/* Session clock (F2) — always visible, always honest. */}
          <div className="flex items-center justify-between rounded-md border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/50 px-3 py-2.5">
            <span className="text-sm font-bold text-[var(--lf-text)]">This session</span>
            <span className="text-lg font-extrabold tabular-nums text-[var(--lf-text)]">
              {sessionClock}
            </span>
          </div>

          {excluded ? (
            <div
              role="status"
              className="rounded-md border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/70 px-3 py-2.5 text-sm text-[var(--lf-text)]"
            >
              You're on a break until{' '}
              <strong>{new Date(limits.excludedUntil!).toLocaleString()}</strong>. Watching is fine;
              betting is off.
            </div>
          ) : null}

          <LimitRow
            label="Session loss limit"
            hint="Betting stops once this session is down by this much. Resets next session."
            valueMinor={limits?.sessionLossLimitMinor ?? null}
            onSet={(minor) => sendLimits({ sessionLossLimitMinor: minor })}
          />
          <LimitRow
            label="Daily loss limit"
            hint="Betting stops once today (UTC) is down by this much."
            valueMinor={limits?.dailyLossLimitMinor ?? null}
            onSet={(minor) => sendLimits({ dailyLossLimitMinor: minor })}
          />
          <LimitRow
            label="Stake per round"
            hint="A personal ceiling under the table's — checked before every bet."
            valueMinor={limits?.stakePerRoundCapMinor ?? null}
            onSet={(minor) => sendLimits({ stakePerRoundCapMinor: minor })}
          />

          {/* Reality check cadence (F1). */}
          <div className="rounded-md border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/50 p-3">
            <label htmlFor="lf-reality-cadence" className="text-sm font-bold text-[var(--lf-text)]">
              Reality check
            </label>
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--lf-dim)]">
              A calm time-and-net summary, every…
            </p>
            <select
              id="lf-reality-cadence"
              value={limits?.realityCheckMinutes ?? 0}
              onChange={(event) => {
                audio.click('tap');
                const minutes = Number(event.target.value);
                sendLimits({ realityCheckMinutes: minutes > 0 ? minutes : null });
              }}
              className="mt-2 min-h-11 w-full rounded-md border border-[var(--lf-line)] bg-[var(--lf-bg)] pl-3 pr-9 text-sm font-semibold text-[var(--lf-text)]"
            >
              <option value={0}>Off</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </div>

          {/* Pending loosenings (F1): honesty about the 24h cooldown. */}
          {limits && limits.pending.length > 0 ? (
            <div className="rounded-md border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/50 p-3">
              <span className="text-sm font-bold text-[var(--lf-text)]">Pending changes</span>
              <ul className="mt-1 space-y-1">
                {limits.pending.map((p) => (
                  <li key={p.field} className="text-[11px] leading-snug text-[var(--lf-dim)]">
                    {FIELD_LABELS[p.field]} → {p.value !== null ? `${fmt(p.value)} cr` : 'off'} ·
                    applies {new Date(p.effectiveAt).toLocaleString()} (raises wait 24h)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Self-exclusion (F2, demo-grade lockout — only ever extends). */}
          <div className="rounded-md border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/50 p-3">
            <span className="text-sm font-bold text-[var(--lf-text)]">Take a break</span>
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--lf-dim)]">
              Locks betting for the chosen time. It cannot be shortened once set.
            </p>
            <div className="mt-2 flex gap-2">
              {[
                { label: '1 hour', minutes: 60 },
                { label: '24 hours', minutes: 24 * 60 },
                { label: '7 days', minutes: 7 * 24 * 60 },
              ].map(({ label, minutes }) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => {
                    audio.click('tap');
                    if (confirmExclusion === minutes) {
                      sendExclusion(minutes);
                      setConfirmExclusion(null);
                    } else {
                      setConfirmExclusion(minutes);
                    }
                  }}
                  className={`min-h-11 flex-1 rounded-lg border px-2 text-xs font-extrabold ${
                    confirmExclusion === minutes
                      ? 'border-[var(--lf-danger)] bg-[var(--lf-danger)]/15 text-[var(--lf-text)]'
                      : 'border-[var(--lf-line)] text-[var(--lf-dim)] hover:border-[var(--lf-dim)] hover:text-[var(--lf-text)]'
                  }`}
                >
                  {confirmExclusion === minutes ? 'Tap to confirm' : label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] leading-snug text-[var(--lf-dim)]">
            Limits are enforced by the server, not this screen. Tightening applies instantly;
            raising or clearing waits 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
}
