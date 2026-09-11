/**
 * A6 — economy revalidation simulation (CI-runnable, node-only).
 *
 * Runs N rounds against the PRODUCTION `drawZone` + `settleRound` +
 * `stormPowerFromRoll` (never a reimplementation) with the shipped constants,
 * and checks measured hold, split flows, reserve drift, surge return and the
 * solo-player deviation against theory. Exits non-zero when any check falls
 * outside its tolerance — wire it into CI as a release gate (§13.3).
 *
 * Usage:
 *   pnpm --filter @landfall/core sim                 # 1,000,000 rounds
 *   pnpm --filter @landfall/core sim -- --rounds=10000000
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  HOUSE_SEED_MINOR,
  RAKE,
  applyReserveRound,
  stormReserveOpeningFor,
  RAKE_SPLIT,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  SURGE_MIN_POT_MINOR,
  SURGE_PROB,
  ZONE_COUNT,
  drawZone,
  pickGoldenAnchor,
  settleRound,
  stormPowerFromRoll,
  type StakeEntry,
} from '../src/index.js';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k!, v ?? 'true'] as const;
  }),
);
const ROUNDS = Number(args.get('rounds') ?? 1_000_000);

/** Deterministic LCG for pool synthesis (the DRAW itself is the production HMAC). */
let lcgState = Number(args.get('seed') ?? 20260711) >>> 0;
const rnd = () => ((lcgState = (lcgState * 1664525 + 1013904223) >>> 0), lcgState / 2 ** 32);

/** Rolling hash chain: statistically identical to consuming a season chain. */
let seedBytes = sha256(new TextEncoder().encode('landfall-sim-terminal'));

function nextSeedHex(): string {
  seedBytes = sha256(seedBytes);
  return bytesToHex(seedBytes);
}

/** Synthesize a round's stakes: house seeds + a small crowd with mild imbalance. */
function synthesizeStakes(roundId: number): StakeEntry[] {
  const out: StakeEntry[] = [];
  for (let z = 0; z < ZONE_COUNT; z++) {
    out.push({ id: `h-${z}`, zone: z, amountMinor: HOUSE_SEED_MINOR, isHouseSeed: true });
  }
  // Per-round crowd weights create realistic pool imbalance.
  const weights = Array.from({ length: ZONE_COUNT }, () => 0.2 + rnd());
  const wSum = weights.reduce((a, b) => a + b, 0);
  const players = 5 + Math.floor(rnd() * 25);
  for (let p = 0; p < players; p++) {
    let pick = rnd() * wSum;
    let zone = 0;
    while (pick > weights[zone]! && zone < ZONE_COUNT - 1) {
      pick -= weights[zone]!;
      zone++;
    }
    // Stake spread: mostly small, occasional whale (log-flavored).
    const r = rnd();
    const stake =
      r < 0.7
        ? 1_00 + Math.floor(rnd() * 25_00)
        : r < 0.95
          ? 25_00 + Math.floor(rnd() * 200_00)
          : 500_00 + Math.floor(rnd() * 4_500_00);
    out.push({ id: `p-${roundId}-${p}`, zone, amountMinor: stake, isHouseSeed: false });
  }
  return out;
}

// ---------------- main loop ----------------

let handleSum = 0;
let rakeSum = 0;
let houseShareSum = 0;
let surgeContribSum = 0;
let reserveInSum = 0;
let reserveOutSum = 0;
/**
 * The reserve is stepped through the PRODUCTION control function
 * (`applyReserveRound`) rather than a `+=` here, for the same reason the draw
 * and the settlement are: a sim that reimplements the thing it validates can
 * only ever confirm its own copy. It opens capitalized exactly as a room does
 * and can no longer go negative — a shortfall is a ledgered house backstop.
 */
let reserveState = {
  balanceMinor: stormReserveOpeningFor(ZONE_COUNT * HOUSE_SEED_MINOR),
  backstopTotalMinor: 0,
};
const reserveOpening = reserveState.balanceMinor;
let reserveMin = reserveState.balanceMinor;
let cappedRounds = 0;
let passThroughViolations = 0;

// Surge pot dynamics (player return via Golden Anchor + house floor re-seeds).
let surgePot = SURGE_MIN_POT_MINOR;
let surgePaidToPlayers = 0;
let houseReseeds = SURGE_MIN_POT_MINOR; // initial seed is house money
let surgeRounds = 0;

const t0 = Date.now();
for (let i = 1; i <= ROUNDS; i++) {
  const stakes = synthesizeStakes(i);
  const handle = stakes.reduce((a, s) => a + s.amountMinor, 0);
  const draw = drawZone(nextSeedHex(), i, ZONE_COUNT);
  const power = stormPowerFromRoll(draw.stormPowerRoll);
  const cap = STORM_POWER_MAX_PAYOUT_MULTIPLE * handle;
  const r = settleRound(stakes, draw.struckZone, RAKE, { mNum: power.mNum, mDen: power.mDen }, cap);

  // Same split arithmetic as the coordinator (floor; dust to the house share).
  const surgeContrib = Math.floor(r.rakeMinor * RAKE_SPLIT.surge);
  const reserveContrib = Math.floor(r.rakeMinor * RAKE_SPLIT.stormReserve);
  const houseShare = r.rakeMinor - surgeContrib - reserveContrib;
  const reserveOut = Math.max(0, r.houseDeltaMinor);

  handleSum += handle;
  rakeSum += r.rakeMinor;
  houseShareSum += houseShare;
  surgeContribSum += surgeContrib;
  reserveInSum += reserveContrib;
  reserveOutSum += reserveOut;
  reserveState = applyReserveRound(reserveState, reserveContrib, reserveOut).state;
  if (reserveState.balanceMinor < reserveMin) reserveMin = reserveState.balanceMinor;
  if (r.powerCapped) cappedRounds++;
  // Pass-through invariant: at ×1 the salvage is exactly (1−RAKE) of the struck pool.
  if (power.mNum === power.mDen && r.salvageTotalMinor !== r.distributedMinor) {
    passThroughViolations++;
  }

  // Surge pot dynamics.
  surgePot += surgeContrib;
  if (draw.uSurge < SURGE_PROB) {
    surgeRounds++;
    const winner = pickGoldenAnchor(stakes, draw.struckZone, draw.uWinner);
    if (winner) {
      surgePaidToPlayers += surgePot;
      surgePot = SURGE_MIN_POT_MINOR;
      houseReseeds += SURGE_MIN_POT_MINOR;
    }
  }
}
const elapsed = (Date.now() - t0) / 1000;

// ---------------- report ----------------

const pct = (x: number) => `${((x / handleSum) * 100).toFixed(4)}%`;
interface Check {
  name: string;
  measured: string;
  theory: string;
  ok: boolean;
}
const checks: Check[] = [];
const grossTake = rakeSum / handleSum;
checks.push({
  name: 'Gross take (rake)',
  measured: pct(rakeSum),
  theory: `${((RAKE / ZONE_COUNT) * 100).toFixed(4)}% (r/K)`,
  ok: Math.abs(grossTake - RAKE / ZONE_COUNT) < 0.0005,
});
checks.push({
  name: 'Operator hold (house share)',
  measured: pct(houseShareSum),
  theory: `≈ ${((RAKE_SPLIT.house * RAKE) / ZONE_COUNT * 100).toFixed(4)}%`,
  ok: Math.abs(houseShareSum / handleSum - (RAKE_SPLIT.house * RAKE) / ZONE_COUNT) < 0.0005,
});
checks.push({
  name: 'Surge funding',
  measured: pct(surgeContribSum),
  theory: `≈ ${((RAKE_SPLIT.surge * RAKE) / ZONE_COUNT * 100).toFixed(4)}%`,
  ok: Math.abs(surgeContribSum / handleSum - (RAKE_SPLIT.surge * RAKE) / ZONE_COUNT) < 0.0005,
});
checks.push({
  name: 'Storm Reserve inflow',
  measured: pct(reserveInSum),
  theory: `≈ ${((RAKE_SPLIT.stormReserve * RAKE) / ZONE_COUNT * 100).toFixed(4)}%`,
  ok: Math.abs(reserveInSum / handleSum - (RAKE_SPLIT.stormReserve * RAKE) / ZONE_COUNT) < 0.0005,
});
checks.push({
  name: 'Storm Reserve outflow (ladder overpayment)',
  measured: pct(reserveOutSum),
  theory: `≤ inflow (funding invariant)`,
  // Outflow is tail-dominated; require it not to exceed inflow by more than
  // sampling noise (0.05% of handle) and to be positive.
  ok: reserveOutSum > 0 && reserveOutSum / handleSum <= reserveInSum / handleSum + 0.0005,
});
checks.push({
  name: 'Reserve drift (balance − opening, % of handle)',
  measured: pct(reserveState.balanceMinor - reserveOpening),
  theory: '≈ 0, slightly positive',
  ok:
    (reserveState.balanceMinor - reserveOpening) / handleSum > -0.0005 &&
    (reserveState.balanceMinor - reserveOpening) / handleSum < 0.001,
});
checks.push({
  name: 'Surge return to players (pot payouts)',
  measured: pct(surgePaidToPlayers),
  theory: `≈ surge funding + floor re-seeds`,
  ok:
    Math.abs(surgePaidToPlayers - (surgeContribSum + houseReseeds - surgePot)) /
      Math.max(1, surgeContribSum) <
    0.05,
});
checks.push({
  name: 'Survivor pass-through at ×1 (exact)',
  measured: `${passThroughViolations} violations`,
  theory: '0',
  ok: passThroughViolations === 0,
});

console.log(`\nLANDFALL economy simulation — ${ROUNDS.toLocaleString()} rounds in ${elapsed.toFixed(1)}s`);
console.log(
  `constants: RAKE=${RAKE} split=${RAKE_SPLIT.house}/${RAKE_SPLIT.surge}/${RAKE_SPLIT.stormReserve} cap=${STORM_POWER_MAX_PAYOUT_MULTIPLE}× surgeProb=${SURGE_PROB}`,
);
console.log(`handle: ${(handleSum / 100).toLocaleString()} credits · capped rounds: ${cappedRounds} · surge rounds: ${surgeRounds}`);
console.log(
  `reserve: opening ${(reserveOpening / 100).toFixed(2)} · min balance ${(reserveMin / 100).toFixed(2)} · ` +
    `final ${(reserveState.balanceMinor / 100).toFixed(2)} · house backstop ${(reserveState.backstopTotalMinor / 100).toFixed(2)} credits\n`,
);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: measured ${c.measured} · theory ${c.theory}`);
}

// ---------------- solo-player deviation (§6 of the math model) ----------------
{
  const SOLO_ROUNDS = Math.min(ROUNDS, 1_000_000);
  const stake = 10_00;
  let net = 0;
  for (let i = 1; i <= SOLO_ROUNDS; i++) {
    const stakes: StakeEntry[] = [];
    for (let z = 0; z < ZONE_COUNT; z++) {
      stakes.push({ id: `h-${z}`, zone: z, amountMinor: HOUSE_SEED_MINOR, isHouseSeed: true });
    }
    stakes.push({ id: 'solo', zone: 0, amountMinor: stake, isHouseSeed: false });
    const draw = drawZone(nextSeedHex(), i, ZONE_COUNT);
    const r = settleRound(stakes, draw.struckZone, RAKE); // ×1: isolate the pari-mutuel effect
    const line = r.lines.find((l) => l.id === 'solo')!;
    net += line.payoutMinor - stake;
  }
  // Theory: EV = (S/K)[(1−r)·Σ_{j≠i} P_j/(T−P_j) − 1]
  const T = ZONE_COUNT * HOUSE_SEED_MINOR + stake;
  const sum = (ZONE_COUNT - 1) * (HOUSE_SEED_MINOR / (T - HOUSE_SEED_MINOR));
  const theory = (stake / ZONE_COUNT) * ((1 - RAKE) * sum - 1);
  const measured = net / SOLO_ROUNDS;
  const ok = Math.abs(measured - theory) < Math.max(1.5, Math.abs(theory) * 0.1);
  checks.push({ name: 'solo', measured: '', theory: '', ok });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  Solo-player EV (10.00 vs seeds, ×1): measured ${(measured / stake * 100).toFixed(3)}% · theory ${(theory / stake * 100).toFixed(3)}% of stake`,
  );
}

const failed = checks.filter((c) => !c.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll checks PASS');
