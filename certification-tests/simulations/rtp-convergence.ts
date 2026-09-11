/**
 * RETURN TO PLAYER — MEASURED, PER TIER, AGAINST THE PUBLISHED MODEL.
 *
 * The math suite proves the model is internally consistent. This proves the
 * SHIPPED CODE produces it: every outcome comes from the production RNG, every
 * settlement from the production `settleRound`, and every jackpot movement from
 * the production control software. Nothing about the game is reimplemented here.
 *
 * WHY A CONFIDENCE INTERVAL AND NOT JUST A NUMBER. Landfall is pari-mutuel, so
 * returns within a round are strongly dependent — one player's salvage is funded
 * by another's lost stake. A naive per-bet interval treats those as independent
 * and reports a band several times too narrow. The interval below resamples
 * ROUNDS with replacement (a block bootstrap), which is the correct unit.
 *
 * WHAT A REVIEWER SHOULD LOOK AT. Two things, and the second matters more:
 *
 *   1. Is the theoretical figure inside the measured interval, at every tier?
 *   2. Is the OPERATOR'S HOLD the same at every tier? A return figure that
 *      drifts with table size is not a return figure. That drift is exactly the
 *      defect rules v4 fixed — under v3 the hold ranged from 0.26% to 0.61%
 *      across the five tiers against a published 1.00%.
 *
 * Run:  pnpm exec tsx certification-tests/simulations/rtp-convergence.ts
 */
import {
  RAKE,
  RAKE_SPLIT,
  RULES_VERSION,
  SURGE_PROB,
  ZONE_COUNT,
  applyFloatRound,
  applyReserveRound,
  contributeToSurge,
  drawZone,
  floatSurplusMinor,
  houseFloatOpeningFor,
  houseSeedPerZone,
  openFloat,
  payOutSurge,
  pickGoldenAnchor,
  releaseFloat,
  rollOverSurge,
  settleRound,
  stormPowerFromRoll,
  stormReserveOpeningFor,
  surgeCeilingFor,
  surgeFloorFor,
  surgeResetFor,
  theoreticalRtp,
  updateHandleEma,
  updateHandleMeanEma,
  type StakeEntry,
  type SurgePotState,
} from '@landfall/core';
import { seasonSeeds } from '../suites/_lib/stats';

/** The shipped stake tiers, mirroring `packages/server/config/rooms.json`. */
const TIERS = [
  { id: 'skiff', name: 'Skiff Harbor', min: 1_00, max: 50_00, seed: 25_00, floor: 90_00 },
  { id: 'schooner', name: 'Schooner Bay', min: 5_00, max: 500_00, seed: 50_00, floor: 180_00 },
  { id: 'flagship', name: 'Flagship Sound', min: 50_00, max: 5_000_00, seed: 250_00, floor: 900_00 },
  { id: 'galleon', name: 'Galleon Roads', min: 500_00, max: 50_000_00, seed: 1_250_00, floor: 4_500_00 },
  { id: 'leviathan', name: 'Leviathan Deep', min: 5_000_00, max: 500_000_00, seed: 6_250_00, floor: 22_500_00 },
] as const;

const ROUNDS = Number(process.env.CERT_ROUNDS ?? 150_000);
const PLAYERS_PER_ROUND = 14;

/** A convenience PRNG for PLAYER BEHAVIOUR only. It decides nothing about an outcome. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface TierResult {
  tier: string;
  rounds: number;
  handleMinor: number;
  playerHandleMinor: number;
  playerReturnedMinor: number;
  rakeMinor: number;
  houseShareMinor: number;
  reseedMinor: number;
  backstopMinor: number;
  floatTopUpMinor: number;
  floatReleasedMinor: number;
  perRoundReturn: { staked: number; returned: number }[];
}

function runTier(tier: (typeof TIERS)[number]): TierResult {
  const rnd = lcg(20260912);
  const liquidity = { floorMinor: tier.floor, minSeedMinor: tier.min, maxSeedMinor: tier.seed };
  // TOTAL handle, matching the coordinator: the published RTP term is a fraction
  // of total handle, so sizing the reset from player handle alone would make the
  // realised flow low by exactly the seed's share.
  const surgePolicyFor = (playerHandle: number, seedPerZone: number) => ({
    resetMinor: surgeResetFor({
      handlePerRoundMinor: Math.max(tier.floor, playerHandle + ZONE_COUNT * seedPerZone),
      rake: RAKE,
      houseShare: RAKE_SPLIT.house,
      zones: ZONE_COUNT,
      surgeProb: SURGE_PROB,
    }),
    ceilingMinor: surgeCeilingFor(tier.min),
  });

  let handleEma: number | null = null;
  let handleMean: number | null = null;
  let pot: SurgePotState = { potMinor: surgeFloorFor(tier.min), diversionMinor: 0 };
  let reserve = {
    balanceMinor: stormReserveOpeningFor(tier.floor),
    backstopTotalMinor: 0,
  };
  const floatOpening = houseFloatOpeningFor(tier.seed, ZONE_COUNT, tier.floor);
  let floatState = openFloat(floatOpening);

  const out: TierResult = {
    tier: tier.name,
    rounds: 0,
    handleMinor: 0,
    playerHandleMinor: 0,
    playerReturnedMinor: 0,
    rakeMinor: 0,
    houseShareMinor: 0,
    reseedMinor: 0,
    backstopMinor: 0,
    floatTopUpMinor: 0,
    floatReleasedMinor: 0,
    perRoundReturn: [],
  };

  for (const { seedHex, roundId } of seasonSeeds(`rtp-${tier.id}`, ROUNDS)) {
    const seedPerZone = houseSeedPerZone(liquidity, handleEma ?? 0, ZONE_COUNT);
    const stakes: StakeEntry[] = [];
    for (let z = 0; z < ZONE_COUNT; z++) {
      stakes.push({ id: `h-${roundId}-${z}`, zone: z, amountMinor: seedPerZone, isHouseSeed: true });
    }
    // A crowd with genuine pool imbalance: weights per round, stakes log-ish.
    const weights = Array.from({ length: ZONE_COUNT }, () => 0.2 + rnd());
    const wSum = weights.reduce((a, b) => a + b, 0);
    for (let p = 0; p < PLAYERS_PER_ROUND; p++) {
      let pick = rnd() * wSum;
      let zone = 0;
      while (pick > weights[zone]! && zone < ZONE_COUNT - 1) {
        pick -= weights[zone]!;
        zone++;
      }
      const u = rnd();
      const stake =
        u < 0.7
          ? tier.min + Math.floor(rnd() * tier.min * 9)
          : u < 0.95
            ? tier.min * 10 + Math.floor(rnd() * tier.min * 40)
            : tier.min * 50 + Math.floor(rnd() * tier.min * 200);
      stakes.push({
        id: `p-${roundId}-${p}`,
        zone,
        amountMinor: Math.min(tier.max, stake),
        isHouseSeed: false,
      });
    }

    const handle = stakes.reduce((a, s) => a + s.amountMinor, 0);
    const draw = drawZone(seedHex, roundId, ZONE_COUNT);
    const power = stormPowerFromRoll(draw.stormPowerRoll);
    const settlement = settleRound(
      stakes,
      draw.struckZone,
      RAKE,
      { mNum: power.mNum, mDen: power.mDen },
      150 * handle,
    );

    const surgeContrib = Math.floor(settlement.rakeMinor * RAKE_SPLIT.surge);
    const reserveContrib = Math.floor(settlement.rakeMinor * RAKE_SPLIT.stormReserve);
    const houseShare = settlement.rakeMinor - surgeContrib - reserveContrib;

    const movement = applyReserveRound(
      reserve,
      reserveContrib,
      Math.max(0, settlement.houseDeltaMinor),
    );
    reserve = movement.state;
    out.backstopMinor += movement.backstopMinor;

    const seedStaked = stakes.reduce((a, s) => a + (s.isHouseSeed ? s.amountMinor : 0), 0);
    const seedReturned = settlement.lines.reduce(
      (a, l) => a + (l.isHouseSeed ? l.payoutMinor : 0),
      0,
    );
    const floatRound = applyFloatRound(floatState, seedStaked, seedReturned);
    floatState = floatRound.state;
    out.floatTopUpMinor += floatRound.topUpMinor;

    const surplus = floatSurplusMinor(floatState, floatOpening, ZONE_COUNT * seedPerZone);
    let released = 0;
    if (surplus > 0) {
      const r = releaseFloat(floatState, surplus, 'SURGE_POT');
      floatState = r.state;
      released = r.releasedMinor;
      out.floatReleasedMinor += released;
    }

    const policy = surgePolicyFor(handleMean ?? 0, seedPerZone);
    pot = contributeToSurge(pot, surgeContrib + released, policy).state;

    let playerReturned = settlement.lines.reduce(
      (a, l) => a + (l.isHouseSeed ? 0 : l.payoutMinor),
      0,
    );
    if (draw.uSurge < SURGE_PROB) {
      const winner = pickGoldenAnchor(stakes, draw.struckZone, draw.uWinner);
      if (winner) {
        const payout = payOutSurge(pot, policy);
        playerReturned += payout.paidMinor;
        out.reseedMinor += payout.fromHouseMinor;
        pot = payout.state;
      } else {
        pot = rollOverSurge(pot);
      }
    }

    const playerHandle = stakes.reduce((a, s) => a + (s.isHouseSeed ? 0 : s.amountMinor), 0);
    handleEma = updateHandleEma(handleEma, playerHandle);
    handleMean = updateHandleMeanEma(handleMean, playerHandle);

    out.rounds += 1;
    out.handleMinor += handle;
    out.playerHandleMinor += playerHandle;
    out.playerReturnedMinor += playerReturned;
    out.rakeMinor += settlement.rakeMinor;
    out.houseShareMinor += houseShare;
    out.perRoundReturn.push({ staked: playerHandle, returned: playerReturned });
  }
  return out;
}

/** Block bootstrap over ROUNDS, 99% interval on the ratio of sums. */
function bootstrapCi(
  rounds: { staked: number; returned: number }[],
  resamples = 2_000,
): [number, number] {
  const rnd = lcg(424242);
  const ratios: number[] = [];
  for (let i = 0; i < resamples; i++) {
    let staked = 0;
    let returned = 0;
    for (let j = 0; j < rounds.length; j++) {
      const pick = rounds[Math.floor(rnd() * rounds.length)]!;
      staked += pick.staked;
      returned += pick.returned;
    }
    ratios.push(returned / staked);
  }
  ratios.sort((a, b) => a - b);
  return [ratios[Math.floor(resamples * 0.005)]!, ratios[Math.floor(resamples * 0.995)]!];
}

const pct = (x: number, dp = 4): string => `${(x * 100).toFixed(dp)}%`;
const line = (s = ''): void => process.stdout.write(`${s}\n`);

function main(): void {
  const theory = theoreticalRtp();
  line('LANDFALL — RETURN TO PLAYER, MEASURED AGAINST THE PUBLISHED MODEL');
  line('='.repeat(78));
  line(`Generated            ${new Date().toISOString()}`);
  line(`Rules version        v${RULES_VERSION}`);
  line(`Rounds per tier      ${ROUNDS.toLocaleString('en-US')}`);
  line(`Economy              rake ${pct(RAKE, 2)} of the struck pool · split ` +
    `${RAKE_SPLIT.house}/${RAKE_SPLIT.surge}/${RAKE_SPLIT.stormReserve} · ` +
    `${ZONE_COUNT} harbours · jackpot ~1 round in ${Math.round(1 / SURGE_PROB)}`);
  line();
  line('Outcomes are drawn by the PRODUCTION RNG (SHA-256 chain + HMAC) and settled');
  line('by the PRODUCTION settlement and jackpot control software. Only player');
  line('behaviour uses a convenience PRNG, and it decides nothing about an outcome.');
  line();
  line('--- THE PUBLISHED MODEL ---------------------------------------------------');
  line(`  Base pari-mutuel        1 - r/K                     ${pct(theory.baseReturn)}`);
  line(`  Storm Surge jackpot     split.surge * r/K           ${pct(theory.surgeReturn)}`);
  line(`  Storm Power ladder      E[M-1] * (1-r)/K            ${pct(theory.stormPowerReturn)}`);
  line(`  Jackpot reset (house)   budget * split.house * r/K  ${pct(theory.jackpotReseedReturn)}`);
  line(`  ${'-'.repeat(70)}`);
  line(`  THEORETICAL RTP                                     ${pct(theory.totalRtp)}`);
  line(`  Operator theoretical hold                           ${pct(theory.operatorHold)}`);
  line();

  const results = TIERS.map(runTier);

  /*
   * THE TWO BASES, AND WHY THEY ARE NOT THE SAME NUMBER.
   *
   * The published figure is on TOTAL handle, which includes the house's
   * liquidity seed. A player's realised return is measured on PLAYER handle,
   * because Resolution 455 Art. 2(d) defines GGR as bets received minus
   * winnings paid and a house seed is not a bet received.
   *
   * Those denominators differ, so the two figures differ — by an amount that is
   * derivable rather than mysterious. The operator's hold is levied on total
   * handle while players supply only part of it, so with `s` the seed's share
   * of handle:
   *
   *     player-basis RTP  =  1 − hold / (1 − s)
   *
   * Comparing a player-basis measurement against a total-handle model would be
   * comparing two different quantities and calling the difference an error. Each
   * measurement is therefore checked against ITS OWN expectation, and both are
   * printed so the gap is visible rather than absorbed.
   */
  line('--- MEASURED, PER TIER ----------------------------------------------------');
  line('Basis: player handle (Res. 455 Art. 2(d)) — a house seed is not a bet received.');
  line('Expected on that basis: 1 − hold/(1 − seed share). See the note below.');
  line();
  line('Tier                 Player RTP     99% interval            Seed %   Expected   In CI');
  line('-'.repeat(92));
  let allInside = true;
  let minHold = Infinity;
  let maxHold = -Infinity;
  const holds: number[] = [];
  for (const r of results) {
    const rtp = r.playerReturnedMinor / r.playerHandleMinor;
    const [lo, hi] = bootstrapCi(r.perRoundReturn);
    const seedShare = 1 - r.playerHandleMinor / r.handleMinor;
    const expected = 1 - theory.operatorHold / (1 - seedShare);
    const operatorNet =
      (r.houseShareMinor - r.reseedMinor - r.backstopMinor - r.floatTopUpMinor) / r.handleMinor;
    const inside = expected >= lo && expected <= hi;
    allInside &&= inside;
    minHold = Math.min(minHold, operatorNet);
    maxHold = Math.max(maxHold, operatorNet);
    holds.push(operatorNet);
    line(
      `${r.tier.padEnd(18)} ${pct(rtp).padStart(11)}   [${pct(lo)}, ${pct(hi)}]   ` +
        `${pct(seedShare, 2).padStart(6)}   ${pct(expected).padStart(9)}   ${inside ? 'yes' : 'NO'}`,
    );
  }
  line();
  /*
   * THE FULL LEDGER, PER TIER. Printed because a residual between the measured
   * return and its expectation is only useful if the reader can see which term
   * it came from. Every figure is a fraction of TOTAL handle.
   */
  line('--- THE LEDGER, PER TIER (fractions of total handle) ----------------------');
  line('Tier                  Rake    House sh.   Re-seed   Released   Backstop   Top-up');
  line('-'.repeat(88));
  for (const r of results) {
    line(
      `${r.tier.padEnd(18)} ${pct(r.rakeMinor / r.handleMinor).padStart(8)} ` +
        `${pct(r.houseShareMinor / r.handleMinor).padStart(10)} ` +
        `${pct(r.reseedMinor / r.handleMinor).padStart(9)} ` +
        `${pct(r.floatReleasedMinor / r.handleMinor).padStart(10)} ` +
        `${pct(r.backstopMinor / r.handleMinor).padStart(10)} ` +
        `${pct(r.floatTopUpMinor / r.handleMinor).padStart(8)}`,
    );
  }
  line(
    `${'MODELLED'.padEnd(18)} ${pct(RAKE / ZONE_COUNT).padStart(8)} ` +
      `${pct(RAKE_SPLIT.house * (RAKE / ZONE_COUNT)).padStart(10)} ` +
      `${pct(theory.jackpotReseedReturn).padStart(9)}`,
  );
  line();

  line('--- OPERATOR NET, PER TIER (total-handle basis) ---------------------------');
  results.forEach((r, i) => {
    line(
      `${r.tier.padEnd(18)} ${pct(holds[i]!).padStart(11)}   against a published ` +
        `${pct(theory.operatorHold)}`,
    );
  });
  line();

  line('--- THE PROPERTY THAT MATTERS MOST ----------------------------------------');
  line('A return figure that moves with table size is not a return figure. Under');
  line('rules v3 the operator hold ranged 0.26%-0.61% across these five tiers');
  line('against a published 1.00%, because a minimum overrode the jackpot budget at');
  line('every tier and the re-seed flow was left out of the model entirely.');
  line();
  line(`  Operator hold, lowest tier to highest   ${pct(minHold)} .. ${pct(maxHold)}`);
  line(`  Spread across tiers                     ${pct(maxHold - minHold)}`);
  line(`  Published hold                          ${pct(theory.operatorHold)}`);
  const spreadOk = maxHold - minHold < 0.001;
  line(`  ${spreadOk ? 'PASS' : 'FAIL'} — the hold is the same at every tier to within 0.1 points`);
  line();

  line('--- HOUSE-SEED RING-FENCE (GLI-19 §A.7.1(c)-(d)) --------------------------');
  for (const r of results) {
    line(
      `${r.tier.padEnd(18)} released to jackpot ${pct(r.floatReleasedMinor / r.handleMinor)}` +
        `   operator capital in ${pct(r.floatTopUpMinor / r.handleMinor)}`,
    );
  }
  line();
  line('The house seed is +EV against an imbalanced crowd (the survivor payout is');
  line('convex in the struck pool), so the ring-fenced float earns a small, real');
  line('profit. Segregating it satisfies "the operator shall not profit"; releasing');
  line('the surplus to the jackpot is what satisfies "shall ultimately be lost".');
  line();

  line('--- A NOTE ON THE TWO BASES -----------------------------------------------');
  line('The published figure is on TOTAL handle; the measured one is on PLAYER handle.');
  line('The operator hold is levied on total handle while players supply only part of');
  line('it, so the player-basis figure sits below the published one by');
  line('hold x s/(1-s), where s is the seed share printed above — a few hundredths of');
  line('a point at a populated table. The seed itself is net-neutral to players over');
  line('the long run: it is ring-fenced, and its surplus is released to the jackpot.');
  line();
  line('The same arithmetic is why a player ALONE at a table sees a lower return: the');
  line('seed share rises as the table empties. That case is bounded and disclosed in');
  line('docs/02-math-verification.md section 6.2 rather than averaged away.');
  line();

  const verdict = allInside && spreadOk;
  line('='.repeat(78));
  line(
    verdict
      ? '  VERDICT: measured return agrees with the published model at every tier'
      : '  VERDICT: FAILED — see the rows marked NO above',
  );
  line('='.repeat(78));
  if (!verdict) process.exitCode = 1;
}

main();
