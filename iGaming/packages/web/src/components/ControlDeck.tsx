/**
 * Persistent bottom control deck — always-visible stake input, quick presets,
 * Focus/Split segmented control, and one contextual primary action button.
 * Replaces the old stake chip + pop-up sheet so repeated rounds need zero
 * extra taps. The deck never moves between phases; only labels change.
 */
import { useEffect, useRef, useState } from 'react';
import { HARBOR_NAMES, MAX_STAKE_MINOR, MIN_STAKE_MINOR, SPLIT_PRIMARY_PERCENT } from '@landfall/core';
import { audio } from '../audio/engine';
import { fmt, useStore } from '../store';
import { BoatIcon, RallyFlagIcon, FleeFlagIcon, HoldFlagIcon, SplitBoatsIcon } from './icons';

const PRESETS = [10_00, 50_00, 200_00, 500_00, 1000_00, 2500_00, 5000_00];

function coveName(zone: number): string {
  return HARBOR_NAMES[zone] ?? `Cove ${zone + 1}`;
}

function presetLabel(minor: number): string {
  const units = minor / 100;
  return units >= 1000 ? `${units / 1000}k` : String(units);
}

interface PrimaryAction {
  label: string;
  sub?: string | undefined;
  kind: 'action' | 'confirmed' | 'idle';
  disabled: boolean;
  onPress?: () => void;
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
  const rebet = useStore((s) => s.rebet);
  const doubleStake = useStore((s) => s.doubleStake);
  const sendSignal = useStore((s) => s.sendSignal);
  const flagPickerAt = useStore((s) => s.flagPickerAt);
  const openFlagPicker = useStore((s) => s.openFlagPicker);
  const closeFlagPicker = useStore((s) => s.closeFlagPicker);
  const toast = useStore((s) => s.toast);

  const deckRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [stakeError, setStakeError] = useState<string | null>(null);

  const open = phase?.phase === 'ANCHOR_OPEN';
  const canOrder = connected && open && !finalOrderUsed && !orderPending;

  // The docked secondary panel sizes itself above the deck.
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    const apply = () =>
      document.documentElement.style.setProperty(
        '--lf-control-deck-height',
        `${deck.offsetHeight}px`,
      );
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(deck);
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

  const clamp = (v: number) => Math.min(MAX_STAKE_MINOR, Math.max(MIN_STAKE_MINOR, v));

  const applyStake = (value: number, announceClamp = false) => {
    const next = clamp(value);
    if (announceClamp && next !== value) {
      setStakeError(
        value < MIN_STAKE_MINOR
          ? `Minimum stake is ${fmt(MIN_STAKE_MINOR)}`
          : `Maximum stake is ${fmt(MAX_STAKE_MINOR)}`,
      );
    } else if (announceClamp) {
      setStakeError(null);
    }
    setStakeInput(next);
    setDraft(null);
  };

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

  /* ---------- primary action resolution ---------- */

  const primary: PrimaryAction = !connected
    ? { label: 'RECONNECTING…', kind: 'idle', disabled: true }
    : !phase
      ? { label: 'CONNECTING…', kind: 'idle', disabled: true }
      : phase.phase === 'LOCKED_STORM'
        ? { label: 'ANCHORS LOCKED', sub: 'Storm is choosing a cove', kind: 'idle', disabled: true }
        : phase.phase === 'RESOLVED'
          ? { label: 'LANDFALL', sub: 'Settling results', kind: 'idle', disabled: true }
          : phase.phase === 'COOLDOWN'
            ? { label: 'NEXT ROUND SOON', kind: 'idle', disabled: true }
            : finalOrderUsed
              ? {
                  label: 'FINAL ORDER SET',
                  sub: myFleet ? `Committed at ${coveName(myFleet.primaryZone)}` : undefined,
                  kind: 'confirmed',
                  disabled: true,
                }
              : orderPending
                ? { label: 'PLACING…', kind: 'idle', disabled: true }
                : myFleet
                  ? stakeInputMinor !== myFleet.stakeMinor
                    ? {
                        label: `RESTAKE ${fmt(stakeInputMinor)}`,
                        sub: `at ${coveName(myFleet.primaryZone)}`,
                        kind: 'action',
                        disabled: false,
                        onPress: () => {
                          audio.click('send');
                          useStore.getState().sendAnchor(myFleet.primaryZone);
                        },
                      }
                    : {
                        label: `ANCHORED · ${coveName(myFleet.primaryZone).toUpperCase()}`,
                        sub: 'Tap another cove to move',
                        kind: 'confirmed',
                        disabled: true,
                      }
                  : lastFleet
                    ? {
                        label: `REBET ${fmt(lastFleet.stakeMinor)}`,
                        sub: `${lastFleet.mode === 'SPLIT' ? 'Split' : 'Focus'} · ${coveName(lastFleet.primaryZone)}`,
                        kind: 'action',
                        disabled: false,
                        onPress: () => {
                          audio.click('send');
                          rebet();
                        },
                      }
                    : {
                        label: 'SELECT A COVE',
                        sub: 'Tap the map to anchor',
                        kind: 'idle',
                        disabled: true,
                      };

  const primaryClass =
    primary.kind === 'action'
      ? 'bg-[var(--lf-action)] text-[#04240f] hover:bg-[var(--lf-action-strong)] active:scale-[0.99]'
      : primary.kind === 'confirmed'
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

  const chipBtn =
    'flex h-7 min-w-9 items-center justify-center rounded-md bg-[var(--lf-surface-2)] px-2 text-[11px] font-bold text-[var(--lf-dim)] hover:bg-[var(--lf-line)] hover:text-[var(--lf-text)] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <>
      {/* flag picker popover — three pictographic flags, no text required */}
      {flagPickerAt && open && (
        <div
          className="fixed z-30"
          style={{
            left: Math.min(Math.max(flagPickerAt.x - 90, 8), window.innerWidth - 188),
            top: Math.max(flagPickerAt.y - 84, 8),
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
                className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-lg hover:bg-[var(--lf-line)]"
                style={{ color }}
                title={`${label} — signals can bluff`}
              >
                <Icon size={22} />
                <span className="text-[10px] font-bold text-[var(--lf-dim)]">
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
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-3 py-2 md:flex-row md:items-stretch md:gap-3">
          {/* mode + selection summary */}
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
                  className={`flex h-9 min-w-16 items-center justify-center gap-1.5 px-3 text-xs font-extrabold disabled:cursor-not-allowed disabled:opacity-40 ${
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
              className="hidden max-w-44 truncate text-[10px] font-semibold text-[var(--lf-dim)] md:block"
              title={summary}
            >
              {summary}
            </p>
          </div>

          {/* stake module */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => bump(-10_00)}
                disabled={!canOrder}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] text-base font-bold hover:bg-[var(--lf-line)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Lower stake by 10"
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
                className="h-9 w-24 min-w-0 rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] text-center text-sm font-extrabold tabular-nums outline-none focus:border-[var(--lf-focus)] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                onClick={() => bump(10_00)}
                disabled={!canOrder}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] text-base font-bold hover:bg-[var(--lf-line)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Raise stake by 10"
              >
                +
              </button>
              <span className="ml-1 hidden text-[10px] font-bold text-[var(--lf-dim)] sm:inline">
                STAKE
              </span>
              {stakeError && (
                <span
                  id="lf-stake-error"
                  role="status"
                  className="truncate text-[10px] font-semibold text-[var(--lf-danger)]"
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
              <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--lf-line)]" aria-hidden="true" />
              <button
                onClick={() => {
                  audio.click('up');
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
                  applyStake(Math.max(MIN_STAKE_MINOR, Math.floor(stakeInputMinor / 2 / 100) * 100));
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
                  applyStake(Math.min(balanceMinor, MAX_STAKE_MINOR));
                }}
                disabled={!canOrder}
                className={chipBtn}
                title="Stake the maximum"
              >
                MAX
              </button>
            </div>
          </div>

          {/* flag + primary action */}
          <div className="flex items-stretch gap-2">
            {myFleet && open && (
              <button
                onClick={(e) => {
                  audio.click('nav');
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  if (flagPickerAt) closeFlagPicker();
                  else openFlagPicker(myFleet.primaryZone, r.left + r.width / 2, r.top);
                }}
                className="flex w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--lf-line)] bg-[var(--lf-surface)] text-[var(--lf-dim)] hover:text-[var(--lf-text)]"
                aria-label="Raise a signal flag"
                title="Raise a signal flag (or long-press your cove)"
              >
                <RallyFlagIcon size={18} />
              </button>
            )}
            <button
              onClick={primary.onPress}
              disabled={primary.disabled}
              className={`flex min-h-14 w-full min-w-52 flex-col items-center justify-center rounded-xl px-4 transition-[background-color,transform] duration-150 disabled:cursor-default md:w-auto ${primaryClass} ${
                toast ? 'lf-shake' : ''
              } ${primary.kind === 'idle' && open && !myFleet && !lastFleet ? 'lf-pulse' : ''}`}
              aria-live="polite"
            >
              <span className="text-sm font-extrabold leading-tight tracking-wide">
                {primary.label}
              </span>
              {primary.sub && (
                <span
                  className={`text-[10px] font-semibold leading-tight ${
                    primary.kind === 'action' ? 'text-[#04240f]/70' : 'text-[var(--lf-dim)]'
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
