import { useEffect, useState } from 'react';
import { fmt } from '../../store';

/**
 * The rare one.
 *
 * Almost every round ends in the readout and nowhere else — that restraint is
 * what buys this element its meaning. It appears only for outcomes the server
 * drew as genuinely rare (`isBigMoment` in ../../revealStages.ts): a Share ×
 * bonus above the ×1 floor, the Storm Surge jackpot, or a 1-in-20 Tempest you
 * came out of ahead. It never fires on a loss, and it never invents an event
 * the round did not contain.
 *
 * It also never blocks the game: no backdrop, no focus trap, no dismiss button
 * to hunt for. It rides above the board for two seconds and leaves before the
 * next betting window opens.
 */
export function BigMoment({
  headline,
  netMinor,
  detail,
  roundId,
}: {
  headline: string;
  netMinor: number;
  detail: string;
  roundId: number;
}) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    setGone(false);
    const t = window.setTimeout(() => setGone(true), 2200);
    return () => clearTimeout(t);
  }, [roundId]);
  if (gone) return null;

  return (
    <div className="gd-big-moment" role="status" key={roundId}>
      <span className="gd-big-label">{headline}</span>
      <strong>
        +{fmt(netMinor)}
        <em>credits</em>
      </strong>
      <span className="gd-big-detail">{detail}</span>
    </div>
  );
}
