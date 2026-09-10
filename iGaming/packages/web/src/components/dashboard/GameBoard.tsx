import type { CSSProperties } from 'react';
import type { FleetPlanPublic, PoolsState, TideReport } from '@landfall/core';
import type { LandfallInfo } from '../../store';
import { fmt } from '../../store';
import { personalResult } from '../../simpleGameModel';
import { crowdCells, harborOutcomes, type HarborOutcome } from '../../payoutPreview';
import { atLeast, loudness, type RevealStage } from '../../revealStages';
import { CheckIcon, LockIcon } from '../icons';

const ZONES = [0, 1, 2, 3, 4, 5];

export interface GameBoardProps {
  stage: 'choose' | 'storm' | 'result';
  seconds: number;
  connected: boolean;
  roundId: number | null;
  selected: number | null;
  placed: number[];
  canSelect: boolean;
  betLocked: boolean;
  result: LandfallInfo | null;
  /** Exact per-harbor pools; published at lock, null while bets are open. */
  pools: PoolsState | null;
  /** Banded crowd, the only crowd information that exists while bets are open. */
  tideReport: TideReport | null;
  fleet: FleetPlanPublic | null;
  rakeBp: number | null;
  /** Which beat of the reveal the result is on. */
  reveal: RevealStage;
  onSelect(zone: number): void;
}

function signed(minor: number): string {
  return `${minor >= 0 ? '+' : '−'}${fmt(Math.abs(minor))}`;
}

/**
 * The six harbors, and — this is the part that was missing — what each one is
 * worth to the player right now.
 *
 * A LANDFALL round has always had two independent questions in it: WHICH harbor
 * the storm takes (a flat 1/6 nobody can influence) and HOW MUCH that pays
 * (pari-mutuel, decided by where the room's money sits). The board used to show
 * only the first, so an identical 5.00 bet returning +0.08 one round and +12.40
 * the next looked arbitrary. Now the second question is on screen too: a crowd
 * meter while bets are open, and once the lock snapshot publishes exact pools,
 * the precise net each harbor pays you. Six concrete numbers, one about to
 * become real — the anticipation is the truth, not a device layered over it.
 */
export function GameBoard({
  stage,
  seconds,
  connected,
  roundId,
  selected,
  placed,
  canSelect,
  betLocked,
  result,
  pools,
  tideReport,
  fleet,
  rakeBp,
  reveal,
  onSelect,
}: GameBoardProps) {
  const receipt = result ? personalResult(result) : null;
  const revealed = stage !== 'result' || atLeast(reveal, 'harbor');
  const outcomeShown = stage === 'result' && atLeast(reveal, 'outcome');
  const loud = loudness(result?.eventTier?.id ?? null);

  // Exact per-harbor payouts, available from the lock snapshot onward. With a
  // bet on the table each cell shows YOUR net; watching without one, it shows
  // the harbor's bank, so a spectator learns the same rule.
  const outcomes = harborOutcomes({ pools, fleet, rakeBp });
  const previewOn = stage === 'storm' && outcomes !== null;
  const betting = fleet !== null;
  const crowd = stage === 'choose' ? crowdCells(tideReport) : null;

  const title = !connected
    ? 'Reconnecting…'
    : !roundId
      ? 'Joining the table…'
      : stage === 'choose'
        ? placed.length
          ? betLocked
            ? 'Your bet is locked'
            : 'Your bet is placed'
          : betLocked
            ? 'Watching this round'
            : 'Choose a harbor'
        : stage === 'storm'
          ? previewOn && betting
            ? 'One of these is about to be hit'
            : 'Watch the storm'
          : !result
            ? 'Receiving the result…'
            : !revealed
              ? 'The storm is landing…'
              : !receipt?.played || !outcomeShown
                ? `Harbor ${result.struckZone + 1} was hit`
                : result.yourResult.outcome === 'WRECKED'
                  ? 'Your harbor was hit'
                  : result.yourResult.outcome === 'SPLIT'
                    ? 'Part of your bet was hit'
                    : 'Your harbor is safe';

  const subtitle = !connected
    ? 'Waiting for the server. Your accepted bet stays in the round.'
    : stage === 'choose'
      ? placed.length
        ? betLocked
          ? 'Your final change is confirmed. Waiting for the storm.'
          : 'Your accepted bet stays in place until you confirm a change.'
        : betLocked
          ? 'Your cancellation is confirmed. No bet is active.'
          : 'Select one, then confirm your bet below.'
      : stage === 'storm'
        ? previewOn && betting
          ? 'Bets are closed. Each harbor now shows what it pays you if the storm picks it.'
          : previewOn
            ? 'Bets are closed. Each harbor now shows the bank it hands to survivors if it is hit.'
            : 'Bets are closed. One harbor will be hit; five will stay safe.'
        : !revealed
          ? 'Reading the strike…'
          : receipt?.played
            ? `The storm hit Harbor ${result!.struckZone + 1}. This is your settled result.`
            : result
              ? 'You watched this round. No credits were staked.'
              : 'The server is confirming this round.';

  const figure =
    !connected || !roundId
      ? '—'
      : stage === 'result' && result
        ? !revealed
          ? '··'
          : receipt?.played && outcomeShown
            ? signed(receipt.netMinor)
            : String(result.struckZone + 1).padStart(2, '0')
        : String(seconds).padStart(2, '0');

  const label = !connected
    ? 'CONNECTION LOST'
    : stage === 'choose'
      ? 'SECONDS TO BET'
      : stage === 'storm'
        ? 'SECONDS TO REVEAL'
        : !revealed
          ? 'LANDING'
          : receipt?.played && outcomeShown
            ? 'NET RESULT · CREDITS'
            : 'HARBOR HIT';

  const ring =
    stage === 'choose'
      ? Math.min(1, seconds / 10)
      : stage === 'storm'
        ? Math.min(1, seconds / 5)
        : 1;

  const tone =
    stage === 'result' && receipt?.played && outcomeShown && receipt.netMinor > 0
      ? 'positive'
      : stage !== 'choose'
        ? 'storm'
        : '';

  const boost =
    !!receipt &&
    receipt.multiplier > 1 &&
    receipt.played &&
    receipt.returnedStakeMinor !== 0 &&
    atLeast(reveal, 'bonus');

  const caption =
    stage === 'storm'
      ? previewOn && betting
        ? 'Payouts at the base share — rounding and any Share × bonus can only raise them.'
        : previewOn
          ? 'One harbor is hit · survivors split its bank in proportion to their bets'
          : 'One harbor is hit · every harbor has the same 1-in-6 chance'
      : stage === 'choose'
        ? 'The busier a harbor, the bigger the bank it hands out when the storm hits it.'
        : '1 hit · 5 safe · equal chances for every harbor';

  return (
    <section
      className={`gd-board gd-board--${stage} gd-loud--${loud} ${
        stage === 'result' ? `gd-reveal--${reveal}` : ''
      }`}
      aria-label="Harbor game board"
    >
      <header className="gd-board-heading" aria-live="polite" aria-atomic="true">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </header>
      <div className="gd-field">
        <div className="gd-coordinates" aria-hidden="true">
          <span>A</span>
          <span>B</span>
          <span>C</span>
          <span>D</span>
          <span>E</span>
          <span>F</span>
        </div>
        <svg
          className={`gd-trajectory ${stage === 'storm' ? 'is-running' : ''}`}
          viewBox="0 0 800 400"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M230 45 C240 110 520 20 540 195 S575 300 580 352" pathLength="100" />
        </svg>
        <div className="gd-harbors" role="group" aria-label="Choose one of six harbors">
          {ZONES.map((zone) => (
            <Harbor
              key={zone}
              zone={zone}
              stage={stage}
              selected={selected === zone}
              yours={placed.includes(zone)}
              canSelect={canSelect}
              result={revealed ? result : null}
              outcome={previewOn ? (outcomes?.[zone] ?? null) : null}
              betting={betting}
              crowd={crowd?.[zone] ?? null}
              onSelect={onSelect}
            />
          ))}
        </div>
        <div className={`gd-readout ${tone}`} aria-live="off">
          <svg className="gd-count-ring" viewBox="0 0 220 220" aria-hidden="true">
            <circle cx="110" cy="110" r="102" />
            <circle
              cx="110"
              cy="110"
              r="102"
              pathLength="100"
              strokeDasharray={`${ring * 100} 100`}
            />
          </svg>
          <div
            className={`gd-number ${figure.length > 7 ? 'gd-number--long' : ''}`}
            key={`${stage}-${result?.roundId ?? ''}-${outcomeShown}`}
          >
            {figure}
          </div>
          <span className="gd-readout-label">{label}</span>
          {outcomeShown && receipt?.played && receipt.totalReturnMinor !== null && (
            <span className="gd-readout-return">Returned {fmt(receipt.totalReturnMinor)}</span>
          )}
          {boost && (
            <div
              className="gd-boost"
              key={`boost-${result!.roundId}`}
              style={{ '--boost-delay': '0ms' } as CSSProperties}
            >
              SHARE ×{receipt.multiplier}
              {receipt.powerCapped ? ' · CAPPED' : ''}
            </div>
          )}
        </div>
      </div>
      {/*
        In the board's own flow rather than pinned to the bottom of the field:
        a round announcement (jackpot, play break) squeezes the panel, and an
        absolutely-positioned caption then slid out from under the field and
        printed itself across the announcement.
      */}
      <span className="gd-field-caption">{caption}</span>
    </section>
  );
}

/** One harbor: identity, your stake, and its live meaning for this round. */
function Harbor({
  zone,
  stage,
  selected,
  yours,
  canSelect,
  result,
  outcome,
  betting,
  crowd,
  onSelect,
}: {
  zone: number;
  stage: 'choose' | 'storm' | 'result';
  selected: boolean;
  yours: boolean;
  canSelect: boolean;
  result: LandfallInfo | null;
  outcome: HarborOutcome | null;
  /** True when the player has a stake in this round, so the number is their net. */
  betting: boolean;
  crowd: { fill: number; word: string; boatCount: number; frozen: boolean } | null;
  onSelect(zone: number): void;
}) {
  const hit = result?.struckZone === zone;
  const safe = result !== null && !hit;
  const status = hit
    ? 'HIT'
    : safe
      ? 'SAFE'
      : yours
        ? 'YOUR BET'
        : selected
          ? 'SELECTED'
          : stage === 'choose'
            ? ''
            : 'WAITING';

  // Storm window. With a bet on the table the number is YOUR net if this harbor
  // is struck — the sign carries the meaning, and your own harbor is the only
  // one that can read red. Watching without a bet, it is the harbor's bank.
  const preview = outcome ? (betting ? signed(outcome.netMinor) : fmt(outcome.bankMinor)) : null;

  const ariaExtra = hit
    ? ', hit'
    : safe
      ? ', safe'
      : outcome
        ? betting
          ? `, pays ${outcome.netMinor >= 0 ? 'plus' : 'minus'} ${fmt(Math.abs(outcome.netMinor))} if hit`
          : `, bank ${fmt(outcome.bankMinor)}`
        : crowd
          ? `, crowd ${crowd.word.toLowerCase()}`
          : '';

  return (
    <button
      type="button"
      aria-label={`Harbor ${zone + 1}${yours ? ', your bet' : ''}${ariaExtra}`}
      aria-pressed={selected || yours}
      disabled={!canSelect}
      onClick={() => onSelect(zone)}
      className={`gd-harbor gd-harbor--${zone} ${selected ? 'is-selected' : ''} ${
        yours ? 'is-placed' : ''
      } ${hit ? 'is-hit' : safe ? 'is-safe' : ''}`}
    >
      <span className="gd-harbor-id">
        <strong>{String(zone + 1).padStart(2, '0')}</strong>
        <span>Harbor {zone + 1}</span>
      </span>

      {/*
        One row, not two. The cell has room for the harbor's identity and one
        line of meaning; stacking the meter, the payout and the status made the
        content taller than its grid row and spilled it over the card's edges.
      */}
      <span className="gd-harbor-foot">
        {preview !== null ? (
          <span
            className={`gd-harbor-payout ${
              !betting
                ? ''
                : outcome!.netMinor > 0
                  ? 'is-win'
                  : outcome!.netMinor < 0
                    ? 'is-loss'
                    : ''
            }`}
          >
            <em>{preview}</em>
            <i>{betting ? 'if hit' : 'bank'}</i>
          </span>
        ) : crowd ? (
          <span className="gd-harbor-crowd" title={`${crowd.boatCount} players here`}>
            <span className="gd-crowd-track" aria-hidden="true">
              <span className="gd-crowd-fill" style={{ width: `${crowd.fill * 100}%` }} />
            </span>
            <i>{crowd.word}</i>
          </span>
        ) : (
          <span />
        )}
        <small>
          {yours ? <LockIcon size={11} /> : selected || safe ? <CheckIcon size={11} /> : null}
          {status}
        </small>
      </span>
    </button>
  );
}
