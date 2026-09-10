import { SPLIT_PRIMARY_PERCENT, ZONE_COUNT } from '@landfall/core';
import type { FleetPlanPublic, PhaseInfo } from '@landfall/core';
import type { LandfallInfo } from './store';

/** Three visible steps, derived from the server. Fog never creates another task. */
export function deriveSimplePhase(input: {
  connected: boolean;
  phase: PhaseInfo | null;
  roundId: number | null;
  result: LandfallInfo | null;
  now: number;
  finalOrderUsed?: boolean;
  orderPending?: boolean;
}) {
  const { phase, now } = input;
  const secondsLeft = Math.max(0, Math.ceil(((phase?.endsAt ?? now) - now) / 1000));
  const stage: 'choose' | 'storm' | 'result' =
    phase?.phase === 'RESOLVED' || phase?.phase === 'COOLDOWN'
      ? 'result'
      : phase?.phase === 'LOCKED_STORM' || (phase?.phase === 'ANCHOR_OPEN' && secondsLeft === 0)
        ? 'storm'
        : 'choose';
  return {
    stage,
    secondsLeft,
    canBet: input.roundId !== null && canEditSimpleBet(input),
    // The prior receipt may remain available in history, but must never become
    // the next round's result while that round is still being resolved.
    result: stage === 'result' && input.result?.roundId === input.roundId ? input.result : null,
  };
}

export function canEditSimpleBet(input: {
  connected: boolean;
  phase: PhaseInfo | null;
  now: number;
  finalOrderUsed?: boolean;
  orderPending?: boolean;
}): boolean {
  return (
    input.connected &&
    input.phase?.phase === 'ANCHOR_OPEN' &&
    input.phase.endsAt > input.now &&
    !input.finalOrderUsed &&
    !input.orderPending
  );
}

export function canLeaveTable(input: {
  myFleet: FleetPlanPublic | null;
  orderPending: boolean;
  phase: PhaseInfo | null;
}): boolean {
  if (input.orderPending) return false;
  return !input.myFleet || input.phase?.phase === 'RESOLVED' || input.phase?.phase === 'COOLDOWN';
}

/** A receipt only comes from an acknowledged bet in this very round. */
export function snapshotResultFleet(input: {
  roundId: number;
  fleetRoundId: number | null;
  fleet: FleetPlanPublic | null;
  outcome: LandfallInfo['yourResult']['outcome'];
}): FleetPlanPublic | null | undefined {
  if (input.outcome === 'SPECTATOR') return null;
  return input.fleetRoundId === input.roundId && input.fleet ? { ...input.fleet } : undefined;
}

export interface PersonalResult {
  played: boolean;
  receiptKnown: boolean;
  stakeMinor: number | null;
  returnedStakeMinor: number | null;
  /** Actual paid share, including Storm Power; the multiplier applies only here. */
  shareMinor: number | null;
  jackpotMinor: number;
  totalReturnMinor: number | null;
  /** Server's signed net change, already including any jackpot. */
  netMinor: number;
  multiplier: number;
  powerCapped: boolean;
}

/** Read the receipt; do not recompute settlement or infer a missing stake from a prior round. */
export function personalResult(result: LandfallInfo): PersonalResult {
  const played = result.yourResult.outcome !== 'SPECTATOR';
  const multiplier =
    result.stormPower && result.stormPower.mDen > 0
      ? result.stormPower.mNum / result.stormPower.mDen
      : 1;
  const jackpotMinor =
    played && result.yourName != null && result.surge?.winnerName === result.yourName
      ? result.surge.potMinor
      : 0;
  const base = {
    played,
    netMinor: result.yourResult.netMinor,
    multiplier,
    jackpotMinor,
    powerCapped: result.powerCapped ?? false,
  };
  if (!played)
    return {
      ...base,
      receiptKnown: true,
      stakeMinor: 0,
      returnedStakeMinor: 0,
      shareMinor: 0,
      totalReturnMinor: 0,
    };

  const fleet = result.yourFleet;
  const unknown = {
    ...base,
    receiptKnown: false,
    stakeMinor: null,
    returnedStakeMinor: null,
    shareMinor: null,
    totalReturnMinor: null,
  };
  if (!fleet || !Number.isSafeInteger(fleet.stakeMinor) || fleet.stakeMinor <= 0) return unknown;
  const validZone = (zone: number) => Number.isInteger(zone) && zone >= 0 && zone < ZONE_COUNT;
  if (!validZone(fleet.primaryZone)) return unknown;
  const split = fleet.mode === 'SPLIT';
  if (
    split &&
    (fleet.secondaryZone === null ||
      !validZone(fleet.secondaryZone) ||
      fleet.secondaryZone === fleet.primaryZone)
  )
    return unknown;

  // Match coordinator.fleetStakes: the primary share floors, the secondary
  // receives the remainder. Math.round would misstate odd-credit split receipts.
  const primaryMinor = split
    ? Math.floor((fleet.stakeMinor * SPLIT_PRIMARY_PERCENT) / 100)
    : fleet.stakeMinor;
  const secondaryMinor = fleet.stakeMinor - primaryMinor;
  const returnedStakeMinor =
    (fleet.primaryZone === result.struckZone ? 0 : primaryMinor) +
    (split && fleet.secondaryZone !== result.struckZone ? secondaryMinor : 0);
  const totalReturnMinor = fleet.stakeMinor + result.yourResult.netMinor;
  const shareMinor = totalReturnMinor - returnedStakeMinor - jackpotMinor;
  if (!Number.isSafeInteger(totalReturnMinor) || totalReturnMinor < 0 || shareMinor < 0)
    return unknown;
  return {
    ...base,
    receiptKnown: true,
    stakeMinor: fleet.stakeMinor,
    returnedStakeMinor,
    shareMinor,
    totalReturnMinor,
  };
}
