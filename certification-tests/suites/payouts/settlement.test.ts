/**
 * PAYOUT CORRECTNESS — the settlement rule, its rounding policy, and its edges.
 *
 * GLI-19 has no single clause for "the arithmetic must be right", which is
 * exactly why it is worth its own file: §4.3.3(d) requires the award to reach
 * the player's balance, §4.4.1(d) requires every winning outcome and its payout
 * to be stated, §4.7.1 sets a return floor for every wagering configuration, and
 * §4.13.6(b) forbids rounding a jackpot down. All four depend on settlement
 * being exactly what the rules sheet says it is.
 *
 * The rule, from `settlementFormulaDisclosure()`:
 *
 *     a bet S in a surviving harbour returns
 *         S + (1−r) · P_hit · S / (T − P_hit)
 *     and the storm category multiplies the shared part.
 *
 * Everything below checks the code against THAT SENTENCE, because the sentence
 * is what a player is shown and therefore what the operator is held to.
 */
import { describe, expect, it } from 'vitest';
import {
  RAKE,
  STORM_POWER_LADDER,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  ZONE_COUNT,
  assertConservation,
  pickGoldenAnchor,
  pickGoldenAnchorFlat,
  settleRound,
  settlementFormulaDisclosure,
  type StakeEntry,
} from '@landfall/core';

/** A small deterministic PRNG, so every fuzz failure is reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomStakes(rnd: () => number, count: number, maxMinor = 500_00): StakeEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    zone: Math.floor(rnd() * ZONE_COUNT),
    amountMinor: 1 + Math.floor(rnd() * maxMinor),
    isHouseSeed: rnd() < 0.2,
  }));
}

describe('the payout formula matches the sentence players are shown', () => {
  it('a survivor receives stake + (1−r)·P_hit·S/(T−P_hit)', () => {
    const stakes: StakeEntry[] = [
      { id: 'hit-1', zone: 0, amountMinor: 300_00, isHouseSeed: false },
      { id: 'hit-2', zone: 0, amountMinor: 200_00, isHouseSeed: false },
      { id: 'safe-1', zone: 1, amountMinor: 100_00, isHouseSeed: false },
      { id: 'safe-2', zone: 2, amountMinor: 400_00, isHouseSeed: false },
      { id: 'safe-3', zone: 3, amountMinor: 50_00, isHouseSeed: false },
    ];
    const result = settleRound(stakes, 0, RAKE);
    const pHit = 500_00;
    const survivorPool = 550_00;
    const distributable = pHit - Math.floor(pHit * RAKE);

    for (const id of ['safe-1', 'safe-2', 'safe-3']) {
      const line = result.lines.find((l) => l.id === id)!;
      const stake = stakes.find((s) => s.id === id)!.amountMinor;
      const exact = (distributable * stake) / survivorPool;
      // Floored, then the remainder redistributed — so a line is the floor or
      // one minor unit above it, never anything else.
      expect(line.salvageMinor).toBeGreaterThanOrEqual(Math.floor(exact));
      expect(line.salvageMinor).toBeLessThanOrEqual(Math.floor(exact) + 1);
      expect(line.payoutMinor).toBe(stake + line.salvageMinor);
    }
    for (const id of ['hit-1', 'hit-2']) {
      const line = result.lines.find((l) => l.id === id)!;
      expect(line.outcome).toBe('WRECKED');
      expect(line.payoutMinor).toBe(0);
    }
    // The disclosure names the same two quantities the code used.
    const sentence = settlementFormulaDisclosure(ZONE_COUNT, RAKE);
    expect(sentence).toContain('88%');
    expect(sentence).toContain('P_hit');
  });

  /**
   * THE ROUNDING POLICY. Floor each share, then hand the leftover minor units to
   * the largest fractional remainders, tie-broken by stake id. Two properties
   * matter and both are checked: nothing is created or destroyed, and the result
   * does not depend on the order the stakes arrive in.
   */
  it('distributes every minor unit, and is independent of stake ordering', () => {
    // Deliberately awkward: 7 survivors sharing a pool that does not divide.
    const stakes: StakeEntry[] = [
      { id: 'hit', zone: 5, amountMinor: 1_01, isHouseSeed: false },
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `s${i}`,
        zone: i % 5,
        amountMinor: 3_33 + i,
        isHouseSeed: false,
      })),
    ];
    const forward = settleRound(stakes, 5, RAKE);
    const reversed = settleRound([...stakes].reverse(), 5, RAKE);

    const salvage = forward.lines.reduce((a, l) => a + l.salvageMinor, 0);
    expect(salvage).toBe(forward.salvageTotalMinor);

    const byId = (r: typeof forward) =>
      Object.fromEntries(r.lines.map((l) => [l.id, l.payoutMinor]));
    expect(byId(reversed)).toEqual(byId(forward));
  });

  /**
   * The rounding must not systematically favour the house. Over many random
   * rounds the total distributed salvage equals the distributable pool exactly —
   * not "on average", exactly, every time.
   */
  it('never leaves a minor unit behind, over 5,000 random rounds', () => {
    const rnd = lcg(20260912);
    for (let i = 0; i < 5_000; i++) {
      const stakes = randomStakes(rnd, 2 + Math.floor(rnd() * 20));
      const struck = Math.floor(rnd() * ZONE_COUNT);
      const result = settleRound(stakes, struck, RAKE);
      const salvage = result.lines.reduce((a, l) => a + l.salvageMinor, 0);
      expect(salvage, `round ${i}`).toBe(result.salvageTotalMinor);
      if (!result.allStakesRefunded) {
        expect(result.salvageTotalMinor).toBe(result.distributedMinor);
      }
    }
  });
});

describe('conservation — no round creates or destroys value', () => {
  /**
   * The identity settlement asserts internally on every call:
   *
   *     payouts + rake === handle + houseDelta
   *
   * where houseDelta is the Storm Reserve draw funding a multiplier above ×1.
   * Re-asserted here from the outside over a wide fuzz, including every ladder
   * tier and the liability cap, because an internal assert that is never
   * exercised against extreme inputs proves less than it looks.
   */
  it('holds across 20,000 random rounds, every ladder tier, cap engaged', () => {
    const rnd = lcg(77);
    for (let i = 0; i < 20_000; i++) {
      const stakes = randomStakes(rnd, 1 + Math.floor(rnd() * 30), 5_000_00);
      const struck = Math.floor(rnd() * ZONE_COUNT);
      const tier = STORM_POWER_LADDER[Math.floor(rnd() * STORM_POWER_LADDER.length)]!;
      const handle = stakes.reduce((a, s) => a + s.amountMinor, 0);
      const result = settleRound(
        stakes,
        struck,
        RAKE,
        { mNum: tier.mNum, mDen: tier.mDen },
        STORM_POWER_MAX_PAYOUT_MULTIPLE * handle,
      );
      expect(() => assertConservation(result)).not.toThrow();

      const paid = result.lines.reduce((a, l) => a + l.payoutMinor, 0);
      expect(paid + result.rakeMinor).toBe(handle + result.houseDeltaMinor);

      // Every line is a whole number of minor units and never negative.
      for (const line of result.lines) {
        expect(Number.isInteger(line.payoutMinor)).toBe(true);
        expect(line.payoutMinor).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(line.salvageMinor)).toBe(true);
        expect(line.salvageMinor).toBeGreaterThanOrEqual(0);
      }
      // Every stake appears exactly once.
      expect(result.lines).toHaveLength(stakes.length);
      expect(new Set(result.lines.map((l) => l.id)).size).toBe(stakes.length);
    }
  });

  /** The multiplier never REDUCES a payout — the ladder floor is ×1. */
  it('a survivor is never paid less than the ×1 identity', () => {
    const rnd = lcg(5150);
    for (let i = 0; i < 3_000; i++) {
      const stakes = randomStakes(rnd, 3 + Math.floor(rnd() * 12));
      const struck = Math.floor(rnd() * ZONE_COUNT);
      const handle = stakes.reduce((a, s) => a + s.amountMinor, 0);
      const base = settleRound(stakes, struck, RAKE);
      if (base.allStakesRefunded) continue;
      for (const tier of STORM_POWER_LADDER) {
        const boosted = settleRound(
          stakes,
          struck,
          RAKE,
          { mNum: tier.mNum, mDen: tier.mDen },
          STORM_POWER_MAX_PAYOUT_MULTIPLE * handle,
        );
        expect(boosted.salvageTotalMinor).toBeGreaterThanOrEqual(base.salvageTotalMinor);
        for (const line of boosted.lines) {
          const b = base.lines.find((l) => l.id === line.id)!;
          expect(line.payoutMinor, `${tier.label} ${line.id}`).toBeGreaterThanOrEqual(
            b.payoutMinor,
          );
        }
      }
    }
  });

  /**
   * §4.7.4 / §4.13.3 — the liability cap. It is disclosed, and it may never cut
   * below the pari-mutuel base: clamping a ×1 round would mean a survivor was
   * paid less than the rules sheet promises.
   */
  it('the liability cap never clamps below the pari-mutuel base', () => {
    const stakes: StakeEntry[] = [
      { id: 'hit', zone: 0, amountMinor: 900_00, isHouseSeed: false },
      { id: 'safe', zone: 1, amountMinor: 1_00, isHouseSeed: false },
    ];
    // A cap far below even the base distributable pool.
    const result = settleRound(stakes, 0, RAKE, { mNum: 500, mDen: 1 }, 1);
    expect(result.salvageTotalMinor).toBe(result.distributedMinor);
    expect(result.powerCapped).toBe(true);
    const safe = result.lines.find((l) => l.id === 'safe')!;
    expect(safe.payoutMinor).toBe(1_00 + result.distributedMinor);
  });
});

describe('edge cases', () => {
  it('an empty round settles to nothing rather than throwing', () => {
    const result = settleRound([], 0, RAKE);
    expect(result.lines).toHaveLength(0);
    expect(result.rakeMinor).toBe(0);
    expect(result.allStakesRefunded).toBe(true);
  });

  it('a round where nothing was staked on the struck harbour pays no salvage', () => {
    const stakes: StakeEntry[] = [
      { id: 'a', zone: 1, amountMinor: 100_00, isHouseSeed: false },
      { id: 'b', zone: 2, amountMinor: 100_00, isHouseSeed: false },
    ];
    const result = settleRound(stakes, 0, RAKE);
    expect(result.struckPoolMinor).toBe(0);
    expect(result.rakeMinor).toBe(0);
    expect(result.salvageTotalMinor).toBe(0);
    for (const line of result.lines) expect(line.payoutMinor).toBe(line.amountMinor);
  });

  it('a single surviving stake takes the whole distributable pool', () => {
    const stakes: StakeEntry[] = [
      { id: 'hit', zone: 0, amountMinor: 1_000_00, isHouseSeed: false },
      { id: 'solo', zone: 1, amountMinor: 1_00, isHouseSeed: false },
    ];
    const result = settleRound(stakes, 0, RAKE);
    const solo = result.lines.find((l) => l.id === 'solo')!;
    expect(solo.salvageMinor).toBe(result.distributedMinor);
    expect(solo.payoutMinor).toBe(1_00 + result.distributedMinor);
  });

  it('zero-amount stakes neither earn nor break the split', () => {
    const stakes: StakeEntry[] = [
      { id: 'hit', zone: 0, amountMinor: 100_00, isHouseSeed: false },
      { id: 'zero', zone: 1, amountMinor: 0, isHouseSeed: false },
      { id: 'real', zone: 1, amountMinor: 50_00, isHouseSeed: false },
    ];
    const result = settleRound(stakes, 0, RAKE);
    const zero = result.lines.find((l) => l.id === 'zero')!;
    expect(zero.salvageMinor).toBe(0);
    expect(zero.payoutMinor).toBe(0);
    const real = result.lines.find((l) => l.id === 'real')!;
    expect(real.salvageMinor).toBe(result.distributedMinor);
  });

  /**
   * The protocol ceiling is 500,000 credits and the top tier multiplies by 500.
   * A worst-case round therefore reaches ~10^11 minor units, which is well
   * inside a double's exact-integer range (2^53 ≈ 9 × 10^15) — but that is a
   * claim worth testing rather than assuming, because the day it stops being
   * true the failure is silent.
   */
  it('stays in exact integer arithmetic at the protocol ceiling', () => {
    const stakes: StakeEntry[] = [
      { id: 'hit', zone: 0, amountMinor: 500_000_00, isHouseSeed: false },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `safe${i}`,
        zone: i + 1,
        amountMinor: 500_000_00,
        isHouseSeed: false,
      })),
    ];
    const handle = stakes.reduce((a, s) => a + s.amountMinor, 0);
    const result = settleRound(
      stakes,
      0,
      RAKE,
      { mNum: 500, mDen: 1 },
      STORM_POWER_MAX_PAYOUT_MULTIPLE * handle,
    );
    const paid = result.lines.reduce((a, l) => a + l.payoutMinor, 0);
    expect(Number.isSafeInteger(paid)).toBe(true);
    expect(Number.isSafeInteger(result.salvageTotalMinor)).toBe(true);
    expect(paid + result.rakeMinor).toBe(handle + result.houseDeltaMinor);
    // …and comfortably inside the safe range, with room to spare.
    expect(paid).toBeLessThan(Number.MAX_SAFE_INTEGER / 1000);
  });
});

describe('jackpot winner selection', () => {
  /**
   * §4.13.9 — one winner. The selection walks the eligible stakes in a
   * deterministic order (sorted by id) and is a pure function of the public lock
   * snapshot and one roll, so anyone can recompute it after the reveal.
   */
  it('selects exactly one winner, deterministically and reproducibly', () => {
    const stakes: StakeEntry[] = [
      { id: 'b', zone: 1, amountMinor: 100_00, isHouseSeed: false },
      { id: 'a', zone: 2, amountMinor: 300_00, isHouseSeed: false },
      { id: 'c', zone: 0, amountMinor: 900_00, isHouseSeed: false },
    ];
    for (const u of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const first = pickGoldenAnchor(stakes, 0, u);
      const again = pickGoldenAnchor([...stakes].reverse(), 0, u);
      expect(again?.id).toBe(first?.id);
      // The wrecked stake is never eligible.
      expect(first?.id).not.toBe('c');
    }
  });

  it('excludes house seeds and practice bots from the jackpot', () => {
    const stakes: StakeEntry[] = [
      { id: 'house', zone: 1, amountMinor: 1_000_000_00, isHouseSeed: true },
      { id: 'bot', zone: 1, amountMinor: 1_000_000_00, isHouseSeed: false, isBot: true },
      { id: 'player', zone: 1, amountMinor: 1_00, isHouseSeed: false },
    ];
    for (let i = 0; i < 200; i++) {
      const winner = pickGoldenAnchor(stakes, 0, i / 200);
      expect(winner?.id).toBe('player');
    }
  });

  it('rolls over when no player stake survived', () => {
    const stakes: StakeEntry[] = [
      { id: 'house', zone: 1, amountMinor: 100_00, isHouseSeed: true },
      { id: 'player', zone: 0, amountMinor: 100_00, isHouseSeed: false },
    ];
    expect(pickGoldenAnchor(stakes, 0, 0.5)).toBeNull();
    expect(pickGoldenAnchorFlat(stakes, 0, 0.5)).toBeNull();
  });

  /**
   * Stake-weighted selection must actually be stake-weighted: a stake worth
   * three times another must win about three times as often. Checked by
   * sweeping the roll rather than by sampling, which makes it exact.
   */
  it('weights selection by stake size', () => {
    const stakes: StakeEntry[] = [
      { id: 'big', zone: 1, amountMinor: 300_00, isHouseSeed: false },
      { id: 'small', zone: 1, amountMinor: 100_00, isHouseSeed: false },
    ];
    const STEPS = 40_000;
    let big = 0;
    for (let i = 0; i < STEPS; i++) {
      if (pickGoldenAnchor(stakes, 0, i / STEPS)?.id === 'big') big += 1;
    }
    expect(big / STEPS).toBeCloseTo(0.75, 2);
  });

  /** …and the flat-odds mode must not be stake-weighted at all. */
  it('the flat-odds mode gives every surviving stake equal odds', () => {
    const stakes: StakeEntry[] = [
      { id: 'big', zone: 1, amountMinor: 300_00, isHouseSeed: false },
      { id: 'small', zone: 1, amountMinor: 100_00, isHouseSeed: false },
    ];
    const STEPS = 40_000;
    let big = 0;
    for (let i = 0; i < STEPS; i++) {
      if (pickGoldenAnchorFlat(stakes, 0, i / STEPS)?.id === 'big') big += 1;
    }
    expect(big / STEPS).toBeCloseTo(0.5, 2);
  });
});
