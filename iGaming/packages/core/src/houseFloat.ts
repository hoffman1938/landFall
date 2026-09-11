/**
 * SEGREGATED LIQUIDITY FLOAT — the house seed's ring-fence.
 *
 * THE FINDING (gap G8, the single most likely challenge in certification —
 * docs/10-compliance/03-game-classification.md §5).
 *
 * The house stakes a seed on all six harbors every round and settles it under
 * the same pari-mutuel rules as a player. Its EXPECTED profit is zero by
 * symmetry: a uniform stake across every possible outcome expresses no view and
 * cannot win by predicting. But its REALISED profit is not zero in any finite
 * period, and it used to be credited to the same account as the rake — so on any
 * given month the operator's revenue contained an amount won from players by
 * house money staked against them. GLI-19 §A.7.1 is explicit:
 *
 *   (c) the operator shall not profit from the play (beyond the rake);
 *   (d) where the wager is funded by the operator, neither the operator nor the
 *       shill may profit from the play, the funds may not be withdrawn, and so
 *       shall ultimately be lost/played.
 *
 * THE FIX, and it is contained — the mechanic does not change at all.
 *
 * House-seed stakes and their settlements now move against a SEGREGATED FLOAT
 * that is not operator revenue and is not withdrawable. The float may fund only
 * three things: future seeds, the Storm Surge pot, and the Storm Reserve. That
 * maps precisely onto §A.7.1(d) — the money is ultimately played or given back
 * to players, never banked — and onto §A.6.5(a), which says jackpot
 * contributions must not be assimilated into revenue.
 *
 * Operator revenue after this change is THE RAKE ALONE, which is what the
 * economy documentation has always claimed it was.
 *
 * Pure integer arithmetic over explicit inputs; the caller persists the rows.
 */

export interface HouseFloatState {
  /**
   * The ring-fenced balance. May go negative in principle — the float wearing a
   * loss is the normal case for a liquidity provider and is exactly what
   * §A.7.1(d) intends by "shall ultimately be lost". `topUpMinor` records the
   * operator capital that funds it, so the obligation is never implicit.
   */
  balanceMinor: number;
  /** Cumulative operator capital contributed to the float. Never returns. */
  contributedMinor: number;
  /** Cumulative float money released to players via the pot or the reserve. */
  releasedMinor: number;
}

export interface HouseFloatRound {
  state: HouseFloatState;
  /** Total house seed staked into the pools this round. */
  stakedMinor: number;
  /** Total credited back to the house seeds at settlement (0 on wrecked seeds). */
  returnedMinor: number;
  /** returned − staked. The float's profit and loss for the round. */
  netMinor: number;
  /**
   * Operator capital added this round because the float could not fund the
   * seed. Ledgered, disclosed, and never recoverable as revenue.
   */
  topUpMinor: number;
}

/** The float opens with disclosed operator capital sized to the room's floor. */
export function openFloat(openingMinor: number): HouseFloatState {
  return { balanceMinor: openingMinor, contributedMinor: openingMinor, releasedMinor: 0 };
}

/**
 * How many fully-seeded rounds the float opens able to fund.
 *
 * Sizing it at one round's seed is the obvious choice and the wrong one: the
 * seed is staked before it settles, so a float holding exactly one round's worth
 * books an operator top-up on its very first round and again on any round where
 * the previous one lost. A top-up is a real, ledgered capital event and it
 * should mean something, so the opening balance carries enough headroom that
 * one appears when the float is genuinely exhausted rather than as a matter of
 * routine.
 */
export const HOUSE_FLOAT_OPENING_ROUNDS = 20;

export function houseFloatOpeningFor(
  maxSeedPerZoneMinor: number,
  zones: number,
  liquidityFloorMinor = 0,
): number {
  const oneRound = Math.max(maxSeedPerZoneMinor * zones, liquidityFloorMinor);
  return HOUSE_FLOAT_OPENING_ROUNDS * oneRound;
}

/**
 * Book one round of house-seed activity against the float.
 *
 * `stakedMinor` is what the seeds put on the table; `returnedMinor` is what
 * settlement credited back to them. The difference is the float's P&L, and it
 * touches the operator's revenue account nowhere.
 *
 * Where the float cannot cover the stake, the shortfall is booked as an
 * explicit operator top-up rather than allowing a silent overdraft — the same
 * treatment the Storm Reserve's backstop receives.
 */
export function applyFloatRound(
  state: HouseFloatState,
  stakedMinor: number,
  returnedMinor: number,
): HouseFloatRound {
  const staked = Math.max(0, Math.trunc(stakedMinor));
  const returned = Math.max(0, Math.trunc(returnedMinor));
  const topUp = Math.max(0, staked - state.balanceMinor);
  const balance = state.balanceMinor + topUp - staked + returned;
  return {
    state: {
      balanceMinor: balance,
      contributedMinor: state.contributedMinor + topUp,
      releasedMinor: state.releasedMinor,
    },
    stakedMinor: staked,
    returnedMinor: returned,
    netMinor: returned - staked,
    topUpMinor: topUp,
  };
}

/** The only three destinations float money may ever reach. */
export type FloatRelease = 'SEED' | 'SURGE_POT' | 'STORM_RESERVE';

/**
 * Release float money to a player-facing fund.
 *
 * This is the whole of §A.7.1(d)'s "may not be withdrawn": there is no function
 * in this module that moves float money to operator revenue, and the type of
 * `to` is the exhaustive list of where it can go instead. Releasing more than
 * the float holds is refused rather than overdrawn — a release is discretionary,
 * unlike a seed, so there is nothing to justify a top-up.
 */
export function releaseFloat(
  state: HouseFloatState,
  amountMinor: number,
  to: FloatRelease,
): { state: HouseFloatState; releasedMinor: number; to: FloatRelease } {
  const amount = Math.max(0, Math.trunc(amountMinor));
  if (amount > state.balanceMinor) {
    throw new Error(
      `liquidity float release of ${amount} exceeds balance ${state.balanceMinor} (to ${to})`,
    );
  }
  return {
    state: {
      balanceMinor: state.balanceMinor - amount,
      contributedMinor: state.contributedMinor,
      releasedMinor: state.releasedMinor + amount,
    },
    releasedMinor: amount,
    to,
  };
}

/**
 * The reconciliation an auditor runs.
 *
 * GLI-19 §A.7.1(c) says the operator "shall not profit from the play beyond the
 * rake". That is a statement about what comes IN, not about the net movement of
 * the house account — the account legitimately goes DOWN when the operator funds
 * the jackpot's reset value, backstops the Storm Reserve or tops up this float,
 * because all three are money moving toward players.
 *
 * So the test is: gross inflows to the operator's account must equal the rake
 * and nothing else. After the ring-fence the account has exactly one credit
 * path (the rake share) and three debit paths (float top-up, reserve backstop,
 * jackpot reset funding), so any inflow beyond the rake is house-seed profit
 * that leaked past the fence — and that is an incident, not a rounding note.
 */
export function reconcileOperatorRevenue(
  grossInflowsMinor: number,
  rakeMinor: number,
): { leakageMinor: number; incident: boolean } {
  const leakage = grossInflowsMinor - rakeMinor;
  return { leakageMinor: leakage, incident: leakage !== 0 };
}

/**
 * The four movements the operator's account is permitted, as a checked total.
 * Returns the expected closing delta for a period; a ledger that disagrees with
 * this figure has a movement nobody declared.
 */
export function expectedOperatorDelta(period: {
  rakeMinor: number;
  floatTopUpMinor: number;
  reserveBackstopMinor: number;
  jackpotResetFundedMinor: number;
}): number {
  return (
    period.rakeMinor -
    period.floatTopUpMinor -
    period.reserveBackstopMinor -
    period.jackpotResetFundedMinor
  );
}
