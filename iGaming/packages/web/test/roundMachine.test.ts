import { describe, expect, it } from 'vitest';
import {
  IMPACT_MS,
  RESOLVED_ASSUMED_MS,
  canTransition,
  deriveRoundState,
  fogBeats,
  nextRoundState,
  type RoundState,
  type RoundStateInput,
} from '../src/roundMachine';

const T0 = 1_700_000_000_000;

function input(over: Partial<RoundStateInput> = {}): RoundStateInput {
  return {
    connected: true,
    phase: 'ANCHOR_OPEN',
    phaseEndsAt: T0 + 10_000,
    fogStartsAt: T0 + 7_000,
    hasBet: false,
    finalOrderUsed: false,
    tideFrozen: false,
    verifyOpen: false,
    now: T0,
    ...over,
  };
}

describe('deriveRoundState', () => {
  it('is IDLE without a connection or a round', () => {
    expect(deriveRoundState(input({ connected: false }))).toBe('IDLE');
    expect(deriveRoundState(input({ phase: null }))).toBe('IDLE');
  });

  it('separates SELECTING from LOCKED by whether a bet is committed', () => {
    expect(deriveRoundState(input({ hasBet: false }))).toBe('SELECTING');
    expect(deriveRoundState(input({ hasBet: true }))).toBe('LOCKED');
  });

  it('walks the whole fog window in order', () => {
    const fogStartsAt = T0 + 7_000;
    const lockAt = T0 + 10_000;
    const beats = fogBeats(fogStartsAt, lockAt);
    const at = (now: number) => deriveRoundState(input({ now, fogStartsAt, phaseEndsAt: lockAt }));

    expect(at(fogStartsAt - 1)).toBe('SELECTING');
    expect(at(fogStartsAt)).toBe('FOG');
    expect(at(beats.fogUntil - 1)).toBe('FOG');
    expect(at(beats.fogUntil)).toBe('TIDE_REPORT');
    expect(at(beats.tideUntil - 1)).toBe('TIDE_REPORT');
    expect(at(beats.tideUntil)).toBe('FINAL_ORDER');
    expect(at(beats.finalOrderUntil - 1)).toBe('FINAL_ORDER');
    expect(at(beats.finalOrderUntil)).toBe('FINAL_LOCK');
    expect(at(lockAt)).toBe('FINAL_LOCK');
  });

  it('trusts the server FOG_STARTED over a fast client clock', () => {
    // now is well before fogStartsAt, but the server has frozen the report.
    const state = deriveRoundState(input({ now: T0, fogStartsAt: T0 + 7_000, tideFrozen: true }));
    expect(state).not.toBe('SELECTING');
    expect(state).toBe('FOG');
  });

  it('goes straight to FINAL_LOCK once the one hidden order is spent', () => {
    const fogStartsAt = T0 + 7_000;
    for (const now of [fogStartsAt, fogStartsAt + 800, fogStartsAt + 2_000]) {
      expect(deriveRoundState(input({ now, fogStartsAt, finalOrderUsed: true }))).toBe(
        'FINAL_LOCK',
      );
    }
  });

  it('still reaches every fog beat on a Heavy Fog (4s) window', () => {
    const fogStartsAt = T0 + 6_000;
    const lockAt = T0 + 10_000;
    const seen = new Set<RoundState>();
    for (let now = fogStartsAt; now < lockAt; now += 25) {
      seen.add(deriveRoundState(input({ now, fogStartsAt, phaseEndsAt: lockAt })));
    }
    expect(seen).toEqual(new Set(['FOG', 'TIDE_REPORT', 'FINAL_ORDER', 'FINAL_LOCK']));
  });

  it('maps LOCKED_STORM to REVEAL regardless of anything else', () => {
    expect(deriveRoundState(input({ phase: 'LOCKED_STORM', hasBet: true }))).toBe('REVEAL');
    expect(deriveRoundState(input({ phase: 'LOCKED_STORM', tideFrozen: true }))).toBe('REVEAL');
  });

  it('gives IMPACT the first beat of RESOLVED, then RESULT', () => {
    const endsAt = T0 + RESOLVED_ASSUMED_MS;
    const at = (now: number) =>
      deriveRoundState(input({ phase: 'RESOLVED', phaseEndsAt: endsAt, now }));
    expect(at(T0)).toBe('IMPACT');
    expect(at(T0 + IMPACT_MS - 1)).toBe('IMPACT');
    expect(at(T0 + IMPACT_MS)).toBe('RESULT');
    expect(at(endsAt - 1)).toBe('RESULT');
  });

  it('shows VERIFICATION only once the verdict is on screen', () => {
    const endsAt = T0 + RESOLVED_ASSUMED_MS;
    // during the strike beat the sheet does not steal the answer
    expect(
      deriveRoundState(input({ phase: 'RESOLVED', phaseEndsAt: endsAt, now: T0, verifyOpen: true })),
    ).toBe('IMPACT');
    expect(
      deriveRoundState(
        input({ phase: 'RESOLVED', phaseEndsAt: endsAt, now: T0 + IMPACT_MS, verifyOpen: true }),
      ),
    ).toBe('VERIFICATION');
    expect(deriveRoundState(input({ phase: 'COOLDOWN', verifyOpen: true }))).toBe('VERIFICATION');
    expect(deriveRoundState(input({ phase: 'COOLDOWN', verifyOpen: false }))).toBe('RESET');
  });
});

describe('fogBeats', () => {
  it('never pushes a beat past the lock', () => {
    for (const window of [0, 120, 400, 900, 1_500, 3_000, 4_000, 9_000]) {
      const beats = fogBeats(T0, T0 + window);
      expect(beats.fogUntil).toBeLessThanOrEqual(T0 + window);
      expect(beats.tideUntil).toBeLessThanOrEqual(T0 + window);
      expect(beats.finalOrderUntil).toBeLessThanOrEqual(T0 + window);
    }
  });

  it('keeps the beats in order even when the window is squeezed', () => {
    for (const window of [0, 200, 700, 1_100, 3_000, 4_000]) {
      const b = fogBeats(T0, T0 + window);
      expect(b.fogUntil).toBeLessThanOrEqual(b.tideUntil);
      expect(b.tideUntil).toBeLessThanOrEqual(b.finalOrderUntil);
    }
  });

  it('always leaves a FINAL_LOCK beat on a normal window', () => {
    const b = fogBeats(T0, T0 + 3_000);
    expect(T0 + 3_000 - b.finalOrderUntil).toBeGreaterThanOrEqual(350);
  });
});

describe('transition table', () => {
  const ALL: RoundState[] = [
    'IDLE',
    'SELECTING',
    'LOCKED',
    'FOG',
    'TIDE_REPORT',
    'FINAL_ORDER',
    'FINAL_LOCK',
    'REVEAL',
    'IMPACT',
    'RESULT',
    'VERIFICATION',
    'RESET',
  ];

  it('allows the transitions the brief names as valid', () => {
    expect(canTransition('SELECTING', 'LOCKED')).toBe(true);
    expect(canTransition('FINAL_ORDER', 'FINAL_LOCK')).toBe(true);
    expect(canTransition('REVEAL', 'IMPACT')).toBe(true);
    expect(canTransition('RESULT', 'RESET')).toBe(true);
    expect(canTransition('RESET', 'SELECTING')).toBe(true);
  });

  it('refuses the transitions the brief names as invalid', () => {
    expect(canTransition('RESULT', 'REVEAL')).toBe(false);
    expect(canTransition('FINAL_LOCK', 'SELECTING')).toBe(false);
    expect(canTransition('FINAL_LOCK', 'LOCKED')).toBe(false);
    expect(canTransition('FINAL_LOCK', 'FINAL_ORDER')).toBe(false);
    expect(canTransition('IMPACT', 'REVEAL')).toBe(false);
    expect(canTransition('RESET', 'RESULT')).toBe(false);
  });

  it('lets a dropped socket interrupt anything', () => {
    for (const from of ALL) expect(canTransition(from, 'IDLE')).toBe(true);
  });

  it('lets a reconnect resume into any live state', () => {
    for (const to of ALL) {
      if (to === 'VERIFICATION') continue; // opened by the player, never resumed into
      expect(canTransition('IDLE', to)).toBe(true);
    }
  });

  it('is reflexive, so a re-render never trips the guard', () => {
    for (const s of ALL) expect(canTransition(s, s)).toBe(true);
  });

  it('nextRoundState holds the previous state on an illegal target', () => {
    expect(nextRoundState('RESULT', 'REVEAL')).toBe('RESULT');
    expect(nextRoundState('FINAL_LOCK', 'SELECTING')).toBe('FINAL_LOCK');
    expect(nextRoundState('FINAL_LOCK', 'REVEAL')).toBe('REVEAL');
    expect(nextRoundState('IDLE', 'REVEAL')).toBe('REVEAL');
  });

  it('a new round lifts every within-round ban for exactly one step', () => {
    // The bug this pins: a player who leaves the Verify sheet open across the
    // round boundary must not stay in VERIFICATION with a stale result card
    // over a live betting window.
    expect(nextRoundState('VERIFICATION', 'SELECTING')).toBe('VERIFICATION');
    expect(nextRoundState('VERIFICATION', 'SELECTING', true)).toBe('SELECTING');

    // A reconnect can land mid-round, so any state is a legal landing.
    expect(nextRoundState('RESULT', 'FINAL_ORDER', true)).toBe('FINAL_ORDER');
    expect(nextRoundState('FINAL_LOCK', 'SELECTING', true)).toBe('SELECTING');
    expect(nextRoundState('RESET', 'REVEAL', true)).toBe('REVEAL');
  });

  it('the ban returns immediately on the following step', () => {
    let s: RoundState = nextRoundState('VERIFICATION', 'SELECTING', true);
    expect(s).toBe('SELECTING');
    s = nextRoundState(s, 'RESULT'); // same round now — still illegal
    expect(s).toBe('SELECTING');
  });

  it('a whole round walks end to end without the guard rejecting a step', () => {
    const script: RoundState[] = [
      'IDLE',
      'SELECTING',
      'LOCKED',
      'FOG',
      'TIDE_REPORT',
      'FINAL_ORDER',
      'FINAL_LOCK',
      'REVEAL',
      'IMPACT',
      'RESULT',
      'VERIFICATION',
      'RESET',
      'SELECTING',
    ];
    let current = script[0]!;
    for (const step of script.slice(1)) {
      current = nextRoundState(current, step);
      expect(current).toBe(step);
    }
  });
});
