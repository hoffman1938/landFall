import { describe, expect, it } from 'vitest';
import { atLeast, isBigMoment, loudness, stageAt } from '../src/revealStages';

describe('reveal beats', () => {
  it('walks impact -> harbor -> outcome -> bonus as time passes', () => {
    expect(stageAt(0)).toBe('impact');
    expect(stageAt(419)).toBe('impact');
    expect(stageAt(420)).toBe('harbor');
    expect(stageAt(899)).toBe('harbor');
    expect(stageAt(900)).toBe('outcome');
    expect(stageAt(1500)).toBe('bonus');
    expect(stageAt(60_000)).toBe('bonus');
  });

  it('hands the whole answer straight to a reduced-motion player', () => {
    expect(stageAt(0, true)).toBe('bonus');
  });

  it('orders the beats so a later beat implies every earlier one', () => {
    expect(atLeast('outcome', 'harbor')).toBe(true);
    expect(atLeast('outcome', 'bonus')).toBe(false);
    expect(atLeast('bonus', 'impact')).toBe(true);
  });

  it('maps the server event tier onto how loud the landing is', () => {
    expect(loudness('TEMPEST')).toBe('tempest');
    expect(loudness('SURGE')).toBe('heavy');
    expect(loudness('CALM')).toBe('calm');
    expect(loudness(null)).toBe('calm');
    expect(loudness(undefined)).toBe('calm');
  });
});

describe('the rare moment', () => {
  const base = {
    played: true,
    netMinor: 500,
    multiplier: 1,
    jackpotMinor: 0,
    loudness: 'calm' as const,
  };

  it('stays away from ordinary wins, losses and spectated rounds', () => {
    expect(isBigMoment(base)).toBe(false);
    expect(isBigMoment({ ...base, netMinor: -500, multiplier: 5 })).toBe(false);
    expect(isBigMoment({ ...base, netMinor: 0, multiplier: 5 })).toBe(false);
    expect(isBigMoment({ ...base, played: false, multiplier: 5 })).toBe(false);
    // A Tempest you lost is still a loss, however loud the sky was.
    expect(isBigMoment({ ...base, netMinor: -500, loudness: 'tempest' })).toBe(false);
  });

  it('fires on a bonus, the jackpot, or a Tempest survived at a profit', () => {
    expect(isBigMoment({ ...base, multiplier: 2 })).toBe(true);
    expect(isBigMoment({ ...base, jackpotMinor: 50_000 })).toBe(true);
    expect(isBigMoment({ ...base, loudness: 'tempest' })).toBe(true);
    // The x1.25 rung is common enough to belong in the readout, not on top of it.
    expect(isBigMoment({ ...base, multiplier: 1.25 })).toBe(false);
  });
});
