import type { LiquidityLevel, RoomInfo } from '@landfall/core';

/**
 * Which table to play at — a choice the player makes, not one made for them.
 *
 * The server seats an unrouted player in the busiest table they can afford,
 * which is the right default for LIQUIDITY (five tiers split between a handful
 * of players is five dead tables) and the wrong one for a person opening the
 * game for the first time: it can drop someone straight into the 5,000-minimum
 * table because their opening balance happens to cover it. A returning player
 * lands back in whatever table they last used, which is sticky in the same
 * silent way. Neither is a decision the player took.
 *
 * The stake tier is the single most consequential setting in the game — it
 * decides how much a round costs and who the player shares a pool with — so it
 * belongs in front of them before the first bet, with the numbers attached.
 *
 * Nothing here ranks tables by how much they earn. The suggestion is always the
 * cheapest table the player can afford, and a table they cannot cover is shown
 * with the reason rather than hidden, so the ladder is legible without being an
 * invitation to climb it.
 */
export interface TableOption {
  roomId: string;
  name: string;
  minStakeMinor: number;
  maxStakeMinor: number;
  /** Real humans seated here; bots are never counted (population honesty, C5). */
  humanCount: number;
  liquidity: LiquidityLevel;
  /** The player's balance covers at least one minimum bet. */
  affordable: boolean;
  /** The table the player is currently seated at. */
  current: boolean;
  /** The cheapest affordable table — where a new player is pointed. */
  suggested: boolean;
  /** Whole minimum bets this balance covers, for the "rounds you can play" hint. */
  betsAffordable: number;
}

/** Config order is the stake ladder, cheapest first; the server sends it that way. */
export function tableOptions(
  rooms: readonly RoomInfo[],
  currentRoomId: string | null,
  balanceMinor: number,
): TableOption[] {
  const suggestedId = suggestedRoomId(rooms, balanceMinor);
  return rooms.map((room) => {
    const affordable = balanceMinor >= room.minStakeMinor;
    return {
      roomId: room.roomId,
      name: room.name,
      minStakeMinor: room.minStakeMinor,
      maxStakeMinor: room.maxStakeMinor,
      humanCount: room.humanCount,
      liquidity: room.liquidity ?? 'quiet',
      affordable,
      current: room.roomId === currentRoomId,
      suggested: room.roomId === suggestedId,
      betsAffordable: room.minStakeMinor > 0 ? Math.floor(balanceMinor / room.minStakeMinor) : 0,
    };
  });
}

/**
 * The cheapest table the balance covers — deliberately not the busiest, and
 * deliberately not the most expensive. Falls back to the cheapest table on the
 * ladder when nothing is affordable, so the hint still points somewhere real.
 */
export function suggestedRoomId(rooms: readonly RoomInfo[], balanceMinor: number): string | null {
  if (rooms.length === 0) return null;
  const affordable = rooms.filter((r) => balanceMinor >= r.minStakeMinor);
  const pool = affordable.length > 0 ? affordable : rooms;
  return pool.reduce((cheapest, r) => (r.minStakeMinor < cheapest.minStakeMinor ? r : cheapest))
    .roomId;
}

export const LIQUIDITY_WORD: Record<LiquidityLevel, string> = {
  quiet: 'Quiet',
  filling: 'Filling',
  busy: 'Busy',
};

/**
 * Which table the entry gate should preselect: the one the player is already
 * at when they can afford it, otherwise the suggestion. A refresh should cost
 * one confirming tap, not a fresh decision.
 */
export function preselectedRoomId(
  rooms: readonly RoomInfo[],
  currentRoomId: string | null,
  balanceMinor: number,
): string | null {
  const current = rooms.find((r) => r.roomId === currentRoomId);
  if (current && balanceMinor >= current.minStakeMinor) return current.roomId;
  return suggestedRoomId(rooms, balanceMinor);
}
