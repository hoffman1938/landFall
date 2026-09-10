import { useEffect, useState } from 'react';
import { REVEAL_TIMELINE, stageAt, type RevealStage } from './revealStages';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Walks the reveal beats for the round that landed at `landfallAt`.
 *
 * Driven by one timeout per beat rather than by the dashboard's 200ms tick: a
 * beat that can arrive up to 200ms late reads as a stutter, and the whole point
 * of the ladder is that it feels deliberate. A round that landed before this
 * component mounted (a reconnect, a tab returning to the foreground) starts at
 * whichever beat it has already reached, so nothing replays stale suspense.
 */
export function useRevealStage(landfallAt: number | null): RevealStage {
  const [stage, setStage] = useState<RevealStage>(() =>
    landfallAt === null ? 'bonus' : stageAt(Date.now() - landfallAt, prefersReducedMotion()),
  );

  useEffect(() => {
    if (landfallAt === null) {
      setStage('bonus');
      return;
    }
    const reduced = prefersReducedMotion();
    const elapsed = Date.now() - landfallAt;
    setStage(stageAt(elapsed, reduced));
    if (reduced) return;

    const timers = REVEAL_TIMELINE.filter((beat) => beat.atMs > elapsed).map((beat) =>
      window.setTimeout(() => setStage(beat.stage), beat.atMs - elapsed),
    );
    return () => timers.forEach(clearTimeout);
  }, [landfallAt]);

  return stage;
}
