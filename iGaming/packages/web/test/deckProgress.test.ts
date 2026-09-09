/**
 * D5 acceptance: a fresh profile sees ≤ 3 control groups; unlock triggers fire
 * per the schedule; unlocks are monotonic; experts are never re-gated;
 * pre-D5 profiles are grandfathered.
 */
import { describe, expect, it } from 'vitest';
import {
  FLAG_UNLOCK_ROUNDS,
  MODE_UNLOCK_ROUNDS,
  freshDeckProgress,
  grandfatheredDeckProgress,
  resolveDisclosure,
  withExpert,
  withModesUnlockedByTap,
  withRivalFlagSeen,
  withRoundCompleted,
  withStakeEdited,
} from '../src/deckProgress';

function afterRounds(n: number) {
  let p = freshDeckProgress();
  for (let i = 1; i <= n; i++) p = withRoundCompleted(p, 1000 + i);
  return p;
}

describe('progressive deck disclosure (D5)', () => {
  it('a fresh profile sees only stepper + presets + primary (no extra groups)', () => {
    const d = resolveDisclosure(freshDeckProgress());
    expect(d).toEqual({
      showModeToggle: false,
      showModeTeaser: false,
      showFlags: false,
      showStakeTricks: false,
    });
  });

  it('the dimmed mode teaser appears after the first completed round', () => {
    expect(resolveDisclosure(afterRounds(1)).showModeTeaser).toBe(true);
    expect(resolveDisclosure(afterRounds(1)).showModeToggle).toBe(false);
  });

  it(`Focus/Split unlocks after ${MODE_UNLOCK_ROUNDS} completed rounds`, () => {
    expect(resolveDisclosure(afterRounds(MODE_UNLOCK_ROUNDS - 1)).showModeToggle).toBe(false);
    const d = resolveDisclosure(afterRounds(MODE_UNLOCK_ROUNDS));
    expect(d.showModeToggle).toBe(true);
    expect(d.showModeTeaser).toBe(false);
  });

  it('tapping the dimmed toggle unlocks Focus/Split early', () => {
    const d = resolveDisclosure(withModesUnlockedByTap(afterRounds(1)));
    expect(d.showModeToggle).toBe(true);
    expect(d.showModeTeaser).toBe(false);
  });

  it(`flags unlock after ${FLAG_UNLOCK_ROUNDS} rounds or on the first rival flag`, () => {
    expect(resolveDisclosure(afterRounds(FLAG_UNLOCK_ROUNDS - 1)).showFlags).toBe(false);
    expect(resolveDisclosure(afterRounds(FLAG_UNLOCK_ROUNDS)).showFlags).toBe(true);
    expect(resolveDisclosure(withRivalFlagSeen(freshDeckProgress())).showFlags).toBe(true);
  });

  it('×2/½/MAX appear once the stake is first edited', () => {
    expect(resolveDisclosure(freshDeckProgress()).showStakeTricks).toBe(false);
    expect(resolveDisclosure(withStakeEdited(freshDeckProgress())).showStakeTricks).toBe(true);
  });

  it('the same round never counts twice (reconnects, remounts)', () => {
    let p = freshDeckProgress();
    p = withRoundCompleted(p, 42);
    p = withRoundCompleted(p, 42);
    expect(p.roundsCompleted).toBe(1);
    p = withRoundCompleted(p, 43);
    expect(p.roundsCompleted).toBe(2);
  });

  it('expert mode shows everything immediately', () => {
    const d = resolveDisclosure(withExpert(freshDeckProgress(), true));
    expect(d).toEqual({
      showModeToggle: true,
      showModeTeaser: false,
      showFlags: true,
      showStakeTricks: true,
    });
  });

  it('turning expert off never re-gates organically earned unlocks', () => {
    let p = afterRounds(FLAG_UNLOCK_ROUNDS);
    p = withStakeEdited(p);
    p = withExpert(withExpert(p, true), false);
    const d = resolveDisclosure(p);
    expect(d.showModeToggle).toBe(true);
    expect(d.showFlags).toBe(true);
    expect(d.showStakeTricks).toBe(true);
  });

  it('pre-D5 profiles are grandfathered fully unlocked', () => {
    const d = resolveDisclosure(grandfatheredDeckProgress());
    expect(d.showModeToggle).toBe(true);
    expect(d.showFlags).toBe(true);
    expect(d.showStakeTricks).toBe(true);
  });

  it('transitions are no-ops (same reference) when nothing changes', () => {
    const p = withStakeEdited(freshDeckProgress());
    expect(withStakeEdited(p)).toBe(p);
    const q = withRivalFlagSeen(freshDeckProgress());
    expect(withRivalFlagSeen(q)).toBe(q);
    expect(withExpert(p, false)).toBe(p);
  });
});
