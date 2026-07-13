/**
 * Persistent bottom control deck — always-visible stake input, quick presets,
 * Focus/Split segmented control, and one contextual primary action button.
 *
 * Remediated per D1/D2/D3/D4:
 *  - the primary button is NEVER destructive; its full state machine lives in
 *    ../deckState.ts (see the state table there — every state is unit-tested);
 *  - cancel is only the small ✕, hold-to-confirm during Blind Fog;
 *  - RESTAKE is an explicit secondary in a reserved slot (deck geometry never
 *    changes within a phase);
 *  - all interactive targets ≥ 44px, interactive text ≥ 14px, primary ≥ 16px
 *    (audit table: docs/09-remediation/d2-accessibility-audit.md);
 *  - the payout expectation strip derives from the PUBLIC tide report only and
 *    freezes with it;
 *  - disclosure is progressive (D5, ../deckProgress.ts): a fresh profile sees
 *    stepper + presets + primary only; Focus/Split, flags and ×2/½/MAX unlock
 *    per the schedule there. Experts are never re-gated.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FLAG_MAX_PER_WINDOW,
  FLAG_WINDOW_ROUNDS,
  RAKE,
  SPLIT_PRIMARY_PERCENT,
  payoutExpectationGains,
} from '@landfall/core';
import { audio } from '../audio/engine';
import { STR, zoneName } from '../strings';
import {
  MODE_UNLOCK_ROUNDS,
  getDeckProgress,
  resolveDisclosure,
  updateDeckProgress,
  useDeckProgress,
  withModesUnlockedByTap,
  withRivalFlagSeen,
  withRoundCompleted,
  withStakeEdited,
} from '../deckProgress';
import { formatPayoutStrip, resolveDeckState, type PrimaryId } from '../deckState';
import { fmt, useStore } from '../store';
import {
  BoatIcon,
  RallyFlagIcon,
  FleeFlagIcon,
  HoldFlagIcon,
  LockIcon,
  SplitBoatsIcon,
  StormIcon,
  XIcon,
} from './icons';

/**
 * v3 — stake presets are DYNAMIC: derived from THIS table's min/max, not a fixed
 * list. A fixed [1,2,5,10] is useless in a 5–500 or 50–5000 room (below the
 * minimum). We span the table's range with up to four "nice" 1-2-5 values,
 * always anchored by the table minimum and maximum, so every chip is a bet you
 * can actually place.
 */
function niceStakePresets(minMinor: number, maxMinor: number): number[] {
  if (!Number.isFinite(minMinor) || !Number.isFinite(maxMinor) || maxMinor <= minMinor) {
    return [Math.max(1_00, minMinor)];
  }
  // 1-2-5 ladder strictly inside the range
  const ladder: number[] = [];
  for (let mag = 1_00; mag <= maxMinor; mag *= 10) {
    for (const m of [1, 2, 5]) {
      const v = m * mag;
      if (v > minMinor && v < maxMinor) ladder.push(v);
    }
  }
  const nearest = (target: number) =>
    ladder.length
      ? ladder.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
      : target;
  // two interior values at geometric thirds of [min, max]
  const ratio = maxMinor / minMinor;
  const mid1 = nearest(minMinor * ratio ** (1 / 3));
  const mid2 = nearest(minMinor * ratio ** (2 / 3));
  const set = new Set<number>([minMinor, mid1, mid2, maxMinor]);
  return [...set].sort((a, b) => a - b);
}

/** A "nice" nudge step for ± scaled to the table (one table-minimum unit). */
function stepFor(minMinor: number): number {
  return Math.max(1_00, minMinor);
}

/** Hold duration for the fog-cancel confirm affordance. */
const CANCEL_HOLD_MS = 650;

function coveName(zone: number): string {
  return zoneName(zone);
}

function presetLabel(minor: number): string {
  const units = minor / 100;
  if (units >= 1000) {
    const k = units / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(units);
}

export function ControlDeck() {
  const connected = useStore((s) => s.connected);
  const phase = useStore((s) => s.phase);
  const stakeInputMinor = useStore((s) => s.stakeInputMinor);
  const setStakeInput = useStore((s) => s.setStakeInput);
  const myFleet = useStore((s) => s.myFleet);
  const selectedZone = useStore((s) => s.selectedZone);
  const commitBet = useStore((s) => s.commitBet);
  const fleetMode = useStore((s) => s.fleetMode);
  const setFleetMode = useStore((s) => s.setFleetMode);
  const finalOrderUsed = useStore((s) => s.finalOrderUsed);
  const orderPending = useStore((s) => s.orderPending);
  const balanceMinor = useStore((s) => s.balanceMinor);
  const lastFleet = useStore((s) => s.lastFleet);
  const tideReport = useStore((s) => s.tideReport);
  const rebet = useStore((s) => s.rebet);
  const cancelOrder = useStore((s) => s.cancelOrder);
  const doubleStake = useStore((s) => s.doubleStake);
  const sendSignal = useStore((s) => s.sendSignal);
  const flagPickerAt = useStore((s) => s.flagPickerAt);
  const openFlagPicker = useStore((s) => s.openFlagPicker);
  const closeFlagPicker = useStore((s) => s.closeFlagPicker);
  const toast = useStore((s) => s.toast);
  // Room tier limits (C2) — the clamp speaks in this room's numbers.
  const minStakeMinor = useStore((s) => s.roomMinStakeMinor);
  const maxStakeMinor = useStore((s) => s.roomMaxStakeMinor);
  // B5 whale-cap inputs — so MAX and presets reflect what you can ACTUALLY bet.
  const whaleCapFraction = useStore((s) => s.whaleCapFraction);
  const lastKnownHandleMinor = useStore((s) => s.lastKnownHandleMinor);
  // B4 flag cooldown mirror: dimmed flag + round counter, no prose.
  const myFlagRounds = useStore((s) => s.myFlagRounds);
  const roundId = useStore((s) => s.round?.roundId);
  // D5 progressive disclosure inputs.
  const landfallRoundId = useStore((s) => s.lastLandfall?.roundId);
  const signals = useStore((s) => s.signals);
  const myName = useStore((s) => s.name);
  const progress = useDeckProgress();
  const disclosure = resolveDisclosure(progress);

  const deckRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [stakeError, setStakeError] = useState<string | null>(null);

  // D5 unlock triggers: completed rounds and the first rival flag seen.
  useEffect(() => {
    if (landfallRoundId === undefined) return;
    updateDeckProgress(withRoundCompleted(getDeckProgress(), landfallRoundId));
  }, [landfallRoundId]);
  useEffect(() => {
    if (myName === null) return;
    if (signals.some((s) => s.name !== myName)) {
      updateDeckProgress(withRivalFlagSeen(getDeckProgress()));
    }
  }, [signals, myName]);

  const open = phase?.phase === 'ANCHOR_OPEN';
  const canOrder = connected && open && !finalOrderUsed && !orderPending;
  const fogActive = open && (tideReport?.frozen ?? false);

  const deck = resolveDeckState({
    connected,
    phase: phase?.phase ?? null,
    hasFleet: myFleet !== null,
    fleetStakeMinor: myFleet?.stakeMinor ?? null,
    stakeInputMinor,
    finalOrderUsed,
    orderPending,
    fogActive,
    hasLastFleet: lastFleet !== null,
    hasSelection: myFleet === null && selectedZone !== null,
  });

  // ✕ hold-to-confirm state (fog only).
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimer = useRef<number | null>(null);
  const holdRaf = useRef<number | null>(null);
  const clearHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    if (holdRaf.current !== null) window.cancelAnimationFrame(holdRaf.current);
    holdTimer.current = null;
    holdRaf.current = null;
    setHoldProgress(0);
  };
  const beginHold = () => {
    const start = performance.now();
    const tick = () => {
      setHoldProgress(Math.min(1, (performance.now() - start) / CANCEL_HOLD_MS));
      holdRaf.current = window.requestAnimationFrame(tick);
    };
    holdRaf.current = window.requestAnimationFrame(tick);
    holdTimer.current = window.setTimeout(() => {
      clearHold();
      audio.click('down');
      cancelOrder();
    }, CANCEL_HOLD_MS);
  };
  useEffect(() => clearHold, []);

  // The docked secondary panel sizes itself above the deck.
  useEffect(() => {
    const deckEl = deckRef.current;
    if (!deckEl) return;
    const apply = () =>
      document.documentElement.style.setProperty(
        '--lf-control-deck-height',
        `${deckEl.offsetHeight}px`,
      );
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(deckEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) closeFlagPicker();
  }, [open, closeFlagPicker]);

  useEffect(() => {
    if (!stakeError) return;
    const t = window.setTimeout(() => setStakeError(null), 3000);
    return () => window.clearTimeout(t);
  }, [stakeError]);

  const clamp = (v: number) => Math.min(maxStakeMinor, Math.max(minStakeMinor, v));

  // Dynamic stake controls (v3) — presets and the ± step scale to THIS table,
  // and MAX respects the live 25%-of-round cap so it never posts a bet you
  // can't actually place.
  const presets = useMemo(
    () => niceStakePresets(minStakeMinor, maxStakeMinor),
    [minStakeMinor, maxStakeMinor],
  );
  const stepMinor = stepFor(minStakeMinor);
  const effectiveMaxMinor = () => {
    let cap = Math.min(balanceMinor, maxStakeMinor);
    if (lastKnownHandleMinor !== null && whaleCapFraction < 1) {
      const others = Math.max(0, lastKnownHandleMinor - (myFleet?.stakeMinor ?? 0));
      cap = Math.min(cap, Math.floor((whaleCapFraction / (1 - whaleCapFraction)) * others));
    }
    return Math.max(minStakeMinor, cap);
  };

  // Switching tables changes the valid range — pull the current stake back into
  // it so a below-min (or above-max) amount never lingers after a switch.
  useEffect(() => {
    const c = Math.min(maxStakeMinor, Math.max(minStakeMinor, stakeInputMinor));
    if (c !== stakeInputMinor) setStakeInput(c);
    // Only react to range changes, not to every stake edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minStakeMinor, maxStakeMinor]);

  const applyStake = (value: number, announceClamp = false) => {
    // Every stake edit is a user action — it unlocks the ×2/½/MAX row (D5).
    updateDeckProgress(withStakeEdited(getDeckProgress()));
    const next = clamp(value);
    if (announceClamp && next !== value) {
      setStakeError(
        value < minStakeMinor
          ? `This room's minimum stake is ${fmt(minStakeMinor)}`
          : `This room's maximum stake is ${fmt(maxStakeMinor)}`,
      );
    } else if (announceClamp) {
      setStakeError(null);
    }
    setStakeInput(next);
    setDraft(null);
  };

  // B4: flags usable in at most FLAG_MAX_PER_WINDOW of FLAG_WINDOW_ROUNDS rounds.
  const recentFlags =
    roundId === undefined
      ? []
      : myFlagRounds.filter((r) => r >= roundId - (FLAG_WINDOW_ROUNDS - 1) && r < roundId);
  const flagCoolingDown = roundId !== undefined && recentFlags.length >= FLAG_MAX_PER_WINDOW;
  const flagRoundsLeft = flagCoolingDown
    ? Math.max(1, Math.min(...recentFlags) + FLAG_WINDOW_ROUNDS - roundId)
    : 0;

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = Number(draft.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setStakeError('Enter a stake amount in credits');
      setDraft(null);
      return;
    }
    applyStake(Math.round(parsed * 100), true);
  };

  const bump = (delta: number) => {
    audio.click(delta > 0 ? 'up' : 'down');
    applyStake(stakeInputMinor + delta, true);
  };

  /* ---------- primary presentation (state resolved in deckState.ts) ---------- */

  const primaryContent: Record<PrimaryId, { label: string; sub?: string }> = {
    reconnecting: { label: STR.reconnecting },
    connecting: { label: STR.connecting },
    locked: { label: STR.locked, sub: STR.lockedSub },
    landfall: { label: STR.result, sub: STR.resultSub },
    cooldown: { label: STR.nextRoundSoon },
    'final-order-set': {
      label: STR.lastMoveSet,
      ...(myFleet ? { sub: `${coveName(myFleet.primaryZone)} · ${fmt(myFleet.stakeMinor)}` } : {}),
    },
    sending: { label: STR.sending },
    anchored: {
      label: STR.betPlaced,
      ...(myFleet
        ? { sub: `${coveName(myFleet.primaryZone)} · ${fmt(myFleet.stakeMinor)}` }
        : {}),
    },
    'place-bet': {
      label: `${STR.placeBet} ${fmt(stakeInputMinor)}`,
      ...(selectedZone !== null ? { sub: coveName(selectedZone) } : {}),
    },
    rebet: {
      label: `${STR.betAgain} ${lastFleet ? fmt(lastFleet.stakeMinor) : ''}`.trim(),
      ...(lastFleet
        ? {
            sub: `${coveName(lastFleet.primaryZone)}${lastFleet.mode === 'SPLIT' ? ` · ${STR.twoZones}` : ''}`,
          }
        : {}),
    },
    'select-cove': { label: STR.pickZone, sub: STR.pickZoneSub },
  };
  const primary = primaryContent[deck.primary.id];
  const primaryOnPress =
    deck.primary.id === 'rebet'
      ? () => {
          audio.click('send');
          rebet();
        }
      : deck.primary.id === 'place-bet'
        ? () => {
            audio.click('send');
            commitBet();
          }
        : undefined;

  const primaryClass =
    deck.primary.kind === 'action'
      ? 'bg-[var(--lf-action)] text-[#04240f] hover:bg-[var(--lf-action-strong)] active:scale-[0.99]'
      : deck.primary.kind === 'confirmed'
        ? 'border border-[var(--lf-action)]/60 bg-[var(--lf-action)]/10 text-[var(--lf-safe)]'
        : 'bg-[var(--lf-surface-2)] text-[var(--lf-dim)]';

  const split = fleetMode === 'SPLIT';
  const summary = myFleet
    ? myFleet.mode === 'SPLIT' && myFleet.secondaryZone !== null
      ? `${SPLIT_PRIMARY_PERCENT}% ${coveName(myFleet.primaryZone)} · ${100 - SPLIT_PRIMARY_PERCENT}% ${coveName(myFleet.secondaryZone)}`
      : `100% ${coveName(myFleet.primaryZone)}`
    : split
      ? `${SPLIT_PRIMARY_PERCENT}/${100 - SPLIT_PRIMARY_PERCENT} across two zones`
      : STR.oneZoneHint;

  /* ---------- D4 payout expectation strip (public tide bands only) ---------- */

  // v3 P0-6: base the "If safe ≈ $range" on the stake actually in play — the
  // placed fleet's stake if committed, otherwise the stepper value.
  const strip =
    open && tideReport
      ? formatPayoutStrip(
          payoutExpectationGains(
            tideReport.entries.map((e) => e.band),
            myFleet?.primaryZone ?? selectedZone ?? null,
            RAKE,
          ),
          myFleet?.stakeMinor ?? stakeInputMinor,
        )
      : null;

  const chipBtn =
    'flex h-11 min-w-11 items-center justify-center rounded-md bg-[var(--lf-surface-2)] px-3 text-sm font-bold text-[var(--lf-dim)] hover:bg-[var(--lf-line)] hover:text-[var(--lf-text)] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <>
      {/* flag picker popover — three pictographic flags, no text required.
          Gated with the flag button (D5): long-press on a cove is the other
          way in, so the disclosure check must live here too. */}
      {flagPickerAt && open && disclosure.showFlags && (
        <div
          className="fixed z-30"
          style={{
            left: Math.min(Math.max(flagPickerAt.x - 100, 8), window.innerWidth - 208),
            top: Math.max(flagPickerAt.y - 92, 8),
          }}
        >
          <div className="lf-sheet lf-surface flex gap-1.5 rounded-xl p-2 shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
            {(
              [
                ['RALLY', RallyFlagIcon, 'var(--lf-safe)', STR.signalJoin],
                ['FLEE', FleeFlagIcon, '#ff9948', STR.signalAvoid],
                ['HOLD', HoldFlagIcon, 'var(--lf-focus)', STR.signalStay],
              ] as const
            ).map(([kind, Icon, color, label]) => (
              <button
                key={kind}
                onClick={() => {
                  audio.click('send');
                  sendSignal(kind, flagPickerAt.zone);
                  closeFlagPicker();
                }}
                className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg hover:bg-[var(--lf-line)]"
                style={{ color }}
                title={`${label} — signals can bluff`}
              >
                <Icon size={22} />
                <span className="text-sm font-bold text-[var(--lf-dim)]">
                  {label.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* the deck */}
      <div
        ref={deckRef}
        className="absolute inset-x-0 bottom-0 z-10 border-t border-[var(--lf-line)] bg-[var(--lf-glass)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        {/* D4 — "if you survive" expectation band; freezes with the tide report */}
        {strip && (
          <div
            className={`mx-auto flex max-w-4xl items-center gap-2 px-3 pt-1.5 text-xs font-semibold tabular-nums ${
              fogActive ? 'text-[var(--lf-dim)]/70' : 'text-[var(--lf-dim)]'
            }`}
            role="note"
            aria-label={`${STR.ifSafe}: about ${strip.ifSafeRange}. ${STR.estimateNote}`}
          >
            <span aria-hidden="true" title={STR.estimateNote}>
              <StormIcon size={13} />
            </span>
            <span className="truncate">
              {STR.ifSafe}: ≈ {strip.ifSafeRange}
            </span>
            {fogActive && (
              <span className="ml-auto shrink-0 rounded border border-[var(--lf-line)] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                {STR.paused}
              </span>
            )}
          </div>
        )}

        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-3 py-2 md:flex-row md:items-stretch md:gap-3">
          {/* mode + selection summary — progressively disclosed (D5): fresh
              profiles see no mode group; after one round a dimmed teaser with
              the same footprint appears; unlocked at 3 rounds or on tap. */}
          {disclosure.showModeToggle ? (
            <div className="flex items-center gap-2 md:flex-col md:items-stretch md:justify-center md:gap-1.5">
              <div
                className="flex overflow-hidden rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)]"
                role="radiogroup"
                aria-label="Bet mode"
              >
                {(
                  [
                    ['FOCUS', BoatIcon, STR.oneZone, STR.oneZoneHint],
                    ['SPLIT', SplitBoatsIcon, STR.twoZones, STR.twoZonesHint],
                  ] as const
                ).map(([mode, Icon, label, hint]) => (
                  <button
                    key={mode}
                    role="radio"
                    aria-checked={fleetMode === mode}
                    onClick={() => {
                      audio.click('tap');
                      setFleetMode(mode);
                    }}
                    disabled={!canOrder}
                    className={`flex h-11 min-w-20 items-center justify-center gap-1.5 px-3 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-40 ${
                      fleetMode === mode
                        ? 'bg-[var(--lf-focus)] text-[#03202f]'
                        : 'text-[var(--lf-dim)] hover:text-[var(--lf-text)]'
                    }`}
                    title={hint}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
              <p
                className="hidden max-w-44 truncate text-xs font-semibold text-[var(--lf-dim)] md:block"
                title={summary}
              >
                {summary}
              </p>
            </div>
          ) : disclosure.showModeTeaser ? (
            <div className="flex items-center md:flex-col md:justify-center">
              <button
                onClick={() => {
                  audio.click('tap');
                  updateDeckProgress(withModesUnlockedByTap(getDeckProgress()));
                }}
                className="flex h-11 min-w-[10.5rem] items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--lf-line)] bg-[var(--lf-surface)]/60 px-3 text-sm font-bold text-[var(--lf-dim)] hover:border-[var(--lf-focus)]/60 hover:text-[var(--lf-text)]"
                aria-label={`1 Zone and 2 Zones bet modes unlock after ${MODE_UNLOCK_ROUNDS} rounds — activate to unlock now`}
                title={`Unlocks after ${MODE_UNLOCK_ROUNDS} rounds — tap to unlock now`}
              >
                <LockIcon size={14} />
                {STR.oneZone} / {STR.twoZones}
              </button>
            </div>
          ) : null}

          {/* stake module */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => bump(-stepMinor)}
                disabled={!canOrder}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] text-base font-bold hover:bg-[var(--lf-line)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Lower stake by ${fmt(stepMinor)}`}
              >
                −
              </button>
              <label className="sr-only" htmlFor="lf-stake-input">
                Stake amount in credits
              </label>
              <input
                id="lf-stake-input"
                type="text"
                inputMode="decimal"
                value={draft ?? fmt(stakeInputMinor)}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitDraft();
                  }
                }}
                disabled={!canOrder}
                aria-invalid={stakeError !== null}
                aria-describedby={stakeError ? 'lf-stake-error' : undefined}
                className="h-11 w-28 min-w-0 rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] text-center text-base font-extrabold tabular-nums outline-none focus:border-[var(--lf-focus)] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                onClick={() => bump(stepMinor)}
                disabled={!canOrder}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] text-base font-bold hover:bg-[var(--lf-line)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Raise stake by ${fmt(stepMinor)}`}
              >
                +
              </button>
              <span className="ml-1 hidden text-xs font-bold text-[var(--lf-dim)] sm:inline">
                STAKE
              </span>
              {stakeError && (
                <span
                  id="lf-stake-error"
                  role="status"
                  className="truncate text-sm font-semibold text-[var(--lf-danger)]"
                >
                  {stakeError}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    audio.click('tap');
                    applyStake(p);
                  }}
                  disabled={!canOrder}
                  className={`${chipBtn} ${
                    stakeInputMinor === p
                      ? '!bg-[var(--lf-focus)]/15 !text-[var(--lf-focus)] ring-1 ring-[var(--lf-focus)]/50'
                      : ''
                  }`}
                  title={`Bet ${fmt(p)}`}
                >
                  {presetLabel(p)}
                </button>
              ))}
              {/* ×2/½/MAX appear once the stake has been edited (D5) */}
              {disclosure.showStakeTricks && (
                <>
                  <span
                    className="mx-0.5 h-4 w-px shrink-0 bg-[var(--lf-line)]"
                    aria-hidden="true"
                  />
                  <button
                    onClick={() => {
                      audio.click('up');
                      updateDeckProgress(withStakeEdited(getDeckProgress()));
                      doubleStake();
                    }}
                    disabled={!canOrder}
                    className={chipBtn}
                    title="Double the stake"
                  >
                    ×2
                  </button>
                  <button
                    onClick={() => {
                      audio.click('down');
                      applyStake(
                        Math.max(minStakeMinor, Math.floor(stakeInputMinor / 2 / 100) * 100),
                      );
                    }}
                    disabled={!canOrder}
                    className={chipBtn}
                    title="Halve the stake"
                  >
                    ½
                  </button>
                  <button
                    onClick={() => {
                      audio.click('up');
                      applyStake(effectiveMaxMinor());
                    }}
                    disabled={!canOrder}
                    className={chipBtn}
                    title="Bet the most you can right now (within your balance, the table max, and 25% of the round)"
                  >
                    MAX
                  </button>
                </>
              )}
            </div>
          </div>

          {/* secondary actions + primary. The primary's position and size never
              change within a phase: secondary slots are RESERVED (invisible,
              inert) whenever a fleet is placed, so nothing shifts. */}
          <div className="flex items-stretch gap-2">
            {myFleet && open && (
              <button
                onClick={() => {
                  audio.click('send');
                  useStore.getState().sendAnchor(myFleet.primaryZone);
                }}
                disabled={!deck.showRestake || !canOrder}
                className={`flex min-h-14 w-24 shrink-0 flex-col items-center justify-center rounded-lg border border-[var(--lf-focus)]/60 bg-[var(--lf-focus)]/10 px-2 text-[var(--lf-focus)] hover:bg-[var(--lf-focus)]/20 ${
                  deck.showRestake ? '' : 'pointer-events-none opacity-0'
                }`}
                aria-hidden={!deck.showRestake}
                tabIndex={deck.showRestake ? 0 : -1}
                title={
                  fogActive
                    ? `${STR.updateBet} to ${fmt(stakeInputMinor)} — uses your one last move`
                    : `${STR.updateBet} to ${fmt(stakeInputMinor)} at ${coveName(myFleet.primaryZone)}`
                }
              >
                <span className="text-sm font-extrabold leading-tight">Update</span>
                <span className="text-xs font-semibold leading-tight tabular-nums">
                  {fmt(stakeInputMinor)}
                </span>
              </button>
            )}
            {myFleet && open && disclosure.showFlags && (
              <button
                onClick={(e) => {
                  if (flagCoolingDown) return;
                  audio.click('nav');
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  if (flagPickerAt) closeFlagPicker();
                  else openFlagPicker(myFleet.primaryZone, r.left + r.width / 2, r.top);
                }}
                disabled={flagCoolingDown}
                className={`relative flex w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] ${
                  flagCoolingDown
                    ? 'cursor-not-allowed text-[var(--lf-dim)]/40'
                    : 'text-[var(--lf-dim)] hover:text-[var(--lf-text)]'
                }`}
                aria-label={
                  flagCoolingDown
                    ? `Signal available again in ${flagRoundsLeft} round${flagRoundsLeft === 1 ? '' : 's'}`
                    : 'Send a signal'
                }
                title={
                  flagCoolingDown
                    ? `Signal returns in ${flagRoundsLeft} round${flagRoundsLeft === 1 ? '' : 's'}`
                    : 'Send a signal (or long-press your zone)'
                }
              >
                <RallyFlagIcon size={18} />
                {flagCoolingDown && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--lf-surface-2)] px-1 text-xs font-extrabold tabular-nums text-[var(--lf-dim)] ring-1 ring-[var(--lf-line)]"
                  >
                    {flagRoundsLeft}
                  </span>
                )}
              </button>
            )}
            {deck.showCancel && myFleet && (
              <button
                onClick={
                  deck.cancelNeedsHold
                    ? undefined
                    : () => {
                        audio.click('down');
                        cancelOrder();
                      }
                }
                onPointerDown={deck.cancelNeedsHold ? beginHold : undefined}
                onPointerUp={deck.cancelNeedsHold ? clearHold : undefined}
                onPointerLeave={deck.cancelNeedsHold ? clearHold : undefined}
                onPointerCancel={deck.cancelNeedsHold ? clearHold : undefined}
                className="relative flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-[var(--lf-danger)]/60 bg-[var(--lf-danger)]/10 text-[var(--lf-danger)] hover:bg-[var(--lf-danger)]/20"
                aria-label={
                  deck.cancelNeedsHold
                    ? `Cancel bet — this uses your one last move. Hold to confirm.`
                    : `Cancel bet — refund ${fmt(myFleet.stakeMinor)}`
                }
                title={
                  deck.cancelNeedsHold
                    ? 'This uses your one last move — hold to confirm'
                    : `Cancel bet — refund ${fmt(myFleet.stakeMinor)}`
                }
              >
                {deck.cancelNeedsHold && holdProgress > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 bg-[var(--lf-danger)]/35"
                    style={{ height: `${holdProgress * 100}%` }}
                  />
                )}
                <XIcon size={16} />
              </button>
            )}
            <button
              onClick={primaryOnPress}
              disabled={deck.primary.disabled}
              className={`flex min-h-14 w-full min-w-52 flex-col items-center justify-center rounded-xl px-4 transition-[background-color,transform] duration-150 disabled:cursor-default md:w-auto ${primaryClass} ${
                toast ? 'lf-shake' : ''
              } ${deck.primary.kind === 'action' ? 'lf-pulse' : ''}`}
              aria-live="polite"
            >
              <span className="text-base font-extrabold leading-tight tracking-wide">
                {primary.label}
              </span>
              {primary.sub && (
                <span
                  className={`text-xs font-semibold leading-tight ${
                    deck.primary.kind === 'action' ? 'text-[#04240f]/70' : 'text-[var(--lf-dim)]'
                  }`}
                >
                  {primary.sub}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
