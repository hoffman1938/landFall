/**
 * What a table switch resets, and what it must not.
 *
 * `WELCOME` arrives for two different reasons — a (re)connection and a table
 * switch — and the client used to treat both as a reconnection. That leaked
 * every table-scoped thing into the new table:
 *
 *   - the "Bet again 50,000" from Leviathan sat in the deck at a table whose
 *     maximum is 50, and the server rejected it the moment it was pressed;
 *   - the stake in the stepper stayed above the new tier's maximum until some
 *     later render happened to clamp it;
 *   - the Verify sheet offered replay cards and signed receipts from rounds
 *     this table never played, which in a provably-fair product is not a
 *     cosmetic bug;
 *   - the signal cooldown counted rounds from the table you left.
 *
 * A table is a self-contained game: its own pools, history, jackpot, stake tier
 * and cooldowns. THE RULE: anything scoped to a table is dropped on the way
 * out. What survives is what belongs to the player rather than the table —
 * balance, self-set limits, and the session curve. You did not start a new
 * session by walking to another table.
 */

export interface TableSwitchInput {
  /** The table the client was in, or null on a first connection. */
  previousRoomId: string | null;
  previousRoomName: string | null;
  nextRoomId: string;
  nextRoomName: string | null;
  /**
   * The stake that was live in the old table. The server withdraws and refunds
   * it before moving the player (hub.joinRoom), and the refund is already
   * inside the balance that arrives with WELCOME — so the only thing missing is
   * telling the player it happened. A balance that changes silently is the
   * single most alarming thing a betting product can do.
   */
  liveStakeMinor: number;
  stakeInputMinor: number;
  nextMinStakeMinor: number;
  nextMaxStakeMinor: number;
  /** Formats minor units for the notice; injected so this module stays pure. */
  formatCredits(minor: number): string;
}

export interface TableSwitchReset {
  lastAnchor: null;
  lastFleet: null;
  lastLandfall: null;
  /** The personal receipt is this table's round too, and must not follow you. */
  lastPersonalLandfall: null;
  lastLandfallAt: null;
  /** The other table's players settling in your feed is somebody else's game. */
  liveFeed: [];
  replayCards: [];
  receipts: [];
  myFlagRounds: [];
  events: [];
  selectedZone: null;
  verifyRoundId: null;
  wreckLogOpen: false;
  /** Carried into the new tier's range rather than left above its maximum. */
  stakeInputMinor: number;
  toast: string | null;
  toastTone: 'info';
}

/** True when this WELCOME is a move between tables rather than a (re)connection. */
export function isTableSwitch(previousRoomId: string | null, nextRoomId: string): boolean {
  return previousRoomId !== null && previousRoomId !== nextRoomId;
}

/**
 * The state a table switch clears, or null when this is not a switch.
 *
 * Returning the whole object (rather than mutating) keeps the reset auditable:
 * every table-scoped field in the store appears here exactly once, so adding a
 * new one and forgetting it shows up as a missing key rather than as a subtle
 * leak two tables later.
 */
export function tableSwitchReset(input: TableSwitchInput): TableSwitchReset | null {
  if (!isTableSwitch(input.previousRoomId, input.nextRoomId)) return null;

  const stakeInputMinor = Math.min(
    Math.max(input.stakeInputMinor, input.nextMinStakeMinor),
    input.nextMaxStakeMinor,
  );

  const toast =
    input.liveStakeMinor > 0
      ? `Moved to ${input.nextRoomName ?? 'the new table'} — your ${input.formatCredits(
          input.liveStakeMinor,
        )} bet at ${input.previousRoomName ?? 'your old table'} was refunded.`
      : null;

  return {
    lastAnchor: null,
    lastFleet: null,
    lastLandfall: null,
    lastPersonalLandfall: null,
    lastLandfallAt: null,
    liveFeed: [],
    replayCards: [],
    receipts: [],
    myFlagRounds: [],
    events: [],
    selectedZone: null,
    verifyRoundId: null,
    wreckLogOpen: false,
    stakeInputMinor,
    toast,
    toastTone: 'info',
  };
}
