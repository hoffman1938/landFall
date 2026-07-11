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
import { useEffect, useRef, useState } from 'react';
import {
  FLAG_MAX_PER_WINDOW,
  FLAG_WINDOW_ROUNDS,
  HARBOR_NAMES,
  RAKE,
  SPLIT_PRIMARY_PERCENT,
  payoutExpectationGains,
} from '@landfall/core';
import { audio } from '../audio/engine';
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

const PRESETS = [1_00, 2_00, 5_00, 10_00, 25_00, 50_00, 100_00, 500_00];

/** Hold duration for the fog-cancel confirm affordance. */
const CANCEL_HOLD_MS = 650;

function coveName(zone: number): string {
  return HARBOR_NAMES[zone] ?? `Cove ${zone + 1}`;
}

function presetLabel(minor: number): string {
  const units = minor / 100;
  return units >= 1000 ? `${units / 1000}k` : String(units);
}

export function ControlDeck() {
  const connected = useStore((s) => s.connected);
  const phase = useStore((s) => s.phase);
  const stakeInputMinor = useStore((s) => s.stakeInputMinor);
  const setStakeInput = useStore((s) => s.setStakeInput);
  const myFleet = useStore((s) => s.myFleet);
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
    reconnecting: { label: 'RECONNECTING…' },
    connecting: { label: 'CONNECTING…' },
    locked: { label: 'ANCHORS LOCKED', sub: 'Storm is choosing a cove' },
    landfall: { label: 'LANDFALL', sub: 'Settling results' },
    cooldown: { label: 'NEXT ROUND SOON' },
    'final-order-set': {
      label: 'FINAL ORDER SET',
      ...(myFleet ? { sub: `Committed at ${coveName(myFleet.primaryZone)}` } : {}),
    },
    sending: { label: 'SENDING…' },
    anchored: {
      label: 'ANCHORED',
      ...(myFleet
        ? { sub: `${coveName(myFleet.primaryZone)} · ${fmt(myFleet.stakeMinor)}` }
        : {}),
    },
    rebet: {
      label: `REBET ${lastFleet ? fmt(lastFleet.stakeMinor) : ''}`,
      ...(lastFleet
        ? {
            sub: `${lastFleet.mode === 'SPLIT' ? 'Split' : 'Focus'} · ${coveName(lastFleet.primaryZone)}`,
          }
        : {}),
    },
    'select-cove': { label: 'SELECT A COVE', sub: 'Tap the map to anchor' },
  };
  const primary = primaryContent[deck.primary.id];
  const primaryOnPress =
    deck.primary.id === 'rebet'
      ? () => {
          audio.click('send');
          rebet();
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
      ? `Next pick splits ${SPLIT_PRIMARY_PERCENT}/${100 - SPLIT_PRIMARY_PERCENT} across two coves`
      : 'Full stake in one cove';

  /* ---------- D4 payout expectation strip (public tide bands only) ---------- */

  const strip =
    open && tideReport
      ? formatPayoutStrip(
          payoutExpectationGains(
            tideReport.entries.map((e) => e.band),
            myFleet?.primaryZone ?? null,
            RAKE,
          ),
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
                ['RALLY', RallyFlagIcon, 'var(--lf-safe)', 'Rally here'],
                ['FLEE', FleeFlagIcon, '#ff9948', 'Danger here'],
                ['HOLD', HoldFlagIcon, 'var(--lf-focus)', 'I stay'],
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
            aria-label="Payout expectation from the public tide report"
          >
            <span aria-hidden="true" title="Storm Power can multiply salvage">
              <StormIcon size={13} />
            </span>
            <span className="truncate">
              If another cove is hit: ≈ {strip.typicalRange} · heaviest cove: up to ≈{' '}
              {strip.heaviest}
            </span>
            {fogActive && (
              <span className="ml-auto shrink-0 rounded border border-[var(--lf-line)] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                Frozen in fog
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
                aria-label="Fleet mode"
              >
                {(
                  [
                    ['FOCUS', BoatIcon, 'Focus', 'Full stake in one cove'],
                    [
                      'SPLIT',
                      SplitBoatsIcon,
                      'Split',
                      `${SPLIT_PRIMARY_PERCENT}/${100 - SPLIT_PRIMARY_PERCENT} across two coves`,
                    ],
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
                aria-label={`Focus and Split fleet modes unlock after ${MODE_UNLOCK_ROUNDS} rounds — activate to unlock now`}
                title={`Unlocks after ${MODE_UNLOCK_ROUNDS} rounds — tap to unlock now`}
              >
                <LockIcon size={14} />
                Focus / Split
              </button>
            </div>
          ) : null}

          {/* stake module */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => bump(-1_00)}
                disabled={!canOrder}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] text-base font-bold hover:bg-[var(--lf-line)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Lower stake by 1"
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
                onClick={() => bump(1_00)}
                disabled={!canOrder}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] text-base font-bold hover:bg-[var(--lf-line)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Raise stake by 1"
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
              {PRESETS.map((p) => (
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
                      applyStake(Math.min(balanceMinor, maxStakeMinor));
                    }}
                    disabled={!canOrder}
                    className={chipBtn}
                    title="Stake the maximum"
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
                    ? `Restake ${fmt(stakeInputMinor)} — uses your one fog order`
                    : `Restake ${fmt(stakeInputMinor)} at ${coveName(myFleet.primaryZone)}`
                }
              >
                <span className="text-sm font-extrabold leading-tight">RESTAKE</span>
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
                    ? `Signal flag available again in ${flagRoundsLeft} round${flagRoundsLeft === 1 ? '' : 's'}`
                    : 'Raise a signal flag'
                }
                title={
                  flagCoolingDown
                    ? `Flag returns in ${flagRoundsLeft} round${flagRoundsLeft === 1 ? '' : 's'}`
                    : 'Raise a signal flag (or long-press your cove)'
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
                    ? `Cancel bet — this uses your one fog order. Hold to confirm.`
                    : `Cancel bet — refund ${fmt(myFleet.stakeMinor)}`
                }
                title={
                  deck.cancelNeedsHold
                    ? 'This uses your one fog order — hold to confirm'
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
              } ${deck.primary.id === 'select-cove' ? 'lf-pulse' : ''}`}
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
