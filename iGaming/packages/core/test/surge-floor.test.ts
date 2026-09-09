/**
 * The jackpot floor has to mean something in the money its table plays for.
 *
 * It used to be a flat 500 credits everywhere: ten times the Skiff table
 * maximum, and a tenth of one percent of a Leviathan minimum bet.
 */
import { describe, expect, it } from 'vitest';
import { SURGE_MIN_POT_MINOR, surgeFloorFor } from '../src/constants';

/** The shipped tier ladder — each rung steps x10 from the last. */
const TIERS = [
  { room: 'skiff', minStakeMinor: 1_00, maxStakeMinor: 50_00 },
  { room: 'schooner', minStakeMinor: 5_00, maxStakeMinor: 500_00 },
  { room: 'flagship', minStakeMinor: 50_00, maxStakeMinor: 5_000_00 },
  { room: 'galleon', minStakeMinor: 500_00, maxStakeMinor: 50_000_00 },
  { room: 'leviathan', minStakeMinor: 5_000_00, maxStakeMinor: 500_000_00 },
];

describe('surgeFloorFor', () => {
  it('never drops below the absolute floor', () => {
    for (const tier of TIERS) {
      expect(surgeFloorFor(tier.minStakeMinor)).toBeGreaterThanOrEqual(SURGE_MIN_POT_MINOR);
    }
  });

  it('is worth at least a few minimum bets at every tier', () => {
    for (const tier of TIERS) {
      const floor = surgeFloorFor(tier.minStakeMinor);
      expect(floor / tier.minStakeMinor).toBeGreaterThanOrEqual(20);
    }
  });

  it('rises with the tier, so a high roller notices winning it', () => {
    const floors = TIERS.map((t) => surgeFloorFor(t.minStakeMinor));
    for (let i = 1; i < floors.length; i++) {
      expect(floors[i]!).toBeGreaterThanOrEqual(floors[i - 1]!);
    }
    // The old flat floor was 0.1% of a Leviathan minimum bet.
    const leviathan = TIERS[TIERS.length - 1]!;
    expect(surgeFloorFor(leviathan.minStakeMinor)).toBeGreaterThan(leviathan.minStakeMinor);
  });

  it('leaves the low tiers where they were', () => {
    expect(surgeFloorFor(1_00)).toBe(SURGE_MIN_POT_MINOR);
    expect(surgeFloorFor(5_00)).toBe(SURGE_MIN_POT_MINOR);
  });

  it('returns whole minor units', () => {
    for (const tier of TIERS) {
      expect(Number.isInteger(surgeFloorFor(tier.minStakeMinor))).toBe(true);
    }
  });
});
