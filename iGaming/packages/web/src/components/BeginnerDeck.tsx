/**
 * The beginner deck — a stake, and the one button that commits it.
 *
 * This is not a reduced fork of `ControlDeck`: that component is the advanced
 * deck and keeps every one of its D1–D5 behaviours (never-destructive primary,
 * reserved geometry, hold-to-confirm cancel, progressive unlocks). This is the
 * OTHER deck, for a player who has not yet placed a bet, and it contains
 * exactly three things:
 *
 *      − 5.00 +          what you are risking
 *      [ LOCK IN ]       the one action
 *      1 of 6 harbors…  the one sentence, only while it is still news
 *
 * It shares every rule that matters with the advanced deck, because those rules
 * are about money rather than about layout: the primary is never destructive,
 * it never changes position within a phase, the stake is clamped by the same
 * `resolveStakeLimit` the server enforces, and it is the button — never the
 * board tap — that commits.
 */
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { resolveStakeLimit } from '../stakeLimits';
import { fmt, useStore } from '../store';
import { STR, zoneName } from '../strings';
import { LockIcon } from './icons';
import type { RoundState } from '../roundMachine';
import { MUTABLE_STATES } from '../roundMachine';

/** Three presets, spanning the table. Four was already one too many to scan. */
function presetsFor(minMinor: number, maxMinor: number): number[] {
  if (!Number.isFinite(minMinor) || !Number.isFinite(maxMinor) || maxMinor <= minMinor) {
    return [Math.max(1_00, minMinor)];
  }
  const mid = Math.round(Math.sqrt(minMinor * maxMinor) / 100) * 100;
  return [...new Set([minMinor, Math.min(Math.max(mid, minMinor), maxMinor), maxMinor])].sort(
    (a, b) => a - b,
  );
}

export function BeginnerDeck({ state }: { state: RoundState }) {
  const connected = useStore((s) => s.connected);
  const myFleet = useStore((s) => s.myFleet);
  const selectedZone = useStore((s) => s.selectedZone);
  const commitBet = useStore((s) => s.commitBet);
  const stakeInputMinor = useStore((s) => s.stakeInputMinor);
  const setStakeInput = useStore((s) => s.setStakeInput);
  const orderPending = useStore((s) => s.orderPending);
  const balanceMinor = useStore((s) => s.balanceMinor);
  const minStakeMinor = useStore((s) => s.roomMinStakeMinor);
  const maxStakeMinor = useStore((s) => s.roomMaxStakeMinor);
  const whaleCapFraction = useStore((s) => s.whaleCapFraction);
  const roomLiquidityFloorMinor = useStore((s) => s.roomLiquidityFloorMinor);
  const houseSeedMinor = useStore((s) => s.round?.houseSeedMinor ?? 0);
  const rebet = useStore((s) => s.rebet);
  const lastFleet = useStore((s) => s.lastFleet);

  const deckRef = useRef<HTMLDivElement>(null);
  const [shake, setShake] = useState(false);

  // The deck's own height is published so overlays can sit clear of it — the
  // same contract the advanced deck already publishes under the same name.
  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty(
        '--lf-control-deck-height',
        `${el.offsetHeight}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const limit = resolveStakeLimit({
    balanceMinor,
    roomMinStakeMinor: minStakeMinor,
    roomMaxStakeMinor: maxStakeMinor,
    whaleCapFraction,
    liquidityFloorMinor: roomLiquidityFloorMinor,
    houseSeedMinor,
  });
  const presets = presetsFor(minStakeMinor, Math.min(maxStakeMinor, limit.maxMinor));
  const step = Math.max(1_00, minStakeMinor);
  const canStake = MUTABLE_STATES.has(state) && connected && !orderPending;

  const setStake = (minor: number) => {
    const clamped = Math.max(minStakeMinor, Math.min(minor, limit.maxMinor));
    if (clamped !== minor) {
      setShake(true);
      window.setTimeout(() => setShake(false), 260);
    }
    audio.click('tap');
    setStakeInput(clamped);
  };

  /* ---------- the primary ---------- */

  let primaryLabel: string = STR.pickZone;
  let primarySub: string | null = STR.pickZoneSub;
  let primaryAction: (() => void) | null = null;
  let primaryTone: 'action' | 'confirmed' | 'idle' = 'idle';

  if (!connected) {
    primaryLabel = STR.reconnecting;
    primarySub = null;
  } else if (state === 'IDLE') {
    primaryLabel = STR.connecting;
    primarySub = null;
  } else if (state === 'REVEAL' || state === 'IMPACT') {
    primaryLabel = STR.locked;
    primarySub = STR.lockedSub;
  } else if (state === 'RESULT' || state === 'VERIFICATION' || state === 'RESET') {
    primaryLabel = STR.nextRoundSoon;
    primarySub = null;
  } else if (orderPending) {
    primaryLabel = STR.sending;
    primarySub = null;
  } else if (state === 'FINAL_LOCK') {
    primaryLabel = STR.locked;
    primarySub = STR.hintLastMoveSet;
    primaryTone = 'confirmed';
  } else if (myFleet) {
    primaryLabel = 'LOCKED IN';
    primarySub = `${zoneName(myFleet.primaryZone)} · ${fmt(myFleet.stakeMinor)}`;
    primaryTone = 'confirmed';
  } else if (selectedZone !== null) {
    primaryLabel = 'LOCK IN';
    primarySub = `${zoneName(selectedZone)} · ${fmt(stakeInputMinor)}`;
    primaryAction = commitBet;
    primaryTone = 'action';
  } else if (lastFleet) {
    primaryLabel = STR.betAgain;
    primarySub = `${zoneName(lastFleet.primaryZone)} · ${fmt(lastFleet.stakeMinor)}`;
    primaryAction = rebet;
    primaryTone = 'action';
  }

  return (
    <div
      ref={deckRef}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 border-t border-[var(--lf-line)] bg-[var(--lf-bg-2)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
    >
      <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-2.5">
        {/* stake */}
        <div className={`flex items-stretch gap-2 ${shake ? 'lf-shake' : ''}`}>
          <button
            type="button"
            aria-label="Lower bet"
            disabled={!canStake}
            onClick={() => setStake(stakeInputMinor - step)}
            className="min-h-[48px] w-12 shrink-0 rounded-md border border-[var(--lf-line)] text-[20px] font-bold text-[var(--lf-text)] transition-colors hover:border-[var(--lf-line-2)] disabled:opacity-40"
          >
            −
          </button>

          <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-md border border-[var(--lf-line)] bg-[var(--lf-surface)] px-2 py-1">
            <span className="lf-label-soft">Your bet</span>
            <span className="lf-num text-[20px] leading-tight text-[var(--lf-text)]">
              {fmt(stakeInputMinor)}
            </span>
          </div>

          <button
            type="button"
            aria-label="Raise bet"
            disabled={!canStake}
            onClick={() => setStake(stakeInputMinor + step)}
            className="min-h-[48px] w-12 shrink-0 rounded-md border border-[var(--lf-line)] text-[20px] font-bold text-[var(--lf-text)] transition-colors hover:border-[var(--lf-line-2)] disabled:opacity-40"
          >
            +
          </button>

          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={!canStake}
              onClick={() => setStake(preset)}
              className={`min-h-[48px] min-w-[3.25rem] shrink-0 rounded-md border px-2 text-[14px] font-bold tabular-nums transition-colors disabled:opacity-40 ${
                stakeInputMinor === preset
                  ? 'border-white bg-white text-black'
                  : 'border-[var(--lf-line)] text-[var(--lf-dim)] hover:border-[var(--lf-line-2)]'
              }`}
            >
              {fmt(preset)}
            </button>
          ))}
        </div>

        {/* the one action */}
        <button
          type="button"
          disabled={primaryAction === null}
          onClick={() => {
            audio.click('down');
            primaryAction?.();
          }}
          className={`flex min-h-[60px] w-full flex-col items-center justify-center rounded-md border text-center transition-colors ${
            primaryTone === 'action'
              ? 'lf-armed border-[var(--lf-win)] bg-[var(--lf-win)] text-black'
              : primaryTone === 'confirmed'
                ? 'border-white/70 bg-[var(--lf-surface-2)] text-[var(--lf-text)]'
                : 'border-[var(--lf-line)] bg-[var(--lf-surface)] text-[var(--lf-mute)]'
          }`}
        >
          <span className="flex items-center gap-2 text-[17px] font-black uppercase tracking-[0.12em]">
            {primaryTone === 'confirmed' && <LockIcon size={15} />}
            {primaryLabel}
          </span>
          {primarySub && (
            <span
              className={`mt-0.5 text-[12px] font-semibold ${
                primaryTone === 'action' ? 'text-black/70' : 'text-[var(--lf-dim)]'
              }`}
            >
              {primarySub}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
