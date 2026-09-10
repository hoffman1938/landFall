import { describe, expect, it } from 'vitest';
import type { FleetPlanPublic, PhaseInfo } from '@landfall/core';
import type { LandfallInfo } from '../src/store';
import {
  canLeaveTable,
  deriveSimplePhase,
  personalResult,
  snapshotResultFleet,
} from '../src/simpleGameModel';

const fleet: FleetPlanPublic = {
  mode: 'FOCUS',
  primaryZone: 1,
  secondaryZone: null,
  stakeMinor: 500,
};
function result(patch: Partial<LandfallInfo> = {}): LandfallInfo {
  return {
    roundId: 10,
    struckZone: 0,
    yourFleet: fleet,
    yourName: 'Player',
    yourResult: { outcome: 'SAFE', netMinor: 125 },
    ...patch,
  } as LandfallInfo;
}

describe('simple phase', () => {
  const input = { connected: true, roundId: 10, result: result(), now: 1_000 };
  it('keeps the whole open window in one choice step, including fog', () => {
    const phase: PhaseInfo = { phase: 'ANCHOR_OPEN', endsAt: 2_000 };
    expect(deriveSimplePhase({ ...input, phase })).toMatchObject({
      stage: 'choose',
      canBet: true,
      result: null,
    });
    expect(deriveSimplePhase({ ...input, phase, finalOrderUsed: true }).canBet).toBe(false);
    expect(deriveSimplePhase({ ...input, phase, orderPending: true }).canBet).toBe(false);
    expect(deriveSimplePhase({ ...input, phase, roundId: null }).canBet).toBe(false);
  });
  it('closes locally at the authoritative deadline even before the phase frame arrives', () => {
    expect(
      deriveSimplePhase({ ...input, phase: { phase: 'ANCHOR_OPEN', endsAt: 1_000 } }),
    ).toMatchObject({ stage: 'storm', canBet: false, secondsLeft: 0 });
    expect(
      deriveSimplePhase({
        ...input,
        connected: false,
        phase: { phase: 'ANCHOR_OPEN', endsAt: 2_000 },
      }).canBet,
    ).toBe(false);
  });
  it('never substitutes a prior result for the new round', () => {
    const phase: PhaseInfo = { phase: 'RESOLVED', endsAt: 2_000 };
    expect(deriveSimplePhase({ ...input, phase }).result?.roundId).toBe(10);
    expect(deriveSimplePhase({ ...input, phase, roundId: 11 }).result).toBeNull();
    expect(
      deriveSimplePhase({ ...input, phase: { phase: 'LOCKED_STORM', endsAt: 2_000 } }).result,
    ).toBeNull();
  });
});

describe('personal receipt', () => {
  it('returns the stake separately from the actual multiplied share', () => {
    expect(
      personalResult(result({ stormPower: { label: 'Bonus', mNum: 5, mDen: 4 } })),
    ).toMatchObject({
      receiptKnown: true,
      stakeMinor: 500,
      returnedStakeMinor: 500,
      shareMinor: 125,
      totalReturnMinor: 625,
      netMinor: 125,
      multiplier: 1.25,
    });
  });
  it('separates jackpot from share without adding the jackpot twice', () => {
    expect(
      personalResult(
        result({
          yourResult: { outcome: 'SAFE', netMinor: 10_125 },
          surge: { winnerName: 'Player', potMinor: 10_000, winnerStakeMinor: 500 },
        }),
      ),
    ).toMatchObject({ shareMinor: 125, jackpotMinor: 10_000, totalReturnMinor: 10_625 });
  });
  it('shows zero returned stake for a hit harbor', () => {
    expect(
      personalResult(result({ struckZone: 1, yourResult: { outcome: 'WRECKED', netMinor: -500 } })),
    ).toMatchObject({ returnedStakeMinor: 0, shareMinor: 0, totalReturnMinor: 0, netMinor: -500 });
  });
  it('uses the server floor for a split primary and returns only its surviving part', () => {
    expect(
      personalResult(
        result({
          yourFleet: { ...fleet, mode: 'SPLIT', stakeMinor: 101, secondaryZone: 2 },
          struckZone: 1,
          yourResult: { outcome: 'SPLIT', netMinor: -60 },
        }),
      ),
    ).toMatchObject({
      stakeMinor: 101,
      returnedStakeMinor: 31,
      shareMinor: 10,
      totalReturnMinor: 41,
    });
  });
  it('keeps the actual paid share when the announced multiplier is capped', () => {
    expect(
      personalResult(
        result({ stormPower: { label: 'Storm', mNum: 500, mDen: 1 }, powerCapped: true }),
      ),
    ).toMatchObject({ shareMinor: 125, multiplier: 500, powerCapped: true });
  });
  it('does not invent amounts without a same-round receipt', () => {
    expect(personalResult(result({ yourFleet: undefined }))).toMatchObject({
      receiptKnown: false,
      stakeMinor: null,
      totalReturnMinor: null,
      shareMinor: null,
      netMinor: 125,
    });
    expect(
      snapshotResultFleet({ roundId: 10, fleetRoundId: 9, fleet, outcome: 'SAFE' }),
    ).toBeUndefined();
    expect(
      snapshotResultFleet({ roundId: 10, fleetRoundId: 10, fleet, outcome: 'SPECTATOR' }),
    ).toBeNull();
    const snapshot = snapshotResultFleet({ roundId: 10, fleetRoundId: 10, fleet, outcome: 'SAFE' });
    expect(snapshot).toEqual(fleet);
    expect(snapshot).not.toBe(fleet);
  });
});

describe('table switch safety', () => {
  it('protects accepted and in-flight bets until settlement', () => {
    expect(
      canLeaveTable({
        myFleet: fleet,
        orderPending: false,
        phase: { phase: 'ANCHOR_OPEN', endsAt: 0 },
      }),
    ).toBe(false);
    expect(
      canLeaveTable({
        myFleet: fleet,
        orderPending: false,
        phase: { phase: 'LOCKED_STORM', endsAt: 0 },
      }),
    ).toBe(false);
    expect(canLeaveTable({ myFleet: null, orderPending: true, phase: null })).toBe(false);
    expect(
      canLeaveTable({
        myFleet: fleet,
        orderPending: false,
        phase: { phase: 'RESOLVED', endsAt: 0 },
      }),
    ).toBe(true);
  });
});
