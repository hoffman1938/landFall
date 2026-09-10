/**
 * The reveal, in beats.
 *
 * The old result appeared whole: the LANDFALL message arrived and the screen
 * was already the answer. Nothing was hidden and nothing was wrong, but the
 * most interesting three seconds of the round were spent on a fait accompli.
 *
 * The structure borrowed here is the one every good reveal uses — the storm
 * lands, THEN you learn which harbor, THEN what it cost or paid you, and only
 * then whether a bonus multiplied it. Same data, same instant, ordered so a
 * person can follow it. No beat withholds anything the player could act on:
 * the round is already settled and the balance is already correct.
 *
 * Timings fit inside the 3s RESOLVED phase with room to spare, and the whole
 * ladder collapses to beat 0 under `prefers-reduced-motion` — a player who has
 * asked for less motion is asking for the answer, not for suspense.
 */
export type RevealStage = 'impact' | 'harbor' | 'outcome' | 'bonus';

/** Milliseconds after LANDFALL at which each beat starts. */
export const REVEAL_TIMELINE: { stage: RevealStage; atMs: number }[] = [
  { stage: 'impact', atMs: 0 },
  { stage: 'harbor', atMs: 420 },
  { stage: 'outcome', atMs: 900 },
  { stage: 'bonus', atMs: 1500 },
];

const ORDER: RevealStage[] = ['impact', 'harbor', 'outcome', 'bonus'];

export function stageIndex(stage: RevealStage): number {
  return ORDER.indexOf(stage);
}

/** Has the reveal reached `stage` yet? */
export function atLeast(current: RevealStage, stage: RevealStage): boolean {
  return stageIndex(current) >= stageIndex(stage);
}

/** Which beat a reveal that started `elapsedMs` ago is on. */
export function stageAt(elapsedMs: number, reducedMotion = false): RevealStage {
  if (reducedMotion) return 'bonus';
  let current: RevealStage = 'impact';
  for (const beat of REVEAL_TIMELINE) {
    if (elapsedMs >= beat.atMs) current = beat.stage;
  }
  return current;
}

/**
 * How loud this round's landing is. The tier is the server's own presentation
 * draw (its own HMAC domain, independent of the harbor draw by construction),
 * so a Tempest is a real, verifiable 1-in-20 event rather than a flourish the
 * client invented for a big win.
 */
export type Loudness = 'calm' | 'heavy' | 'tempest';

export function loudness(tierId: string | null | undefined): Loudness {
  return tierId === 'TEMPEST' ? 'tempest' : tierId === 'SURGE' ? 'heavy' : 'calm';
}

/**
 * Does this result deserve the full-screen moment?
 *
 * Deliberately narrow. A celebration that fires on an ordinary win is noise
 * within two minutes, and a celebration that fires on a LOSS is the pattern
 * this codebase refuses to ship. It takes a rare, externally-drawn event:
 * a Share x bonus above the x1 floor on a win you actually collected, the
 * jackpot, or a Tempest round you survived with a profit.
 */
export function isBigMoment(input: {
  played: boolean;
  netMinor: number;
  multiplier: number;
  jackpotMinor: number;
  loudness: Loudness;
}): boolean {
  if (!input.played || input.netMinor <= 0) return false;
  if (input.jackpotMinor > 0) return true;
  if (input.multiplier >= 2) return true;
  return input.loudness === 'tempest';
}
