import { fmt } from '../../store';
import { useJackpotTicker } from '../../useJackpotTicker';

/**
 * The table's jackpot, on screen every round.
 *
 * The Storm Surge pot is fed by a share of every round's rake and paid out
 * whole to one surviving player on a jackpot round — roughly one round in
 * twenty-five. The dashboard only ever mentioned it ON that round, so for the
 * other twenty-four the pot grew invisibly and a player could sit at a table
 * for ten minutes without learning it existed.
 *
 * It is calm by default and fills only on the round it can actually pay out.
 * That restraint is the point: a meter that shouts every round is one players
 * learn to stop reading, and this one has something real to say 4% of the time.
 */
export function JackpotMeter({
  potMinor,
  live,
  tableName,
  roomId,
  onExplain,
}: {
  potMinor: number;
  /** This round is a jackpot round — the pot can be paid out now. */
  live: boolean;
  tableName: string | null;
  roomId: string | null;
  onExplain(): void;
}) {
  const shown = useJackpotTicker(potMinor, roomId);
  return (
    <button
      type="button"
      className={`gd-jackpot ${live ? 'is-live' : ''}`}
      onClick={onExplain}
      title={
        live
          ? `${tableName ?? 'This table'} jackpot — one safe player here wins the whole pot this round.`
          : `${tableName ?? 'This table'} jackpot. Every table has its own, built only from rounds played here, and it grows until a jackpot round pays it out.`
      }
      aria-label={`${tableName ?? 'Table'} jackpot ${fmt(potMinor)} credits${
        live ? ', live this round' : ''
      }. How it works.`}
    >
      <small>JACKPOT{live ? '' : ' · GROWING'}</small>
      <strong>{fmt(shown)}</strong>
      {live && <i>LIVE</i>}
    </button>
  );
}
