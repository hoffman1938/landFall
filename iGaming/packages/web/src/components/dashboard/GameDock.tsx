import { useState } from 'react';
import { audio } from '../../audio/engine';
import { fmt, useStore } from '../../store';
import type { LandfallInfo } from '../../store';
import { personalResult } from '../../simpleGameModel';
import { atLeast, type RevealStage } from '../../revealStages';
import { LockIcon } from '../icons';

interface Props {
  stage: 'choose' | 'storm' | 'result';
  canBet: boolean;
  maxMinor: number;
  result: LandfallInfo | null;
  /** The reveal beat the board is on, so the receipt lands with the number. */
  reveal: RevealStage;
}

/**
 * Three chips, not a keypad. The betting window is ten seconds long, and a
 * stepper that moves by the table minimum needs forty presses to cross a tier —
 * so the amount either gets typed (fiddly on a phone) or never changes. Halve,
 * double and max cover almost every real adjustment in one tap, and each one
 * still lands in a field the player can read and correct before confirming.
 */
const QUICK_STEPS: { label: string; of(stake: number, min: number, max: number): number }[] = [
  { label: '½', of: (stake, min) => Math.max(min, Math.floor(stake / 2)) },
  { label: '×2', of: (stake, _min, max) => Math.min(max, stake * 2) },
  { label: 'MAX', of: (_stake, _min, max) => max },
];

export function GameDock({ stage, canBet, maxMinor, result, reveal }: Props) {
  const stake = useStore((s) => s.stakeInputMinor);
  const min = useStore((s) => s.roomMinStakeMinor);
  const fleet = useStore((s) => s.myFleet);
  const zone = useStore((s) => s.selectedZone ?? s.myFleet?.primaryZone ?? null);
  const pending = useStore((s) => s.orderPending);
  const connected = useStore((s) => s.connected);
  const finalOrderUsed = useStore((s) => s.finalOrderUsed);
  const lastFleet = useStore((s) => s.lastFleet);
  const setStake = useStore((s) => s.setStakeInput);
  const commit = useStore((s) => s.commitSimpleBet);
  const select = useStore((s) => s.selectSimpleZone);
  const cancel = useStore((s) => s.cancelOrder);
  const [draft, setDraft] = useState<{ text: string; forStake: number } | null>(null);
  const input = draft?.forStake === stake ? draft.text : (stake / 100).toFixed(2);
  const parsed = Number(input);
  const parsedMinor = Math.round(parsed * 100);
  const valid =
    /^\d+(\.\d{0,2})?$/.test(input) &&
    Number.isFinite(parsed) &&
    parsedMinor >= min &&
    parsedMinor <= maxMinor &&
    Math.abs(parsed * 100 - parsedMinor) < 0.00001;
  const dirty =
    !!fleet && (zone !== fleet.primaryZone || stake !== fleet.stakeMinor || fleet.mode !== 'FOCUS');
  const ready = canBet && valid && zone !== null && (!fleet || dirty);
  const receipt = result ? personalResult(result) : null;
  let label = 'Choose a harbor';
  let sub = 'Select one of the six numbered buttons';
  if (!connected) {
    label = 'Reconnecting…';
    sub = 'Waiting for the table connection';
  } else if (pending) {
    label = 'Confirming…';
    sub = 'Waiting for the server';
  } else if (stage === 'storm') {
    label = fleet ? 'Bet locked' : 'Watching this round';
    sub = 'The result is on its way';
  } else if (stage === 'result') {
    label = 'Next round soon';
    sub = 'Each round needs your confirmation';
  } else if (finalOrderUsed) {
    label = fleet ? 'Bet locked' : 'No bet this round';
    sub = 'Your final change has been used';
  } else if (maxMinor < min) {
    label = 'Not enough available credits';
    sub = 'Choose another table or check your play limits';
  } else if (!valid) {
    label = 'Check the amount';
    sub = `Enter ${fmt(min)}–${fmt(maxMinor)} credits`;
  } else if (fleet && !dirty) {
    label = `Bet placed · ${fmt(fleet.stakeMinor)}`;
    sub = `Harbor ${fleet.primaryZone + 1} · this round only`;
  } else if (zone !== null) {
    label = `${fleet ? 'Update bet' : 'Place bet'} · ${fmt(stake)}`;
    sub = `Harbor ${zone + 1} · this round only`;
  }

  return (
    <div className="gd-dock">
      {stage === 'result' && receipt?.played && atLeast(reveal, 'outcome') ? (
        <div className="gd-return-strip" aria-label="Your payout breakdown">
          {receipt.receiptKnown ? (
            <>
              <span>
                Stake returned <b>{fmt(receipt.returnedStakeMinor!)}</b>
              </span>
              <span>
                Bank share <b>{fmt(receipt.shareMinor!)}</b>
              </span>
              {receipt.jackpotMinor > 0 && (
                <span>
                  Jackpot <b>{fmt(receipt.jackpotMinor)}</b>
                </span>
              )}
              <span>
                Total returned <b>{fmt(receipt.totalReturnMinor!)}</b>
              </span>
            </>
          ) : (
            <span>Receipt details unavailable after reconnect. Your net result is confirmed.</span>
          )}
          {receipt.multiplier > 1 && (
            <small>
              Share ×{receipt.multiplier}; returned stake is not multiplied.
              {receipt.powerCapped ? ' Round payout cap applied.' : ''}
            </small>
          )}
        </div>
      ) : null}
      <div className="gd-bet-controls">
        <div className="gd-stake-group">
          <label htmlFor="gd-stake" className="gd-label">
            BET · CREDITS
          </label>
          <div className={`gd-stepper ${!valid ? 'is-invalid' : ''}`}>
            <button
              type="button"
              aria-label="Decrease bet"
              disabled={!canBet || stake <= min}
              onClick={() => setStake(Math.max(min, stake - min))}
            >
              −
            </button>
            <input
              id="gd-stake"
              aria-label="Bet amount in credits"
              inputMode="decimal"
              autoComplete="off"
              value={input}
              disabled={!canBet}
              onChange={(e) => {
                const next = e.target.value;
                const n = Number(next);
                const minor =
                  next.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : stake;
                setDraft({ text: next, forStake: minor });
                if (minor !== stake) setStake(minor);
              }}
              onBlur={() => {
                if (valid) setDraft(null);
              }}
              aria-invalid={!valid}
              aria-describedby="gd-stake-limit"
            />
            <button
              type="button"
              aria-label="Increase bet"
              disabled={!canBet || stake >= maxMinor}
              onClick={() => setStake(Math.min(maxMinor, stake + min))}
            >
              +
            </button>
          </div>
          <div className="gd-quick-stakes" role="group" aria-label="Quick bet amounts">
            {QUICK_STEPS.map((step) => {
              const next = step.of(stake, min, maxMinor);
              return (
                <button
                  key={step.label}
                  type="button"
                  disabled={!canBet || next === stake || next < min || next > maxMinor}
                  onClick={() => {
                    setDraft(null);
                    setStake(next);
                  }}
                >
                  {step.label}
                </button>
              );
            })}
          </div>
          <span id="gd-stake-limit" className="gd-control-hint">
            {maxMinor < min
              ? 'Not enough available credits'
              : `Min ${fmt(min)} · Max now ${fmt(maxMinor)}`}
          </span>
        </div>
        <div className="gd-primary-group">
          <button
            type="button"
            className={`gd-primary ${ready ? 'is-ready' : ''}`}
            disabled={!ready}
            onClick={() => {
              audio.click('down');
              commit();
            }}
          >
            <strong>
              {fleet && !dirty && stage === 'choose' ? <LockIcon size={16} /> : null}
              {label}
            </strong>
            <span>{sub}</span>
          </button>
        </div>
      </div>
      <div className="gd-dock-note">
        <span>
          {fleet && stage === 'choose'
            ? `Accepted: Harbor ${fleet.primaryZone + 1}${fleet.mode === 'SPLIT' ? ` + ${fleet.secondaryZone! + 1}` : ''} · ${fmt(fleet.stakeMinor)}${dirty ? ' · edits need confirmation' : ''}`
            : 'If hit: your bet is lost. If safe: your bet returns + a share of the bank.'}
        </span>
        {fleet && stage === 'choose' ? (
          <button type="button" disabled={!canBet} onClick={cancel}>
            Cancel bet
          </button>
        ) : !fleet && stage === 'choose' && lastFleet ? (
          <button
            type="button"
            className="gd-repeat"
            disabled={!canBet}
            onClick={() => {
              setDraft(null);
              setStake(Math.min(maxMinor, Math.max(min, lastFleet.stakeMinor)));
              select(lastFleet.primaryZone);
            }}
          >
            Repeat Harbor {lastFleet.primaryZone + 1} · {fmt(lastFleet.stakeMinor)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
