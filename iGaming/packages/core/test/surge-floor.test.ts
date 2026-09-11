/**
 * The jackpot's RESET VALUE has to be something the table can actually pay for,
 * AND it has to cost a knowable fraction of handle — those are two different
 * properties, and this file has now been written twice because only the first
 * was pinned.
 *
 * v1 was `max(500 credits, 20 × minStake)`: a flat floor with a per-table term
 * bolted on, where the flat term always won below a 25-credit minimum bet.
 * Measured over 1,200 rounds it cost 6.5% of handle on Skiff against a ~1%
 * house share; both small tiers lost money on every round played.
 *
 * v3 replaced it with `max(20 × minStake, budgetFraction × affordable)`, capped
 * by affordability — and the floor won at EVERY shipped tier, so the budget
 * fraction was inert exactly as the flat term had been. The test that claimed
 * to pin the "two thirds of the house share stays as margin" property called
 * `surgeResetFor` with `minimum: 0`, so it never once exercised the branch that
 * production takes. That is the bug in the old test, and it is why the checks
 * below never pass a minimum: THERE IS NO LONGER ONE TO PASS.
 *
 * v4: the reset is `budgetFraction × affordable`, unconditionally. That makes
 * the re-seed cost a constant fraction of handle at every tier and every table
 * size, which is what lets it be published as the fourth term of theoretical
 * RTP (`core/rtp.ts`) instead of silently inflating realised return above the
 * displayed figure.
 */
import { describe, expect, it } from 'vitest';
import {
  RAKE,
  RAKE_SPLIT,
  SURGE_FLOOR_MIN_STAKE_MULTIPLE,
  SURGE_PROB,
  SURGE_RESET_BUDGET_FRACTION,
  ZONE_COUNT,
  affordableResetMinor,
  surgeCeilingFor,
  surgeFloorFor,
  surgeResetFor,
  theoreticalRtp,
} from '../src/index.js';

/** The shipped tier ladder — each rung steps ×10 from the last. */
const TIERS = [
  { room: 'skiff', minStakeMinor: 1_00, maxStakeMinor: 50_00, liquidityFloorMinor: 90_00 },
  { room: 'schooner', minStakeMinor: 5_00, maxStakeMinor: 500_00, liquidityFloorMinor: 180_00 },
  { room: 'flagship', minStakeMinor: 50_00, maxStakeMinor: 5_000_00, liquidityFloorMinor: 900_00 },
  { room: 'galleon', minStakeMinor: 500_00, maxStakeMinor: 50_000_00, liquidityFloorMinor: 4_500_00 },
  { room: 'leviathan', minStakeMinor: 5_000_00, maxStakeMinor: 500_000_00, liquidityFloorMinor: 22_500_00 },
];

/** Handle per round measured in the certification simulation at each tier. */
const MEASURED_HANDLE: Record<string, number> = {
  skiff: 155_00,
  schooner: 654_00,
  flagship: 6_871_00,
  galleon: 54_937_00,
  leviathan: 464_315_00,
};

const policy = (handlePerRoundMinor: number) => ({
  handlePerRoundMinor,
  rake: RAKE,
  houseShare: RAKE_SPLIT.house,
  zones: ZONE_COUNT,
  surgeProb: SURGE_PROB,
});

describe('jackpot reset value — affordability', () => {
  /**
   * THE FIRST INVARIANT. The re-seed costs `reset` every `1/surgeProb` rounds
   * and is funded from `split.house × r/K` of handle. If the reset exceeds
   * that, the table loses money on every round it plays.
   */
  it('never costs more than the house share of the rake can fund, at any tier', () => {
    for (const tier of TIERS) {
      for (const handle of [
        tier.liquidityFloorMinor,
        MEASURED_HANDLE[tier.room]!,
        tier.minStakeMinor * 5_000,
      ]) {
        const costPerRound = surgeResetFor(policy(handle)) * SURGE_PROB;
        const houseSharePerRound = (RAKE_SPLIT.house * RAKE * handle) / ZONE_COUNT;
        expect(
          costPerRound,
          `${tier.room} at handle ${handle}: re-seed ${costPerRound} vs house share ${houseSharePerRound}`,
        ).toBeLessThanOrEqual(houseSharePerRound);
      }
    }
  });

  /**
   * THE SECOND INVARIANT, and the one v3 lacked. Affordability alone is not
   * enough: a reset that merely stays under the ceiling can still consume a
   * variable share of it, which makes return to player a function of table
   * population. Pin the SHARE, at every tier, at the handle each tier actually
   * turns over.
   */
  it('consumes exactly the budgeted share of the house rake at every shipped tier', () => {
    for (const tier of TIERS) {
      for (const handle of [tier.liquidityFloorMinor, MEASURED_HANDLE[tier.room]!]) {
        const reset = surgeResetFor(policy(handle));
        const ceiling = affordableResetMinor(policy(handle));
        expect(reset / ceiling, `${tier.room} at handle ${handle}`).toBeCloseTo(
          SURGE_RESET_BUDGET_FRACTION,
          3,
        );
      }
    }
  });

  /**
   * THE REGRESSION GUARD, stated as the thing that actually went wrong: under
   * v3 the `20 × minStake` floor beat the budget figure at every shipped tier,
   * so the tuning parameter did nothing. If a floor is ever reintroduced, this
   * is the test that has to be argued with.
   */
  it('the retired v3 floor would have overridden the budget at every shipped tier', () => {
    const overridden: string[] = [];
    for (const tier of TIERS) {
      const handle = MEASURED_HANDLE[tier.room]!;
      const budget = Math.floor(affordableResetMinor(policy(handle)) * SURGE_RESET_BUDGET_FRACTION);
      if (surgeFloorFor(tier.minStakeMinor) > budget) overridden.push(tier.room);
    }
    expect(overridden).toEqual(TIERS.map((t) => t.room));

    // …and the shipped policy is the budget figure at each of them.
    for (const tier of TIERS) {
      const handle = MEASURED_HANDLE[tier.room]!;
      const budget = Math.floor(affordableResetMinor(policy(handle)) * SURGE_RESET_BUDGET_FRACTION);
      expect(surgeResetFor(policy(handle)), tier.room).toBe(budget);
    }
  });

  /**
   * The worst case the v3 floor produced: a table thin enough that the floor
   * exceeded the affordability CEILING got `reset = ceiling`, so the house spent
   * its whole rake share on the re-seed and the table returned 100% of handle.
   */
  it('cannot return the whole house share, however thin the table is', () => {
    for (const handle of [1_00, 10_00, 90_00, 500_00]) {
      const reset = surgeResetFor(policy(handle));
      const ceiling = affordableResetMinor(policy(handle));
      expect(reset).toBeLessThan(ceiling);
      expect(reset * SURGE_PROB).toBeLessThan((RAKE_SPLIT.house * RAKE * handle) / ZONE_COUNT);
    }
  });

  it('the flow it produces is exactly the published RTP term', () => {
    const published = theoreticalRtp().jackpotReseedReturn;
    expect(published).toBeCloseTo(
      SURGE_RESET_BUDGET_FRACTION * RAKE_SPLIT.house * (RAKE / ZONE_COUNT),
      12,
    );
    for (const tier of TIERS) {
      const handle = MEASURED_HANDLE[tier.room]!;
      const measured = (surgeResetFor(policy(handle)) * SURGE_PROB) / handle;
      expect(measured, tier.room).toBeCloseTo(published, 4);
    }
  });

  it('rises with the table, so a busier room plays for a bigger jackpot', () => {
    const quiet = surgeResetFor(policy(100_00));
    const busy = surgeResetFor(policy(1_000_00));
    const packed = surgeResetFor(policy(10_000_00));
    expect(busy).toBeGreaterThan(quiet);
    expect(packed).toBeGreaterThan(busy);
  });

  it('returns whole minor units, and never a negative one', () => {
    for (const tier of TIERS) {
      const reset = surgeResetFor(policy(tier.liquidityFloorMinor));
      expect(Number.isInteger(reset)).toBe(true);
      expect(reset).toBeGreaterThanOrEqual(0);
    }
    // Degenerate configs return zero rather than NaN or a negative.
    expect(surgeResetFor({ ...policy(1_000_00), surgeProb: 0 })).toBe(0);
    expect(surgeResetFor({ ...policy(1_000_00), zones: 0 })).toBe(0);
    expect(surgeResetFor(policy(0))).toBe(0);
  });
});

describe('jackpot ceiling', () => {
  /**
   * GLI-19 §2.4.2 — once contributions have been made, a jackpot ceiling may be
   * changed only UPWARD. The reset value is adaptive, so deriving the ceiling
   * from it would let the ceiling fall when a table went quiet. Making it a pure
   * function of the tier satisfies the clause by construction: it cannot move.
   */
  it('depends only on the tier, so it can never move downward', () => {
    for (const tier of TIERS) {
      const a = surgeCeilingFor(tier.minStakeMinor);
      const b = surgeCeilingFor(tier.minStakeMinor);
      expect(a).toBe(b);
      expect(a).toBeGreaterThan(tier.maxStakeMinor);
    }
  });

  it('rises with the tier', () => {
    const ceilings = TIERS.map((t) => surgeCeilingFor(t.minStakeMinor));
    for (let i = 1; i < ceilings.length; i++) {
      expect(ceilings[i]!).toBeGreaterThan(ceilings[i - 1]!);
    }
  });
});

describe('surgeFloorFor — now the OPENING pot only', () => {
  /**
   * Its one surviving use is the opening balance of a table that has never paid
   * a jackpot: a single house cost at room creation, not a recurring guarantee.
   * It is deliberately no longer an input to `surgeResetFor`.
   */
  it('is worth the configured number of minimum bets at every tier', () => {
    for (const tier of TIERS) {
      expect(surgeFloorFor(tier.minStakeMinor) / tier.minStakeMinor).toBe(
        SURGE_FLOOR_MIN_STAKE_MULTIPLE,
      );
    }
  });

  it('no longer carries the flat 500-credit floor that broke the small tiers', () => {
    expect(surgeFloorFor(1_00)).toBe(20 * 1_00);
    expect(surgeFloorFor(5_00)).toBe(20 * 5_00);
  });
});
