/**
 * The most this table will accept from you right now — computed the way the
 * SERVER computes it, so the number on screen is the number that gets accepted.
 *
 * WHAT WENT WRONG BEFORE
 *
 * The client estimated the round-share cap from `lastKnownHandleMinor`: the
 * total handle of the PREVIOUS round, read off its lock snapshot (decision 19
 * in the remediation log, which called it "a good-enough estimate to prevent
 * surprise rejects"). It is not. The server evaluates the cap against THIS
 * round, where every other player's stake starts at zero:
 *
 *     othersMinor = max(liquidityFloor, ZONE_COUNT × houseSeed + others' stakes)
 *
 * The previous round's handle includes everybody's stakes at lock, so at the
 * moment a round opens the client's figure is several times too high — and it
 * is highest precisely for the player who bets FIRST. That player set a stake
 * the deck said was fine and got the raw server rejection back:
 *
 *     "A single fleet is capped at 25% of this round's handle — up to 20000.00"
 *
 * which is the exact surprise the estimate existed to prevent.
 *
 * WHAT THIS DOES INSTEAD
 *
 * It drops the term the client cannot know and keeps the two it can. Both the
 * room's liquidity floor and the current house seed per zone are published, so
 *
 *     othersFloor = max(liquidityFloorMinor, ZONE_COUNT × houseSeedMinor)
 *
 * is a LOWER BOUND on the server's `othersMinor` — other players' stakes only
 * ever add to it. A cap derived from a lower bound can never exceed the
 * server's, so a stake this module allows is always accepted. It is the same
 * publicly-derivable bound the practice bots were moved onto (decision 63)
 * after the identical cap was rejecting most of their orders.
 *
 * The cost is deliberate: late in a busy round the true cap is higher than this,
 * and the deck will offer less than the server would take. That is the right
 * trade. A limit that is occasionally generous to the house is a rule; a limit
 * that moves under the player between pressing and sending is a bug.
 *
 * The exact live handle is NOT the missing piece to go and fetch: pools are
 * banded until the lock snapshot on purpose (Identity Freeze §2.5), and
 * publishing a live cap would publish the live handle with it — bands plus an
 * exact total is a much sharper read on the per-zone pools than bands alone.
 */
import { ZONE_COUNT } from '@landfall/core';

export interface StakeLimitInput {
  balanceMinor: number;
  roomMinStakeMinor: number;
  roomMaxStakeMinor: number;
  whaleCapFraction: number;
  /** Total handle the house guarantees while the table is thin (room config). */
  liquidityFloorMinor: number;
  /** This round's adaptive house seed per zone, published in the round header. */
  houseSeedMinor: number;
}

export interface StakeLimit {
  /** The most you can stake right now — never above what the server will take. */
  maxMinor: number;
  /** Which rule is currently binding, so the UI can say the right thing. */
  boundBy: 'table' | 'balance' | 'round-share';
}

/** The guaranteed round-share cap: what the server accepts before anyone else bets. */
export function roundShareCapMinor(input: StakeLimitInput): number {
  const { whaleCapFraction: w } = input;
  if (!(w > 0) || w >= 1) return Number.POSITIVE_INFINITY;
  const othersFloor = Math.max(
    input.liquidityFloorMinor,
    ZONE_COUNT * Math.max(0, input.houseSeedMinor),
  );
  return Math.floor((w / (1 - w)) * othersFloor);
}

export function resolveStakeLimit(input: StakeLimitInput): StakeLimit {
  const share = roundShareCapMinor(input);
  const candidates: [number, StakeLimit['boundBy']][] = [
    [input.roomMaxStakeMinor, 'table'],
    [input.balanceMinor, 'balance'],
    [share, 'round-share'],
  ];
  let maxMinor = Number.POSITIVE_INFINITY;
  let boundBy: StakeLimit['boundBy'] = 'table';
  for (const [value, kind] of candidates) {
    if (value < maxMinor) {
      maxMinor = value;
      boundBy = kind;
    }
  }
  // Rooms are configured so the round-share cap always admits the table
  // minimum (asserted at startup in resolveRoomConfig), so this floor can only
  // bite on a balance too small to play — where the server rejects anyway.
  return { maxMinor: Math.max(input.roomMinStakeMinor, maxMinor), boundBy };
}
