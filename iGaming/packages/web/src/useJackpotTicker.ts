import { useEffect, useRef, useState } from 'react';
import { JACKPOT_TICK_MS, shouldAnimate, tickValue } from './jackpotTicker';

function framesAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hidden = typeof document !== 'undefined' && document.hidden;
  return !reduced && !hidden;
}

/**
 * Counts the jackpot up to `targetMinor`; see ./jackpotTicker.ts for when it
 * does not move at all.
 *
 * However the run ends — finished, interrupted by the next round, or cut off
 * because the tab went to the background mid-climb — the last thing this hook
 * does is show the real published number. An animation is allowed to be
 * skipped; it is never allowed to leave a wrong figure on screen.
 */
export function useJackpotTicker(targetMinor: number, roomId: string | null): number {
  const [shown, setShown] = useState(targetMinor);
  const previous = useRef({ value: targetMinor, roomId });

  useEffect(() => {
    const from = previous.current.value;
    const sameTable = previous.current.roomId === roomId;
    previous.current = { value: targetMinor, roomId };

    if (
      !shouldAnimate({
        sameTable,
        fromMinor: from,
        toMinor: targetMinor,
        framesAvailable: framesAvailable(),
      })
    ) {
      setShown(targetMinor);
      return;
    }

    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const t = (now - started) / JACKPOT_TICK_MS;
      if (t >= 1) {
        setShown(targetMinor);
        return;
      }
      setShown(tickValue(from, targetMinor, t));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      setShown(targetMinor);
    };
  }, [targetMinor, roomId]);

  return shown;
}
