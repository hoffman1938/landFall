import { useState } from 'react';
import { RANDOM_ROOM, type RoomInfo } from '@landfall/core';
import { fmt } from '../../store';
import { LIQUIDITY_WORD, preselectedRoomId, tableOptions } from '../../tableChoice';
import { GameDialog } from './GameDialogs';

/**
 * The entry gate's table step.
 *
 * The stake tier decides what a round costs and whose money a payout is made
 * of, and until now nobody ever chose it: the server seated you and the
 * dashboard closed the gate on your behalf. This asks, once, before the first
 * bet — with the range, the population and what the balance actually covers
 * attached to each row, so the answer is informed rather than a guess.
 *
 * The current table is preselected, so a refresh costs one confirming tap.
 */
export function TableChooser({
  rooms,
  currentRoomId,
  balanceMinor,
  onChoose,
  onBack,
}: {
  rooms: readonly RoomInfo[];
  currentRoomId: string | null;
  balanceMinor: number;
  onChoose(roomId: string): void;
  onBack?: (() => void) | undefined;
}) {
  const [picked, setPicked] = useState<string | null>(() =>
    preselectedRoomId(rooms, currentRoomId, balanceMinor),
  );
  const options = tableOptions(rooms, currentRoomId, balanceMinor);
  const chosen = options.find((o) => o.roomId === picked);
  const ready = chosen?.affordable === true;

  return (
    <GameDialog
      title="Choose your table"
      onClose={() => onBack?.()}
      dismissible={onBack !== undefined}
    >
      <p className="gd-guide-intro">
        Every table is a separate game with its own rounds and its own money.{' '}
        <strong>Your bet only ever mixes with players at the same table</strong> — a 5-credit bet
        never shares a pool with a 5,000-credit one.
      </p>

      <div className="gd-table-list" role="radiogroup" aria-label="Stake tables">
        {rooms.length === 0 && <p className="gd-empty">Loading tables…</p>}
        {options.map((option) => (
          <button
            type="button"
            key={option.roomId}
            role="radio"
            aria-checked={picked === option.roomId}
            disabled={!option.affordable}
            onClick={() => setPicked(option.roomId)}
            className={`gd-table-row ${picked === option.roomId ? 'is-picked' : ''}`}
          >
            <span className="gd-table-main">
              <strong>{option.name}</strong>
              <em>
                {fmt(option.minStakeMinor)} – {fmt(option.maxStakeMinor)} per round
              </em>
            </span>
            <span className="gd-table-meta">
              {option.current && <i className="gd-tag-current">Current</i>}
              {option.suggested && !option.current && <i className="gd-tag-start">Best to start</i>}
              <span className={`gd-table-pop is-${option.liquidity}`}>
                {LIQUIDITY_WORD[option.liquidity]}
                <b>
                  {option.humanCount} {option.humanCount === 1 ? 'player' : 'players'}
                </b>
              </span>
            </span>
            <span className="gd-table-afford">
              {option.affordable
                ? `Your balance covers ${option.betsAffordable.toLocaleString()} bets at the minimum`
                : `Needs ${fmt(option.minStakeMinor)} to play a round`}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="gd-primary is-ready"
        disabled={!ready}
        onClick={() => picked && onChoose(picked)}
      >
        {chosen ? `Play at ${chosen.name}` : 'Choose a table'}
      </button>

      {/*
        RANDOM PLACEMENT, as an option rather than a description.

        Order 243 Annex 1 Art. 13(b) requires a Peer-to-Peer system to "give the
        player the possibility to be placed at a gaming table on a random basis",
        and GLI-19 §4.11.1(b) asks for the same. Disclosing the default routing
        rule — which the game-information dialog does — does not satisfy a clause
        that requires the option to exist.

        The server resolves it, over the tables this balance can actually afford;
        "at random" cannot mean "at a table you cannot play".
      */}
      <button
        type="button"
        className="gd-secondary-link"
        disabled={!options.some((o) => o.affordable)}
        onClick={() => onChoose(RANDOM_ROOM)}
      >
        Or seat me at a random table
      </button>

      <p className="gd-fine-print">
        You can change tables from the Menu at any time between rounds. Virtual credits only.
      </p>
    </GameDialog>
  );
}
