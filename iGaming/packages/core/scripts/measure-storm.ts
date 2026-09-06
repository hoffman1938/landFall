/**
 * Diagnostic: how often does the published storm path degenerate, and how
 * often does the jackpot actually fire?
 *
 * Not a test — a one-shot measurement over the real draw, run with
 * `pnpm --filter @landfall/core exec tsx scripts/measure-storm.ts`.
 */
import { randomBytes } from 'node:crypto';
import { DEFAULT_TIMINGS, SURGE_PROB, ZONE_COUNT } from '../src/constants';
import { drawZone } from '../src/rng';

// The hash chain only decides WHICH seed a round gets; the distribution of the
// draw is a property of the HMAC over that seed. Fresh random seeds measure the
// same thing without walking an O(n^2) chain.
const N = 200_000;

let sameFeint = 0;
let feintHitsStruck = 0;
let bothFeintsMissStruck = 0;
let surges = 0;
const feintCounts = new Array<number>(ZONE_COUNT).fill(0);
const zoneCounts = new Array<number>(ZONE_COUNT).fill(0);
let surgeGaps: number[] = [];
let lastSurge = 0;

for (let i = 1; i <= N; i++) {
  const draw = drawZone(randomBytes(32).toString('hex'), i, ZONE_COUNT);
  const [a, b] = draw.feints;
  if (a === b) sameFeint++;
  if (a === draw.struckZone || b === draw.struckZone) feintHitsStruck++;
  else bothFeintsMissStruck++;
  feintCounts[a]!++;
  feintCounts[b]!++;
  zoneCounts[draw.struckZone]!++;
  if (draw.uSurge < SURGE_PROB) {
    surges++;
    if (lastSurge) surgeGaps.push(i - lastSurge);
    lastSurge = i;
  }
}

const pct = (n: number) => `${((n / N) * 100).toFixed(2)}%`;
surgeGaps = surgeGaps.sort((x, y) => x - y);
const q = (p: number) => surgeGaps[Math.floor(surgeGaps.length * p)] ?? 0;
const t = DEFAULT_TIMINGS;
const roundSec = (t.anchorMs + t.stormMs + t.resolvedMs + t.cooldownMs) / 1000;

console.log(`rounds simulated: ${N.toLocaleString()}  (round length ${roundSec}s)\n`);

console.log('STORM PATH');
console.log(`  both feints on the SAME zone : ${sameFeint} (${pct(sameFeint)})  <- reticle has nowhere to travel`);
console.log(`  a feint lands on the struck zone: ${pct(feintHitsStruck)}`);
console.log(`  both feints miss the struck zone: ${pct(bothFeintsMissStruck)}`);
console.log(`  feint distribution across zones : ${feintCounts.map((c) => ((c / (2 * N)) * 100).toFixed(2) + '%').join('  ')}`);
console.log(`  struck distribution across zones: ${zoneCounts.map((c) => ((c / N) * 100).toFixed(2) + '%').join('  ')}\n`);

console.log('JACKPOT (Storm Surge)');
console.log(`  configured probability : ${SURGE_PROB} (1 in ${Math.round(1 / SURGE_PROB)})`);
console.log(`  observed               : ${surges} rounds (${pct(surges)}), 1 in ${(N / surges).toFixed(1)}`);
console.log(`  mean gap               : ${(surgeGaps.reduce((a, n) => a + n, 0) / surgeGaps.length).toFixed(1)} rounds  ≈ ${(((surgeGaps.reduce((a, n) => a + n, 0) / surgeGaps.length) * roundSec) / 60).toFixed(1)} min`);
console.log(`  median gap             : ${q(0.5)} rounds ≈ ${((q(0.5) * roundSec) / 60).toFixed(1)} min`);
console.log(`  p90 gap                : ${q(0.9)} rounds ≈ ${((q(0.9) * roundSec) / 60).toFixed(1)} min`);
console.log(`  p99 gap                : ${q(0.99)} rounds ≈ ${((q(0.99) * roundSec) / 60).toFixed(1)} min`);
console.log(`  longest gap seen       : ${surgeGaps.at(-1)} rounds ≈ ${(((surgeGaps.at(-1) ?? 0) * roundSec) / 60).toFixed(1)} min`);
