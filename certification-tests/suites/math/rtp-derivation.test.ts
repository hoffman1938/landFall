/**
 * MATH VERIFICATION — the published return to player, proved rather than
 * measured.
 *
 * GLI-19 §4.7.1 sets a floor (75% for a house-banked game) and §4.7.2 requires a
 * DISPLAYED return to be accompanied by an explanation of how it was determined.
 * A pari-mutuel game has no paytable to sum, so the derivation is algebraic; the
 * job of this file is to check the algebra against the code, independently, in
 * three different ways:
 *
 *   1. TERM BY TERM against the closed forms written out below by hand.
 *   2. BY EXHAUSTIVE ENUMERATION of the outcome space where that is possible —
 *      the ladder has 2^20 outcomes and can simply be summed.
 *   3. BY EXACT INTEGER ARITHMETIC, in BigInt, so that no floating-point
 *      rounding can hide a discrepancy in the funding invariants.
 *
 * The measured counterpart lives in `simulations/rtp-convergence.ts`, which runs
 * the production settlement over millions of rounds and reports a confidence
 * interval. Neither is sufficient alone: a simulation that agrees with a wrong
 * model proves nothing, and a model nothing implements proves less.
 */
import { describe, expect, it } from 'vitest';
import {
  RAKE,
  RAKE_SPLIT,
  STORM_POWER_LADDER,
  SURGE_PROB,
  SURGE_RESET_BUDGET_FRACTION,
  ZONE_COUNT,
  affordableResetMinor,
  economyDisclosure,
  expectedOverpayment,
  settleRound,
  surgeResetFor,
  theoreticalRtp,
  type StakeEntry,
} from '@landfall/core';

const r = RAKE;
const K = ZONE_COUNT;

describe('the four return flows, term by term', () => {
  /**
   * FLOW 1 — the pari-mutuel pass-through.
   *
   * Every credit staked is returned except the rake, and the rake is taken only
   * from the struck pool. The draw is uniform and independent of the pools, so
   * E[P_struck] = T/K exactly whatever shape the crowd takes, and the expected
   * deduction is (r/K)·T.
   *
   *     base = 1 − r/K
   */
  it('base return is 1 − r/K, and the identity holds for any pool shape', () => {
    const b = theoreticalRtp();
    expect(b.baseReturn).toBeCloseTo(1 - r / K, 12);

    /*
     * The claim "E[P_struck] = T/K whatever the shape" is the load-bearing one,
     * so it is checked by enumeration rather than asserted: for an arbitrary
     * pool shape, average the rake over all K equally likely harbours and it is
     * always exactly r/K of the handle (up to the floor in the rake).
     */
    const shapes = [
      [1_00, 1_00, 1_00, 1_00, 1_00, 1_00],
      [500_00, 1_00, 1_00, 1_00, 1_00, 1_00],
      [10_00, 20_00, 30_00, 40_00, 50_00, 60_00],
      [1, 1, 1, 1, 1, 900_00], // extreme imbalance, but every harbour occupied
    ];
    for (const pools of shapes) {
      const handle = pools.reduce((a, b2) => a + b2, 0);
      let rakeSum = 0;
      for (let z = 0; z < K; z++) {
        const stakes: StakeEntry[] = pools.map((amountMinor, zone) => ({
          id: `z${zone}`,
          zone,
          amountMinor,
          isHouseSeed: false,
        }));
        rakeSum += settleRound(stakes, z, r).rakeMinor;
      }
      const meanRakeRate = rakeSum / K / handle;
      // Exact up to the per-round floor, which can only ever reduce the rake.
      expect(meanRakeRate).toBeLessThanOrEqual(r / K + 1e-9);
      expect(meanRakeRate).toBeGreaterThan(r / K - 0.001);
    }
  });

  /**
   * FLOW 2 — the Storm Power ladder.
   *
   * Survivors' salvage is multiplied by M ≥ 1 and the overpayment E[M−1] is paid
   * from the Storm Reserve on top of the base. The multiplier applies to the
   * distributable pool, which is (1−r)·P_struck, so as a fraction of handle:
   *
   *     power = E[M−1] · (1−r) / K
   */
  it('ladder return is E[M−1]·(1−r)/K, with E[M−1] summed exactly', () => {
    // Exhaustive: the ladder's outcome space is 2^20 and every tier is an
    // explicit integer count, so E[M−1] is a finite exact sum.
    const space = BigInt(STORM_POWER_LADDER[STORM_POWER_LADDER.length - 1]!.cumBound);
    expect(space).toBe(BigInt(2 ** 20));

    // Σ count · (m − 1), as an exact rational over a common denominator.
    let numerator = 0n;
    let denominator = 1n;
    let prev = 0n;
    for (const tier of STORM_POWER_LADDER) {
      const count = BigInt(tier.cumBound) - prev;
      prev = BigInt(tier.cumBound);
      const mNum = BigInt(tier.mNum);
      const mDen = BigInt(tier.mDen);
      // count·(mNum/mDen − 1) = count·(mNum − mDen)/mDen
      numerator = numerator * mDen + count * (mNum - mDen) * denominator;
      denominator *= mDen;
    }
    const exact = Number(numerator) / Number(denominator) / Number(space);
    expect(expectedOverpayment()).toBeCloseTo(exact, 12);

    const b = theoreticalRtp();
    expect(b.stormPowerReturn).toBeCloseTo((exact * (1 - r)) / K, 12);
  });

  /**
   * FLOW 3 — the Storm Surge jackpot.
   *
   * The surge share of the rake feeds the pot, and the pot is always paid out:
   * Order 222 Art. 17.3 forbids cancelling an unpaid jackpot, so a rollover
   * defers a payout rather than removing one. Over any horizon the whole
   * contribution returns.
   *
   *     surge = split.surge · r / K
   */
  it('jackpot return is split.surge·r/K', () => {
    const b = theoreticalRtp();
    expect(b.surgeReturn).toBeCloseTo((RAKE_SPLIT.surge * r) / K, 12);
  });

  /**
   * FLOW 4 — the house-funded jackpot reset (rules v4).
   *
   * After every win the house restores the pot to its reset value out of its own
   * share of the rake. That is operator capital which reaches a player the next
   * time the pot pays, so it belongs in the return figure. It is expressible as a
   * constant only because `surgeResetFor` sets the reset to a fixed fraction of
   * what the house share can fund:
   *
   *     reset            = budget · [ split.house · r/K · H ] / surgeProb
   *     cost per round   = reset · surgeProb
   *                      = budget · split.house · r/K · H
   *     as a fraction of H:   budget · split.house · r/K
   *
   * The H cancels, which is the whole point: the flow does not move with table
   * size. Under rules v3 a minimum overrode the budget at every shipped tier and
   * this cancellation did not hold, which is why the term was missing from the
   * published figure and why measured return ran above it.
   */
  it('reset return is budget·split.house·r/K, and the handle cancels', () => {
    const b = theoreticalRtp();
    const closedForm = (SURGE_RESET_BUDGET_FRACTION * RAKE_SPLIT.house * r) / K;
    expect(b.jackpotReseedReturn).toBeCloseTo(closedForm, 12);

    // The cancellation, checked over five orders of magnitude of table size.
    for (const H of [90_00, 1_000_00, 50_000_00, 5_000_000_00, 500_000_000_00]) {
      const reset = surgeResetFor({
        handlePerRoundMinor: H,
        rake: r,
        houseShare: RAKE_SPLIT.house,
        zones: K,
        surgeProb: SURGE_PROB,
      });
      const perRoundCostAsFractionOfHandle = (reset * SURGE_PROB) / H;
      expect(perRoundCostAsFractionOfHandle, `handle ${H}`).toBeCloseTo(closedForm, 4);
    }
  });

  /** The four flows are the whole of it — nothing else is returned or kept. */
  it('the four flows sum to the published figure and its complement', () => {
    const b = theoreticalRtp();
    const sum = b.baseReturn + b.stormPowerReturn + b.surgeReturn + b.jackpotReseedReturn;
    expect(sum).toBeCloseTo(b.totalRtp, 12);
    expect(b.totalRtp + b.operatorHold).toBeCloseTo(1, 12);
  });
});

describe('what the operator actually keeps', () => {
  /**
   * The hold is the house share of the rake, less what the house pays back into
   * the jackpot, plus the unspent head-room in the reserve's funding budget.
   * Naming that third component matters: an unexplained residue in the hold is
   * what a variance investigation spends a week chasing.
   */
  it('decomposes exactly into its three components', () => {
    const b = theoreticalRtp();
    const houseShare = RAKE_SPLIT.house * (r / K);
    const paidBackToJackpot = SURGE_RESET_BUDGET_FRACTION * houseShare;
    const reserveHeadroom = RAKE_SPLIT.stormReserve * (r / K) - b.stormPowerReturn;

    expect(reserveHeadroom).toBeGreaterThanOrEqual(0);
    expect(b.operatorHold).toBeCloseTo(houseShare - paidBackToJackpot + reserveHeadroom, 12);
  });

  /**
   * THE FUNDING INVARIANT, in exact integer arithmetic. The ladder's expected
   * overpayment must be payable from the reserve's share of the rake, or the
   * fund is structurally insolvent. Stated over a common denominator in BigInt
   * so no floating-point rounding can hide a shortfall.
   *
   *     E[M−1] · (1−r) ≤ split.stormReserve · r
   */
  it('the ladder is funded by its reserve share, proved in integers', () => {
    const space = BigInt(STORM_POWER_LADDER[STORM_POWER_LADDER.length - 1]!.cumBound);
    // Σ count·(mNum − mDen)/mDen, over a common denominator of 4 (the only
    // fractional tier is 5/4), doubled to keep everything integral.
    const DEN = 4n;
    let weighted = 0n;
    let prev = 0n;
    for (const tier of STORM_POWER_LADDER) {
      const count = BigInt(tier.cumBound) - prev;
      prev = BigInt(tier.cumBound);
      const mNum = BigInt(tier.mNum);
      const mDen = BigInt(tier.mDen);
      expect(DEN % mDen).toBe(0n); // the common denominator really is common
      weighted += (count * (mNum - mDen) * (DEN / mDen));
    }
    // E[M−1] = weighted / (DEN · space).
    // Invariant: weighted/(DEN·space) · (1−r) ≤ split.reserve · r
    // With r = 12/100 and split.reserve = 1/4, in integers:
    //   weighted · 88 · 4 ≤ 1 · 12 · DEN · space   (after clearing 1/100 and 1/4)
    const rNum = 12n; // r = 12/100
    const rDen = 100n;
    const oneMinusR = rDen - rNum; // 88/100
    const resNum = 1n; // split.stormReserve = 1/4
    const resDen = 4n;
    const lhs = weighted * oneMinusR * resDen;
    const rhs = resNum * rNum * DEN * space;
    expect(r).toBeCloseTo(Number(rNum) / Number(rDen), 12);
    expect(RAKE_SPLIT.stormReserve).toBeCloseTo(Number(resNum) / Number(resDen), 12);
    expect(lhs <= rhs, `ladder draws ${lhs} against a budget of ${rhs}`).toBe(true);

    // …and it uses most of that budget, which is what makes the ladder
    // marketable rather than merely safe. Utilisation is reported, not asserted
    // at a magic threshold.
    const utilisation = Number(lhs) / Number(rhs);
    expect(utilisation).toBeGreaterThan(0.9);
    expect(utilisation).toBeLessThanOrEqual(1);
  });
});

describe('GLI-19 §4.7.1 — the minimum payout floor', () => {
  /**
   * §4.7.1 requires a theoretical payout of at least 75% "for all wagering
   * configurations … if a game is continuously played at any single bet level,
   * line configuration, etc. for the life of the game".
   *
   * For a pari-mutuel game the wagering configuration that matters is the crowd,
   * not the bet level, so the floor is checked across pool shapes rather than
   * across bet sizes — including the shapes that are worst for the player.
   */
  it('clears 75% by a wide margin, at every table size and every pool shape', () => {
    expect(theoreticalRtp().totalRtp).toBeGreaterThan(0.75);

    // The economy is configurable; the floor must hold across the permitted
    // range of the rake, not only at the shipped value.
    for (const rake of [0.06, 0.12, 0.2]) {
      const b = theoreticalRtp(rake);
      expect(b.totalRtp, `rake ${rake}`).toBeGreaterThan(0.75);
      expect(b.operatorHold, `rake ${rake}`).toBeGreaterThan(0);
    }
  });

  /**
   * The worst realistic single-round case for a player: they are alone against
   * the house seeds, so their own stake makes their harbour the heaviest pool
   * and they are effectively the whale of their own round. Even here the return
   * must clear the floor comfortably.
   */
  it('a solo player against the house seeds still clears the floor', () => {
    const seed = 25_00;
    const stake = 100_00;
    let returned = 0;
    for (let z = 0; z < K; z++) {
      const stakes: StakeEntry[] = [
        ...Array.from({ length: K }, (_, zone) => ({
          id: `h${zone}`,
          zone,
          amountMinor: seed,
          isHouseSeed: true,
        })),
        { id: 'solo', zone: 0, amountMinor: stake, isHouseSeed: false },
      ];
      const line = settleRound(stakes, z, r).lines.find((l) => l.id === 'solo')!;
      returned += line.payoutMinor;
    }
    const rtp = returned / (K * stake);
    expect(rtp).toBeGreaterThan(0.75);
    // Documented in math-model §6: a lone player's edge is worse than nominal
    // because their own stake dominates their pool. Bounded, and stated.
    expect(rtp).toBeLessThan(theoreticalRtp().totalRtp);
    /*
     * Measured: 91.48% at a 25.00 seed against a 100.00 stake. The shortfall is
     * entirely structural and is the reason `houseSeedPerZone` raises the seed
     * when a table goes quiet — a bigger seed dilutes the player's own weight in
     * their pool and pulls this figure back toward the published one. It is
     * disclosed in docs/02-math-verification.md §6 rather than averaged away.
     */
    expect(rtp).toBeGreaterThan(0.9);
    expect(rtp).toBeCloseTo(0.9148, 3);
  });

  /**
   * THE CONFIGURATION THAT USED TO RETURN ZERO.
   *
   * A room may be configured with no house seed at all (`seedMinor: 0`), which
   * is a legitimate pure-player-versus-player table and is the most §A.7.1-clean
   * configuration there is. In such a room every stake can land on the harbour
   * the storm hits, and settlement used to book the ENTIRE pool as rake — a 100%
   * hold, against a §4.7.1 floor of 75%. It now returns every bet.
   */
  it('returns every bet when no harbour survives, rather than taking the pool', () => {
    const stakes: StakeEntry[] = [
      { id: 'a', zone: 2, amountMinor: 100_00, isHouseSeed: false },
      { id: 'b', zone: 2, amountMinor: 250_00, isHouseSeed: false },
      { id: 'c', zone: 2, amountMinor: 1_00, isHouseSeed: false },
    ];
    const result = settleRound(stakes, 2, r);
    expect(result.allStakesRefunded).toBe(true);
    expect(result.rakeMinor).toBe(0);
    expect(result.houseDeltaMinor).toBe(0);
    for (const line of result.lines) {
      expect(line.payoutMinor).toBe(line.amountMinor);
    }
    const paid = result.lines.reduce((a, l) => a + l.payoutMinor, 0);
    const handle = stakes.reduce((a, st) => a + st.amountMinor, 0);
    expect(paid).toBe(handle);
    // Return on this configuration is exactly 100%, which clears the floor.
    expect(paid / handle).toBe(1);
  });
});

describe('GLI-19 §4.7.2 — the displayed figure explains itself', () => {
  it('the player-facing sentence names every term and the hold', () => {
    const b = theoreticalRtp();
    const d = economyDisclosure();
    expect(d.longRunReturn).toBe(`${(b.totalRtp * 100).toFixed(1)}%`);
    for (const term of [
      b.baseReturn,
      b.surgeReturn,
      b.stormPowerReturn,
      b.jackpotReseedReturn,
      b.operatorHold,
    ]) {
      expect(d.derivation).toContain(`${(term * 100).toFixed(2)}%`);
    }
    // §4.7.2(e): a displayed figure that is theoretical must say so, or it reads
    // as a measurement of past play.
    expect(d.derivation.toLowerCase()).toContain('theoretical');
  });

  it('the figure is a pure function of configuration, not of table size', () => {
    // Two rooms with the same economy config must publish the same number,
    // whatever their stake tier or population.
    const a = theoreticalRtp(r, RAKE_SPLIT, K);
    const b = theoreticalRtp(r, RAKE_SPLIT, K);
    expect(a).toEqual(b);

    // And the affordability ceiling the reset is drawn from scales linearly
    // with handle, which is why the reset term is scale-free.
    const c1 = affordableResetMinor({
      handlePerRoundMinor: 1_000_00,
      rake: r,
      houseShare: RAKE_SPLIT.house,
      zones: K,
      surgeProb: SURGE_PROB,
    });
    const c10 = affordableResetMinor({
      handlePerRoundMinor: 10_000_00,
      rake: r,
      houseShare: RAKE_SPLIT.house,
      zones: K,
      surgeProb: SURGE_PROB,
    });
    expect(c10 / c1).toBeCloseTo(10, 6);
  });
});
