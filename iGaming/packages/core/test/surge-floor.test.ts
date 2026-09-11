/**
 * The jackpot's RESET VALUE has to be something the table can actually pay for.
 *
 * It used to be `max(500 credits, 20 × minStake)` — an absolute floor with a
 * per-table term bolted on. Below a 25-credit minimum bet the flat floor always
 * won, so the per-table scaling was inert on exactly the small tiers it was
 * written for. That mattered because the house re-seeds the pot to this value
 * after EVERY win: a recurring cost of `reset × surgeProb` per round, paid from
 * the house share of the rake and nothing else.
 *
 * Measured over 1,200 rounds it cost the operator 6.5% of handle on Skiff and
 * 1.5% on Schooner against a house share of ~1%. Both tiers lost money on every
 * round played and returned over 100% to players.
 *
 * The reset now follows the table's HANDLE, which is the quantity it has to be
 * paid out of. These tests pin the affordability property rather than any
 * particular number, so a future tuning change cannot re-break it.
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
} from '../src/index.js';

/** The shipped tier ladder — each rung steps ×10 from the last. */
const TIERS = [
  { room: 'skiff', minStakeMinor: 1_00, maxStakeMinor: 50_00, liquidityFloorMinor: 90_00 },
  { room: 'schooner', minStakeMinor: 5_00, maxStakeMinor: 500_00, liquidityFloorMinor: 180_00 },
  { room: 'flagship', minStakeMinor: 50_00, maxStakeMinor: 5_000_00, liquidityFloorMinor: 900_00 },
  { room: 'galleon', minStakeMinor: 500_00, maxStakeMinor: 50_000_00, liquidityFloorMinor: 4_500_00 },
  { room: 'leviathan', minStakeMinor: 5_000_00, maxStakeMinor: 500_000_00, liquidityFloorMinor: 22_500_00 },
];

const policy = (handlePerRoundMinor: number, minimumMinor: number) => ({
  handlePerRoundMinor,
  rake: RAKE,
  houseShare: RAKE_SPLIT.house,
  zones: ZONE_COUNT,
  surgeProb: SURGE_PROB,
  minimumMinor,
});

describe('jackpot reset value — affordability', () => {
  /**
   * THE INVARIANT. The re-seed costs `reset` every `1/surgeProb` rounds and is
   * funded from `split.house × r/K` of handle. If the reset exceeds that, the
   * table loses money on every round it plays.
   */
  it('never costs more than the house share of the rake can fund, at any tier', () => {
    for (const tier of TIERS) {
      // Sweep from a dead table up to a very busy one.
      for (const handle of [tier.liquidityFloorMinor, tier.minStakeMinor * 50, tier.minStakeMinor * 5_000]) {
        const reset = surgeResetFor(policy(handle, surgeFloorFor(tier.minStakeMinor)));
        const costPerRound = reset * SURGE_PROB;
        const houseSharePerRound = (RAKE_SPLIT.house * RAKE * handle) / ZONE_COUNT;
        expect(
          costPerRound,
          `${tier.room} at handle ${handle}: re-seed ${costPerRound} vs house share ${houseSharePerRound}`,
        ).toBeLessThanOrEqual(houseSharePerRound);
      }
    }
  });

  /**
   * The regression this change exists for. At the retired fixed value the two
   * smallest tiers were unaffordable by a wide margin — Skiff by more than 8×.
   */
  it('the retired fixed reset was unaffordable on Skiff and Schooner', () => {
    const RETIRED = (minStake: number): number => Math.max(500_00, 20 * minStake);
    // Handle per round measured in the certification simulation at each tier.
    const measured: Record<string, number> = {
      skiff: 128_00, schooner: 628_00, flagship: 5_462_00, galleon: 49_357_00, leviathan: 455_145_00,
    };
    const unaffordable: string[] = [];
    for (const tier of TIERS) {
      const ceiling = affordableResetMinor(policy(measured[tier.room]!, 0));
      if (RETIRED(tier.minStakeMinor) > ceiling) unaffordable.push(tier.room);
    }
    expect(unaffordable).toEqual(['skiff', 'schooner']);

    // …and the replacement is affordable on every one of them.
    for (const tier of TIERS) {
      const ceiling = affordableResetMinor(policy(measured[tier.room]!, 0));
      const reset = surgeResetFor(policy(measured[tier.room]!, surgeFloorFor(tier.minStakeMinor)));
      expect(reset, tier.room).toBeLessThanOrEqual(ceiling);
    }
  });

  it('affordability overrides the minimum — an unpayable guarantee is worse than a small one', () => {
    // A table so thin the "worth 20 minimum bets" floor cannot be funded.
    const thin = policy(10_00, 500_00);
    const reset = surgeResetFor(thin);
    expect(reset).toBeLessThan(500_00);
    expect(reset).toBeLessThanOrEqual(affordableResetMinor(thin));
  });

  it('rises with the table, so a busier room plays for a bigger jackpot', () => {
    const minimum = surgeFloorFor(1_00);
    const quiet = surgeResetFor(policy(100_00, minimum));
    const busy = surgeResetFor(policy(1_000_00, minimum));
    const packed = surgeResetFor(policy(10_000_00, minimum));
    expect(busy).toBeGreaterThan(quiet);
    expect(packed).toBeGreaterThan(busy);
  });

  it('leaves roughly two thirds of the house share as margin', () => {
    const handle = 10_000_00;
    const reset = surgeResetFor(policy(handle, 0));
    const ceiling = affordableResetMinor(policy(handle, 0));
    expect(reset / ceiling).toBeCloseTo(SURGE_RESET_BUDGET_FRACTION, 2);
  });

  it('returns whole minor units', () => {
    for (const tier of TIERS) {
      const reset = surgeResetFor(policy(tier.liquidityFloorMinor, surgeFloorFor(tier.minStakeMinor)));
      expect(Number.isInteger(reset)).toBe(true);
    }
  });
});

describe('jackpot ceiling', () => {
  /**
   * GLI-19 §2.4.2 — once contributions have been made, a jackpot ceiling may be
   * changed only UPWARD. The reset value is adaptive now, so deriving the
   * ceiling from it would let the ceiling fall when a table went quiet. Making
   * it a pure function of the tier satisfies the clause by construction: it
   * cannot move at all.
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

describe('surgeFloorFor — now the lower bound only', () => {
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
