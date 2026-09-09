/**
 * "Is the board too short for the full-size chrome?"
 *
 * One hook, one threshold, shared by everything that has to shrink together.
 * The threshold is `coveLayout.SHORT_BOARD_HEIGHT` because that is where the
 * layout stops reserving a full clock band and starts reserving a chip-sized
 * one — if the clock and the result card did not agree with the layout about
 * where that line is, they would go back to landing on the harbors.
 *
 * A phone held sideways is the case this exists for: ~360px of viewport, of
 * which the header takes 57 and the deck about 120.
 */
import { useEffect, useState } from 'react';
import {
  CENTRED_CLOCK_MIN_WIDTH,
  CLOCK_BAND_PX,
  CLOCK_CHIP_BAND_PX,
  SHORT_BOARD_HEIGHT,
} from './coveLayout';

/** Viewport height below which the board is "short". Board + header. */
const QUERY = `(max-height: ${SHORT_BOARD_HEIGHT + 56}px)`;

export function useShortViewport(): boolean {
  const [short, setShort] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    const q = window.matchMedia(QUERY);
    const update = () => setShort(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return short;
}

const WIDE_QUERY = `(min-width: ${CENTRED_CLOCK_MIN_WIDTH}px)`;

/**
 * The pixels at the top of the board the clock occupies right now.
 *
 * The round's overlay column is anchored above the deck and grows UPWARD, so
 * without a stop it climbs into the clock: on a 740x360 board the tide report
 * drew its headline straight through the clock chip's countdown. Reserving the
 * same band the layout reserves keeps one number in charge of that edge.
 */
export function useBoardTopBand(): number {
  const short = useShortViewport();
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches,
  );
  useEffect(() => {
    const q = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  if (wide) return 0; // the clock is board-centred and the column clears it
  return short ? CLOCK_CHIP_BAND_PX : CLOCK_BAND_PX;
}
