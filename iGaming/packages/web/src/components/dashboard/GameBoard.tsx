import type { CSSProperties } from 'react';
import type { LandfallInfo } from '../../store';
import { fmt } from '../../store';
import { personalResult } from '../../simpleGameModel';
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
  onSelect(zone: number): void;
}

/** The six buttons stay in place through selection, the storm and the receipt. */
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
  onSelect,
}: GameBoardProps) {
  const receipt = result ? personalResult(result) : null;
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
          ? 'Watch the storm'
          : !result
            ? 'Receiving the result…'
            : !receipt?.played
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
        ? 'Bets are closed. One harbor will be hit; five will stay safe.'
        : receipt?.played
          ? `The storm hit Harbor ${result!.struckZone + 1}. This is your settled result.`
          : result
            ? 'You watched this round. No credits were staked.'
            : 'The server is confirming this round.';
  const figure =
    !connected || !roundId
      ? '—'
      : stage === 'result' && result
        ? receipt?.played
          ? `${receipt.netMinor >= 0 ? '+' : '−'}${fmt(Math.abs(receipt.netMinor))}`
          : String(result.struckZone + 1).padStart(2, '0')
        : String(seconds).padStart(2, '0');
  const label = !connected
    ? 'CONNECTION LOST'
    : stage === 'choose'
      ? 'SECONDS TO BET'
      : stage === 'storm'
        ? 'SECONDS TO REVEAL'
        : receipt?.played
          ? 'NET RESULT · CREDITS'
          : 'HARBOR HIT';
  const ring =
    stage === 'choose'
      ? Math.min(1, seconds / 10)
      : stage === 'storm'
        ? Math.min(1, seconds / 5)
        : 1;
  const tone =
    stage === 'result' && receipt?.played && receipt.netMinor > 0
      ? 'positive'
      : stage !== 'choose'
        ? 'storm'
        : '';
  const boost =
    !!receipt && receipt.multiplier > 1 && receipt.played && receipt.returnedStakeMinor !== 0;

  return (
    <section className={`gd-board gd-board--${stage}`} aria-label="Harbor game board">
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
          {ZONES.map((zone) => {
            const hit = result?.struckZone === zone;
            const safe = result !== null && !hit;
            const yours = placed.includes(zone);
            const chosen = selected === zone;
            const status = hit
              ? 'HIT'
              : safe
                ? 'SAFE'
                : yours
                  ? 'YOUR BET'
                  : chosen
                    ? 'SELECTED'
                    : stage === 'choose'
                      ? ''
                      : 'WAITING';
            return (
              <button
                type="button"
                key={zone}
                aria-label={`Harbor ${zone + 1}${yours ? ', your bet' : ''}${hit ? ', hit' : safe ? ', safe' : ''}`}
                aria-pressed={chosen || yours}
                disabled={!canSelect}
                onClick={() => onSelect(zone)}
                className={`gd-harbor gd-harbor--${zone} ${chosen ? 'is-selected' : ''} ${yours ? 'is-placed' : ''} ${hit ? 'is-hit' : safe ? 'is-safe' : ''}`}
              >
                <strong>{String(zone + 1).padStart(2, '0')}</strong>
                <span>Harbor {zone + 1}</span>
                <small>
                  {yours ? <LockIcon size={11} /> : chosen || safe ? <CheckIcon size={11} /> : null}
                  {status}
                </small>
              </button>
            );
          })}
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
            key={`${stage}-${result?.roundId ?? ''}`}
          >
            {figure}
          </div>
          <span className="gd-readout-label">{label}</span>
          {stage === 'result' && receipt?.played && receipt.totalReturnMinor !== null && (
            <span className="gd-readout-return">Returned {fmt(receipt.totalReturnMinor)}</span>
          )}
          {boost && (
            <div
              className="gd-boost"
              key={`boost-${result!.roundId}`}
              style={{ '--boost-delay': '450ms' } as CSSProperties}
            >
              SHARE ×{receipt.multiplier}
              {receipt.powerCapped ? ' · CAPPED' : ''}
            </div>
          )}
        </div>
        <span className="gd-field-caption">
          {stage === 'storm'
            ? 'Storm animation · every harbor has the same chance'
            : '1 hit · 5 safe · equal chances for every harbor'}
        </span>
      </div>
    </section>
  );
}
