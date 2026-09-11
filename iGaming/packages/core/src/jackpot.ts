/**
 * JACKPOT CONTROL SOFTWARE — a deliberately separate artefact.
 *
 * Order 222 Annex 1 Art. 17.1 requires TWO authorizations, not one:
 *   (b) the jackpot PROGRAM — the feature players see (Storm Surge, Storm Power);
 *   (c) the jackpot CONTROL SOFTWARE — the accounting that proves the program
 *       is honest: contribution, ceiling, diversion, reset, balancing,
 *       reconciliation and decommissioning.
 *
 * The two used to be the same code: pot arithmetic lived inline in the
 * coordinator's settlement transaction, so there was nothing to hand an auditor
 * that was identifiably "the control software" (gap G10). Everything in this
 * file is pure integer arithmetic over explicit inputs — no clock, no database,
 * no randomness — so it can be reviewed, replayed against the ledgers, and
 * certified on its own.
 *
 * Money is integer minor units throughout. Every function returns the ledger
 * row it implies, so the caller's only job is to persist it.
 *
 * Standards mapped here:
 *   GLI-19 §4.13.3  maximum payoff limits; diversion pool for the overflow
 *   GLI-19 §4.13.5  diversion schemes must not have infinite expectation
 *   GLI-19 §4.13.6  contributions not lost; no truncation; reset value
 *   GLI-19 §4.13.9  multiple simultaneous triggers
 *   GLI-19 §A.4.1   operator reserves adequate and protected
 *   GLI-19 §A.6.5   contributions not assimilated into revenue; reconciliation
 *   Order 222 Art. 17.2  monthly balancing; discrepancy raised as an incident
 *   Order 222 Art. 17.3  cancellation of unpaid jackpots is not permitted
 */

/** Where a round's rake share can go. Exactly one of these, never revenue. */
export interface SurgePotState {
  /** Live pot, what the ticker shows. */
  potMinor: number;
  /**
   * Contributions received while the pot stood at its ceiling. §4.13.3 requires
   * them to be credited to a diversion pool rather than lost; they seed the
   * next pot at reset.
   */
  diversionMinor: number;
}

export interface SurgePotPolicy {
  /** Value the pot returns to after a win (§4.13.6(d)). Funded first from diversion. */
  resetMinor: number;
  /** Ceiling the pot stops incrementing at (§4.13.3). */
  ceilingMinor: number;
}

/** One round's effect on the pot, in the shape the ledger stores. */
export interface SurgeContribution {
  state: SurgePotState;
  /** Of the round's contribution, how much reached the live pot. */
  toPotMinor: number;
  /** …and how much was diverted because the pot stood at its ceiling. */
  toDiversionMinor: number;
  /** True while the pot sits at the ceiling — the client discloses it. */
  atCeiling: boolean;
}

/**
 * Credit a round's surge share. §4.13.6(a): contributions are never lost and
 * never truncated — anything the ceiling refuses goes to the diversion pool,
 * so `toPot + toDiversion === contribution` exactly, always.
 */
export function contributeToSurge(
  state: SurgePotState,
  contributionMinor: number,
  policy: SurgePotPolicy,
): SurgeContribution {
  const contribution = Math.max(0, Math.trunc(contributionMinor));
  const headroom = Math.max(0, policy.ceilingMinor - state.potMinor);
  const toPot = Math.min(contribution, headroom);
  const toDiversion = contribution - toPot;
  const next: SurgePotState = {
    potMinor: state.potMinor + toPot,
    diversionMinor: state.diversionMinor + toDiversion,
  };
  return {
    state: next,
    toPotMinor: toPot,
    toDiversionMinor: toDiversion,
    atCeiling: next.potMinor >= policy.ceilingMinor,
  };
}

export interface SurgePayout {
  state: SurgePotState;
  /** Paid to the winning stake — the whole live pot, never rounded down. */
  paidMinor: number;
  /** Reset value actually restored (§4.13.6(d)). */
  resetMinor: number;
  /** Of the reset, how much came from the diversion pool rather than the house. */
  fromDiversionMinor: number;
  /** …and how much the house had to put in to reach the reset value. */
  fromHouseMinor: number;
}

/**
 * Pay the pot out and reset it. §4.13.6(b): the payoff is never rounded down or
 * truncated — the winner receives the pot to the minor unit.
 *
 * The reset value is funded from the DIVERSION POOL FIRST and only then by the
 * house. That is what the diversion pool is for (§4.13.3) and it is why the
 * ceiling costs players nothing: money held back at the ceiling comes straight
 * back as the next pot's opening balance.
 */
export function payOutSurge(state: SurgePotState, policy: SurgePotPolicy): SurgePayout {
  const paid = state.potMinor;
  const fromDiversion = Math.min(state.diversionMinor, policy.resetMinor);
  const fromHouse = policy.resetMinor - fromDiversion;
  return {
    state: {
      potMinor: policy.resetMinor,
      diversionMinor: state.diversionMinor - fromDiversion,
    },
    paidMinor: paid,
    resetMinor: policy.resetMinor,
    fromDiversionMinor: fromDiversion,
    fromHouseMinor: fromHouse,
  };
}

/**
 * Order 222 Art. 17.3 — CANCELLATION OF UNPAID JACKPOTS IS NOT PERMITTED.
 *
 * A surge round with no surviving player stake cannot pay, and the pot rolls
 * over untouched. This function exists so that rule is a named, tested,
 * citable behaviour rather than an implicit consequence of the code path not
 * doing anything: rollover returns the state UNCHANGED, and there is no
 * function anywhere in this module that reduces a pot without paying it.
 */
export function rollOverSurge(state: SurgePotState): SurgePotState {
  return { potMinor: state.potMinor, diversionMinor: state.diversionMinor };
}

/**
 * Order 222 Art. 17.4 / GLI §A.6.5(e) — decommissioning.
 *
 * A pot that is retired may not be cancelled either: its balance and diversion
 * pool transfer in full to a destination pot, permitted only where the
 * probability of winning there is the same or better. The caller supplies both
 * probabilities and the transfer is REFUSED, not silently adjusted, when the
 * destination is worse — that refusal is the control.
 */
export function decommissionSurge(
  source: SurgePotState,
  destination: SurgePotState,
  sourceWinProbability: number,
  destinationWinProbability: number,
): { destination: SurgePotState; transferredMinor: number } {
  if (!(destinationWinProbability >= sourceWinProbability)) {
    throw new Error(
      `jackpot decommission refused: destination win probability ${destinationWinProbability} ` +
        `is worse than source ${sourceWinProbability} (Order 222 Annex 1 Art. 17.4)`,
    );
  }
  const transferred = source.potMinor + source.diversionMinor;
  return {
    destination: {
      potMinor: destination.potMinor + source.potMinor,
      diversionMinor: destination.diversionMinor + source.diversionMinor,
    },
    transferredMinor: transferred,
  };
}

// ---------------------------------------------------------------------------
// Storm Reserve — the fund behind the Storm Power ladder
// ---------------------------------------------------------------------------

export interface ReserveState {
  /** Never negative. See `drawFromReserve`. */
  balanceMinor: number;
  /** Cumulative house capital injected to keep the balance non-negative. */
  backstopTotalMinor: number;
}

export interface ReserveMovement {
  state: ReserveState;
  inflowMinor: number;
  outflowMinor: number;
  /**
   * House capital injected THIS round because the draw exceeded the balance
   * (G11). Zero on a solvent round, which is the overwhelming majority.
   */
  backstopMinor: number;
}

/**
 * Apply a round's reserve inflow (the rake's reserve share) and outflow (the
 * Storm Power overpayment), in that order.
 *
 * NEVER NEGATIVE. Where the outflow exceeds what the fund holds, the shortfall
 * is booked as `backstopMinor` — an explicit house capital injection — and the
 * balance floors at zero. The player's payout is unaffected: the money is paid
 * either way, and decisions-log #3's rule that a disclosed payout is never
 * shrunk at settlement still holds exactly. What changes is that the house's
 * obligation is now a positive number on a ledger row instead of a minus sign
 * on a balance, which is what GLI §A.4.1 and §A.6.5(d) actually want to see.
 */
export function applyReserveRound(
  state: ReserveState,
  inflowMinor: number,
  outflowMinor: number,
): ReserveMovement {
  const inflow = Math.max(0, Math.trunc(inflowMinor));
  const outflow = Math.max(0, Math.trunc(outflowMinor));
  const funded = state.balanceMinor + inflow;
  const backstop = Math.max(0, outflow - funded);
  return {
    state: {
      balanceMinor: funded - outflow + backstop,
      backstopTotalMinor: state.backstopTotalMinor + backstop,
    },
    inflowMinor: inflow,
    outflowMinor: outflow,
    backstopMinor: backstop,
  };
}

// ---------------------------------------------------------------------------
// Balancing — Order 222 Annex 1 Art. 17.2
// ---------------------------------------------------------------------------

/** The four ledger aggregates a balancing run reconciles. */
export interface BalancingInput {
  /** Opening pot + diversion at the start of the period. */
  openingMinor: number;
  /** Every surge contribution credited during the period. */
  contributionsMinor: number;
  /** Every jackpot paid during the period. */
  paidOutMinor: number;
  /** House money added to restore reset values during the period. */
  houseSeededMinor: number;
  /** Closing pot + diversion at the end of the period. */
  closingMinor: number;
}

export interface BalancingResult {
  expectedClosingMinor: number;
  actualClosingMinor: number;
  /** actual − expected. Must be exactly zero. */
  discrepancyMinor: number;
  /**
   * Art. 17.2: "any discrepancy … recorded as an incident and notified to the
   * Revenue Service and/or the Selected Person." True means raise an incident.
   */
  incident: boolean;
}

/**
 * Monthly balancing (Order 222 Annex 1 Art. 17.2). The identity is exact in
 * integer minor units — there is no tolerance band, because every movement in
 * this module is integral and the ledger records all four terms. A non-zero
 * discrepancy is therefore always a real defect, never rounding.
 */
export function balanceJackpot(input: BalancingInput): BalancingResult {
  const expected =
    input.openingMinor + input.contributionsMinor + input.houseSeededMinor - input.paidOutMinor;
  const discrepancy = input.closingMinor - expected;
  return {
    expectedClosingMinor: expected,
    actualClosingMinor: input.closingMinor,
    discrepancyMinor: discrepancy,
    incident: discrepancy !== 0,
  };
}

/**
 * GLI §4.13.9 — multiple simultaneous triggers.
 *
 * The clause assumes a jackpot that several players can trigger at the same
 * instant, and requires either an accurately recorded order, a full payoff to
 * each, or a disclosed distribution. Landfall cannot reach that state: exactly
 * ONE surviving stake is selected per surge round by `pickGoldenAnchor`, from a
 * single deterministic draw over the public lock snapshot. This function is the
 * executable statement of that fact for the submission — it takes the winners a
 * round produced and asserts the invariant, so the claim is tested rather than
 * asserted in prose.
 */
export function assertSingleWinner(winnerStakeIds: readonly string[]): void {
  if (winnerStakeIds.length > 1) {
    throw new Error(
      `JACKPOT INVARIANT VIOLATION: ${winnerStakeIds.length} simultaneous Golden Anchor winners ` +
        `(${winnerStakeIds.join(', ')}); GLI-19 §4.13.9 requires exactly one`,
    );
  }
}
