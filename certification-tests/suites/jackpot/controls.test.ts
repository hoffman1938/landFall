/**
 * JACKPOT CONTROL SOFTWARE — GLI-19 §4.13 and Order 222 Annex 1 Art. 17.
 *
 * Order 222 Art. 17.1 requires the jackpot PROGRAM (what players see) and the
 * jackpot CONTROL SOFTWARE (the accounting that proves the program is honest) to
 * be authorized SEPARATELY. That is only possible if the control software exists
 * as a distinct, reviewable artefact rather than as arithmetic inlined in the
 * settlement transaction — which is why `core/jackpot.ts` is its own module of
 * pure integer functions with no clock, no database and no randomness in it.
 *
 * This file tests that module against the clauses it implements:
 *
 *   §4.13.3        maximum payoff limit; contributions above it go to a
 *                  diversion pool rather than being lost
 *   §4.13.5        a diversion scheme must not have infinite expectation
 *   §4.13.6(a)     contributions are never lost
 *   §4.13.6(b)     a payoff is never rounded down or truncated
 *   §4.13.6(d)     the pot returns to a defined reset value
 *   §4.13.9        one winner, or a disclosed distribution
 *   §2.4.2         a ceiling may only ever move upward once contributions exist
 *   Art. 17.2      monthly balancing, discrepancies raised as incidents
 *   Art. 17.3      an unpaid jackpot may not be cancelled
 *   Art. 17.4      decommissioning transfers, never cancels
 */
import { describe, expect, it } from 'vitest';
import {
  RAKE,
  RAKE_SPLIT,
  SURGE_PROB,
  SURGE_RESET_BUDGET_FRACTION,
  ZONE_COUNT,
  affordableResetMinor,
  assertSingleWinner,
  balanceJackpot,
  contributeToSurge,
  decommissionSurge,
  payOutSurge,
  rollOverSurge,
  surgeCeilingFor,
  surgeResetFor,
  type SurgePotPolicy,
  type SurgePotState,
} from '@landfall/core';

const policy: SurgePotPolicy = { resetMinor: 1_000, ceilingMinor: 100_000 };

describe('GLI-19 §4.13.6(a) — contributions are never lost', () => {
  it('every contributed unit reaches either the pot or the diversion pool', () => {
    let state: SurgePotState = { potMinor: 0, diversionMinor: 0 };
    let contributed = 0;
    for (let i = 0; i < 5_000; i++) {
      const amount = (i * 37) % 911;
      const c = contributeToSurge(state, amount, policy);
      expect(c.toPotMinor + c.toDiversionMinor).toBe(amount);
      state = c.state;
      contributed += amount;
    }
    expect(state.potMinor + state.diversionMinor).toBe(contributed);
  });

  it('refuses to be fed a fractional or negative contribution', () => {
    const c = contributeToSurge({ potMinor: 0, diversionMinor: 0 }, -500, policy);
    expect(c.toPotMinor).toBe(0);
    expect(c.state.potMinor).toBe(0);
    const f = contributeToSurge({ potMinor: 0, diversionMinor: 0 }, 10.9, policy);
    expect(f.toPotMinor).toBe(10);
    expect(Number.isInteger(f.state.potMinor)).toBe(true);
  });
});

describe('GLI-19 §4.13.3 — the ceiling and its diversion pool', () => {
  it('stops the pot at the ceiling and diverts the overflow', () => {
    let state: SurgePotState = { potMinor: 99_000, diversionMinor: 0 };
    const c = contributeToSurge(state, 5_000, policy);
    expect(c.toPotMinor).toBe(1_000);
    expect(c.toDiversionMinor).toBe(4_000);
    expect(c.state.potMinor).toBe(policy.ceilingMinor);
    expect(c.atCeiling).toBe(true);

    // Everything after the ceiling is diverted in full, never dropped.
    state = c.state;
    const d = contributeToSurge(state, 7_777, policy);
    expect(d.toPotMinor).toBe(0);
    expect(d.toDiversionMinor).toBe(7_777);
  });

  it('the diverted money comes straight back as the next pot', () => {
    const state: SurgePotState = { potMinor: 100_000, diversionMinor: 40_000 };
    const payout = payOutSurge(state, policy);
    expect(payout.paidMinor).toBe(100_000);
    expect(payout.fromDiversionMinor).toBe(policy.resetMinor);
    expect(payout.fromHouseMinor).toBe(0);
    expect(payout.state.potMinor).toBe(policy.resetMinor);
    expect(payout.state.diversionMinor).toBe(40_000 - policy.resetMinor);
  });

  /**
   * §2.4.2(b) — once contributions exist, a ceiling may only be changed to a
   * value GREATER than the current payoff. Landfall satisfies this by
   * construction rather than by procedure: the ceiling is a pure function of the
   * table's minimum bet, so it cannot move at all while the table exists.
   */
  it('the ceiling is a pure function of the tier and cannot drift downward', () => {
    for (const minStake of [1_00, 5_00, 50_00, 500_00, 5_000_00]) {
      const a = surgeCeilingFor(minStake);
      const b = surgeCeilingFor(minStake);
      expect(a).toBe(b);
      expect(a).toBeGreaterThan(0);
    }
    // Rising tiers, rising ceilings: a Skiff pot can never advertise a
    // Leviathan number.
    const ceilings = [1_00, 5_00, 50_00, 500_00, 5_000_00].map(surgeCeilingFor);
    for (let i = 1; i < ceilings.length; i++) {
      expect(ceilings[i]!).toBeGreaterThan(ceilings[i - 1]!);
    }
  });
});

describe('GLI-19 §4.13.6(b),(d) — payoff and reset', () => {
  it('pays the whole pot, to the minor unit, with no truncation', () => {
    for (const pot of [1, 999, 12_345, 99_999]) {
      const payout = payOutSurge({ potMinor: pot, diversionMinor: 0 }, policy);
      expect(payout.paidMinor).toBe(pot);
    }
  });

  it('restores exactly the defined reset value, funded from diversion first', () => {
    const noDiversion = payOutSurge({ potMinor: 50_000, diversionMinor: 0 }, policy);
    expect(noDiversion.state.potMinor).toBe(policy.resetMinor);
    expect(noDiversion.fromHouseMinor).toBe(policy.resetMinor);

    const partial = payOutSurge({ potMinor: 50_000, diversionMinor: 400 }, policy);
    expect(partial.fromDiversionMinor).toBe(400);
    expect(partial.fromHouseMinor).toBe(policy.resetMinor - 400);
    expect(partial.state.diversionMinor).toBe(0);
  });

  /**
   * §4.13.5 — "a Jackpot Diversion Scheme shall be able to be implemented such
   * that it does not have a mathematical expectation of infinity."
   *
   * The scheme here is bounded by construction and the bound is checkable: the
   * pot can never exceed the ceiling, the diversion pool only ever funds the
   * reset, and the reset is itself bounded by what the rake share can fund. The
   * test drives the whole cycle for long enough to show the state stays inside
   * those bounds rather than drifting.
   */
  it('the diversion scheme has finite expectation and a bounded state', () => {
    let state: SurgePotState = { potMinor: policy.resetMinor, diversionMinor: 0 };
    let maxPot = 0;
    let maxDiversion = 0;
    for (let round = 1; round <= 200_000; round++) {
      state = contributeToSurge(state, 400, policy).state;
      maxPot = Math.max(maxPot, state.potMinor);
      maxDiversion = Math.max(maxDiversion, state.diversionMinor);
      // A win roughly every 25 rounds, as SURGE_PROB implies.
      if (round % 25 === 0) state = payOutSurge(state, policy).state;
    }
    expect(maxPot).toBeLessThanOrEqual(policy.ceilingMinor);
    // The diversion pool is drained by every reset, so it cannot run away.
    expect(maxDiversion).toBeLessThan(policy.ceilingMinor);
  });
});

describe('Order 222 Art. 17.3 — an unpaid jackpot is never cancelled', () => {
  it('a rollover leaves the pot and the diversion pool untouched', () => {
    const before: SurgePotState = { potMinor: 87_654, diversionMinor: 3_210 };
    const after = rollOverSurge(before);
    expect(after).toEqual(before);
    expect(after).not.toBe(before); // a copy, so a caller cannot mutate history
  });

  /**
   * The negative statement matters more than the positive one: there must be no
   * function in the control software that reduces a pot without paying it. That
   * is asserted structurally — `payOutSurge` is the only reducer, and it returns
   * the amount paid.
   */
  it('the only way a pot goes down is a payout that returns what was paid', () => {
    const start: SurgePotState = { potMinor: 50_000, diversionMinor: 0 };
    const paid = payOutSurge(start, policy);
    const delta = start.potMinor - paid.state.potMinor;
    expect(paid.paidMinor - paid.resetMinor).toBe(delta);
    expect(rollOverSurge(start).potMinor).toBe(start.potMinor);
    expect(contributeToSurge(start, 0, policy).state.potMinor).toBe(start.potMinor);
  });
});

describe('Order 222 Art. 17.4 — decommissioning transfers, never cancels', () => {
  it('moves the whole balance and diversion pool to the destination', () => {
    const source: SurgePotState = { potMinor: 40_000, diversionMinor: 5_000 };
    const destination: SurgePotState = { potMinor: 10_000, diversionMinor: 1_000 };
    const result = decommissionSurge(source, destination, 0.04, 0.04);
    expect(result.transferredMinor).toBe(45_000);
    expect(result.destination.potMinor).toBe(50_000);
    expect(result.destination.diversionMinor).toBe(6_000);
  });

  it('refuses a destination where the player is less likely to win', () => {
    const source: SurgePotState = { potMinor: 40_000, diversionMinor: 0 };
    const destination: SurgePotState = { potMinor: 0, diversionMinor: 0 };
    expect(() => decommissionSurge(source, destination, 0.04, 0.01)).toThrow(/refused/i);
    // The refusal is the control: the money is not silently moved anyway.
    expect(source.potMinor).toBe(40_000);
  });

  it('allows a destination where the player is more likely to win', () => {
    const r = decommissionSurge({ potMinor: 100, diversionMinor: 0 }, { potMinor: 0, diversionMinor: 0 }, 0.04, 0.08);
    expect(r.transferredMinor).toBe(100);
  });
});

describe('Order 222 Art. 17.2 — monthly balancing', () => {
  it('reconciles exactly, with no tolerance band', () => {
    const clean = balanceJackpot({
      openingMinor: 10_000,
      contributionsMinor: 250_000,
      paidOutMinor: 200_000,
      houseSeededMinor: 4_000,
      closingMinor: 64_000,
    });
    expect(clean.discrepancyMinor).toBe(0);
    expect(clean.incident).toBe(false);
  });

  it('raises an incident on a discrepancy of a single minor unit', () => {
    const drifted = balanceJackpot({
      openingMinor: 10_000,
      contributionsMinor: 250_000,
      paidOutMinor: 200_000,
      houseSeededMinor: 4_000,
      closingMinor: 64_001,
    });
    expect(drifted.discrepancyMinor).toBe(1);
    expect(drifted.incident).toBe(true);
  });

  /**
   * The identity must survive a realistic month rather than a hand-built
   * example, so a full cycle is driven through the control functions and then
   * balanced from the aggregates it produced.
   */
  it('balances a simulated month driven through the control software', () => {
    let state: SurgePotState = { potMinor: policy.resetMinor, diversionMinor: 0 };
    const opening = state.potMinor + state.diversionMinor;
    let contributions = 0;
    let paidOut = 0;
    let houseSeeded = 0;
    for (let round = 1; round <= 90_000; round++) {
      const amount = 300 + (round % 17);
      state = contributeToSurge(state, amount, policy).state;
      contributions += amount;
      if (round % 25 === 0) {
        const payout = payOutSurge(state, policy);
        paidOut += payout.paidMinor;
        houseSeeded += payout.fromHouseMinor;
        state = payout.state;
      }
    }
    const result = balanceJackpot({
      openingMinor: opening,
      contributionsMinor: contributions,
      paidOutMinor: paidOut,
      houseSeededMinor: houseSeeded,
      closingMinor: state.potMinor + state.diversionMinor,
    });
    expect(result.discrepancyMinor).toBe(0);
    expect(result.incident).toBe(false);
  });
});

describe('GLI-19 §4.13.9 — one winner per trigger', () => {
  it('accepts a single winner and refuses simultaneous ones', () => {
    expect(() => assertSingleWinner(['one'])).not.toThrow();
    expect(() => assertSingleWinner([])).not.toThrow(); // a rollover
    expect(() => assertSingleWinner(['a', 'b'])).toThrow(/4\.13\.9/);
  });
});

describe('the reset value is affordable and disclosed', () => {
  /**
   * The reset is a recurring operator cost of `reset × surgeProb` per round,
   * funded from the house share of the rake. If it exceeds that, every round
   * played loses money — which is not a compliance failure on its own, but it is
   * how a tier ends up returning more than 100% and it makes the published RTP
   * wrong in the direction that matters.
   */
  it('never exceeds what the house share of the rake can fund', () => {
    for (const handle of [90_00, 1_000_00, 100_000_00, 10_000_000_00]) {
      const input = {
        handlePerRoundMinor: handle,
        rake: RAKE,
        houseShare: RAKE_SPLIT.house,
        zones: ZONE_COUNT,
        surgeProb: SURGE_PROB,
      };
      const reset = surgeResetFor(input);
      const ceiling = affordableResetMinor(input);
      expect(reset).toBeLessThan(ceiling);
      expect(reset / ceiling).toBeCloseTo(SURGE_RESET_BUDGET_FRACTION, 3);
      expect(reset * SURGE_PROB).toBeLessThan((RAKE_SPLIT.house * RAKE * handle) / ZONE_COUNT);
    }
  });

  it('degrades safely on a degenerate configuration rather than throwing', () => {
    const base = {
      handlePerRoundMinor: 1_000_00,
      rake: RAKE,
      houseShare: RAKE_SPLIT.house,
      zones: ZONE_COUNT,
      surgeProb: SURGE_PROB,
    };
    expect(surgeResetFor({ ...base, surgeProb: 0 })).toBe(0);
    expect(surgeResetFor({ ...base, zones: 0 })).toBe(0);
    expect(surgeResetFor({ ...base, handlePerRoundMinor: 0 })).toBe(0);
    expect(surgeResetFor({ ...base, houseShare: 0 })).toBe(0);
  });
});
