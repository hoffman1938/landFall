/**
 * The number the deck shows must be a number the server accepts.
 *
 * Regression cover for the reported rejection: the deck offered a stake, the
 * player sent it, and the server answered "A single fleet is capped at 25% of
 * this round's handle — up to 20000.00 right now." The client had estimated the
 * cap from the PREVIOUS round's handle, which includes every player's stake, so
 * at the moment a round opened its figure was several times too high.
 */
import { describe, expect, it } from 'vitest';
import { ZONE_COUNT } from '@landfall/core';
import { resolveStakeLimit, roundShareCapMinor, type StakeLimitInput } from '../src/stakeLimits';

/** Leviathan Deep as shipped: bets 5,000–500,000, floor 22,500, seed 6,250/zone. */
const LEVIATHAN: StakeLimitInput = {
  balanceMinor: 50_000_00,
  roomMinStakeMinor: 5_000_00,
  roomMaxStakeMinor: 500_000_00,
  whaleCapFraction: 0.25,
  liquidityFloorMinor: 2_250_00 * 10,
  houseSeedMinor: 6_250_00,
};

/**
 * The server's rule, transcribed from coordinator.anchor: a stake is accepted
 * when it is no more than `w` of the handle INCLUDING itself, measured against
 * the guaranteed liquidity floor or the seeded pools plus everyone else's
 * stakes, whichever is larger.
 */
function serverAccepts(
  input: StakeLimitInput,
  stakeMinor: number,
  othersStakesMinor: number,
): boolean {
  const othersMinor = Math.max(
    input.liquidityFloorMinor,
    ZONE_COUNT * input.houseSeedMinor + othersStakesMinor,
  );
  return stakeMinor <= input.whaleCapFraction * (othersMinor + stakeMinor);
}

describe('resolveStakeLimit', () => {
  it('offers a stake the server accepts with nobody else in the round', () => {
    const { maxMinor } = resolveStakeLimit(LEVIATHAN);
    expect(serverAccepts(LEVIATHAN, maxMinor, 0)).toBe(true);
  });

  it('offers a stake the server accepts however much others have staked', () => {
    const { maxMinor } = resolveStakeLimit(LEVIATHAN);
    for (const others of [0, 1_00, 10_000_00, 250_000_00, 5_000_000_00]) {
      expect(serverAccepts(LEVIATHAN, maxMinor, others)).toBe(true);
    }
  });

  it('never offers more than the empty-round cap, which is where it can be refused', () => {
    // The old estimate used the previous round's full handle. Reproduce that
    // mistake and show it clears a bar the server has not set yet.
    const previousRoundHandle = 6_000_000_00;
    const optimistic = Math.floor((0.25 / 0.75) * previousRoundHandle);
    expect(serverAccepts(LEVIATHAN, optimistic, 0)).toBe(false);
    expect(resolveStakeLimit(LEVIATHAN).maxMinor).toBeLessThan(optimistic);
  });

  it('uses the seeded pools when they exceed the liquidity floor', () => {
    const richlySeeded = { ...LEVIATHAN, houseSeedMinor: 100_000_00 };
    expect(roundShareCapMinor(richlySeeded)).toBe(
      Math.floor((0.25 / 0.75) * ZONE_COUNT * 100_000_00),
    );
    expect(serverAccepts(richlySeeded, resolveStakeLimit(richlySeeded).maxMinor, 0)).toBe(true);
  });

  it('reports which rule is binding', () => {
    // Quiet high-stakes table: the round share bites long before the tier max.
    expect(resolveStakeLimit(LEVIATHAN).boundBy).toBe('round-share');
    // Skiff Harbor: bets 1–50, floor 90, seed 25/zone — the table max bites.
    const skiff: StakeLimitInput = {
      balanceMinor: 50_000_00,
      roomMinStakeMinor: 1_00,
      roomMaxStakeMinor: 50_00,
      whaleCapFraction: 0.25,
      liquidityFloorMinor: 900_00,
      houseSeedMinor: 25_00,
    };
    expect(resolveStakeLimit(skiff).boundBy).toBe('table');
    expect(resolveStakeLimit(skiff).maxMinor).toBe(50_00);
    // A thin wallet is its own ceiling, and it is named as such.
    expect(resolveStakeLimit({ ...skiff, balanceMinor: 12_00 }).boundBy).toBe('balance');
  });

  it('never returns less than the table minimum', () => {
    const broke = { ...LEVIATHAN, balanceMinor: 1_00 };
    expect(resolveStakeLimit(broke).maxMinor).toBe(LEVIATHAN.roomMinStakeMinor);
  });

  it('treats a disabled cap as no cap at all', () => {
    const uncapped = { ...LEVIATHAN, whaleCapFraction: 1 };
    expect(roundShareCapMinor(uncapped)).toBe(Number.POSITIVE_INFINITY);
    expect(resolveStakeLimit(uncapped).maxMinor).toBe(LEVIATHAN.balanceMinor);
  });

  it('returns whole minor units', () => {
    expect(Number.isInteger(resolveStakeLimit(LEVIATHAN).maxMinor)).toBe(true);
  });
});
