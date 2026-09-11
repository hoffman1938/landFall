/**
 * RNG STATISTICAL EVIDENCE — the numbers behind the battery, printed.
 *
 * `suites/rng/battery.test.ts` renders a verdict. A laboratory needs the
 * DISTRIBUTION behind that verdict: the per-stream statistics, the observed
 * frequencies, and the p-values, so that the pass can be re-read rather than
 * taken on trust. That is what this produces.
 *
 * Every draw comes from the production chain and the production `drawZone`.
 * Every figure is reproducible: the streams are seeded from their labels, so
 * running this again on any machine prints the same report.
 *
 * Run:  ./run.sh --evidence      (or)      tsx simulations/rng-evidence.ts
 */
import {
  STORM_POWER_LADDER,
  SURGE_PROB,
  WEATHER_PATTERNS,
  ZONE_COUNT,
  drawZone,
  stormPowerFromRoll,
  weatherFromRoll,
} from '@landfall/core';
import { chiSquareUpperTail, criticalChiSquare, normalTwoSided, seasonSeeds } from '../suites/_lib/stats';

const STREAMS = Number(process.env.CERT_STREAMS ?? 20);
const PER_STREAM = Number(process.env.CERT_PER_STREAM ?? 12_000);
const BIG = Number(process.env.CERT_BIG ?? 500_000);
const ALPHA = 0.01;

const line = (s = ''): void => process.stdout.write(`${s}\n`);
const pct = (x: number, dp = 4): string => `${(x * 100).toFixed(dp)}%`;

function harbourStream(label: string, n: number): number[] {
  const out: number[] = [];
  for (const { seedHex, roundId } of seasonSeeds(label, n)) {
    out.push(drawZone(seedHex, roundId, ZONE_COUNT).struckZone);
  }
  return out;
}

// --- the seven tests, same implementations as the suite ---------------------

function totalDistribution(xs: number[]): { chi2: number; p: number; counts: number[] } {
  const counts = new Array<number>(ZONE_COUNT).fill(0);
  for (const x of xs) counts[x]! += 1;
  const e = xs.length / ZONE_COUNT;
  const chi2 = counts.reduce((a, c) => a + (c - e) ** 2 / e, 0);
  return { chi2, p: chiSquareUpperTail(chi2, ZONE_COUNT - 1), counts };
}

function overlaps(xs: number[]): number {
  const cells = ZONE_COUNT * ZONE_COUNT;
  const counts = new Array<number>(cells).fill(0);
  for (let i = 1; i < xs.length; i++) counts[xs[i - 1]! * ZONE_COUNT + xs[i]!]! += 1;
  const n = xs.length - 1;
  const e = n / cells;
  return chiSquareUpperTail(
    counts.reduce((a, c) => a + (c - e) ** 2 / e, 0),
    cells - 1,
  );
}

function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

function couponCollector(xs: number[]): number {
  const lengths: number[] = [];
  let seen = new Set<number>();
  let count = 0;
  for (const x of xs) {
    count += 1;
    seen.add(x);
    if (seen.size === ZONE_COUNT) {
      lengths.push(count);
      seen = new Set<number>();
      count = 0;
    }
  }
  if (lengths.length < 30) return 1;
  const k = ZONE_COUNT;
  const cdf = (t: number): number => {
    let s = 0;
    for (let j = 0; j <= k; j++) s += (j % 2 === 0 ? 1 : -1) * binomial(k, j) * Math.pow(1 - j / k, t);
    return Math.max(0, Math.min(1, s));
  };
  const maxT = 40;
  const buckets = new Array<number>(maxT - k + 2).fill(0);
  for (const len of lengths) buckets[Math.min(len, maxT) - k]! += 1;
  const probs = buckets.map((_, i) => {
    const t = i + k;
    return t >= maxT ? 1 - cdf(maxT - 1) : cdf(t) - cdf(t - 1);
  });
  const obs: number[] = [];
  const exp: number[] = [];
  let po = 0;
  let pe = 0;
  probs.forEach((p, i) => {
    const e = p * lengths.length;
    if (e >= 5) {
      obs.push(buckets[i]!);
      exp.push(e);
    } else {
      po += buckets[i]!;
      pe += e;
    }
  });
  if (pe > 0) {
    obs.push(po);
    exp.push(pe);
  }
  return chiSquareUpperTail(
    obs.reduce((a, o, i) => a + (o - exp[i]!) ** 2 / exp[i]!, 0),
    obs.length - 1,
  );
}

function runsTest(xs: number[]): number {
  const bits = xs.map((x) => (x >= ZONE_COUNT / 2 ? 1 : 0));
  const n1 = bits.filter((b) => b === 1).length;
  const n2 = bits.length - n1;
  if (n1 === 0 || n2 === 0) return 0;
  let runs = 1;
  for (let i = 1; i < bits.length; i++) if (bits[i] !== bits[i - 1]) runs += 1;
  const n = bits.length;
  const mean = (2 * n1 * n2) / n + 1;
  const variance = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
  return normalTwoSided((runs - mean) / Math.sqrt(variance));
}

function interplay(label: string, n: number): number {
  const table = new Array<number>(ZONE_COUNT * 2).fill(0);
  for (const { seedHex, roundId } of seasonSeeds(label, n)) {
    const d = drawZone(seedHex, roundId, ZONE_COUNT);
    table[d.struckZone * 2 + (d.uSurge >= 0.5 ? 1 : 0)]! += 1;
  }
  const rows = new Array<number>(ZONE_COUNT).fill(0);
  const cols = [0, 0];
  for (let z = 0; z < ZONE_COUNT; z++) {
    for (let c = 0; c < 2; c++) {
      rows[z]! += table[z * 2 + c]!;
      cols[c]! += table[z * 2 + c]!;
    }
  }
  let chi2 = 0;
  for (let z = 0; z < ZONE_COUNT; z++) {
    for (let c = 0; c < 2; c++) {
      const e = (rows[z]! * cols[c]!) / n;
      chi2 += (table[z * 2 + c]! - e) ** 2 / e;
    }
  }
  return chiSquareUpperTail(chi2, ZONE_COUNT - 1);
}

function serialCorrelation(xs: number[], lag = 1): number {
  const n = xs.length - lag;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) num += (xs[i]! - mean) * (xs[i + lag]! - mean);
  for (const x of xs) den += (x - mean) ** 2;
  return normalTwoSided((num / den) * Math.sqrt(n));
}

function duplicates(xs: number[]): number {
  let dup = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] === xs[i - 1]) dup += 1;
  const n = xs.length - 1;
  const p = 1 / ZONE_COUNT;
  return normalTwoSided((dup - n * p) / Math.sqrt(n * p * (1 - p)));
}

// ---------------------------------------------------------------------------

function main(): void {
  line('LANDFALL — RNG STATISTICAL EVIDENCE (GLI-19 §3.2)');
  line('='.repeat(78));
  line(`Generated        ${new Date().toISOString()}`);
  line(`Construction     seed chain: SHA-256 pre-committed; draw: HMAC-SHA256(seed, "landfall:round:<id>")`);
  line(`Streams          ${STREAMS} independent × ${PER_STREAM.toLocaleString('en-US')} draws`);
  line(`Single sample    ${BIG.toLocaleString('en-US')} draws`);
  line(`Confidence       99% (α = ${ALPHA})`);
  line();
  line('Every draw below comes from the PRODUCTION chain and the PRODUCTION draw');
  line('function. Streams are seeded from their labels, so this report reproduces');
  line('exactly on any machine.');
  line();

  // --- the large single sample ---------------------------------------------
  line('--- §3.2.3 DISTRIBUTION — the final outcome output ------------------------');
  const big = harbourStream('evidence-big', BIG);
  const dist = totalDistribution(big);
  line('Struck harbour, observed frequency:');
  dist.counts.forEach((c, z) => {
    line(
      `  Harbour ${z + 1}   ${String(c).padStart(9)}   ${pct(c / BIG)}   ` +
        `deviation ${((c / BIG - 1 / ZONE_COUNT) * 100).toFixed(4)} points`,
    );
  });
  line(
    `  chi-square ${dist.chi2.toFixed(4)}  df ${ZONE_COUNT - 1}  ` +
      `critical ${criticalChiSquare(ZONE_COUNT - 1).toFixed(4)}  p = ${dist.p.toFixed(4)}  ` +
      `${dist.p > ALPHA ? 'PASS' : 'FAIL'}`,
  );
  line();

  // --- the ladder -----------------------------------------------------------
  line('--- §3.2.3 INTENDED DISTRIBUTION — the Storm Power ladder ------------------');
  const tierCounts = new Array<number>(STORM_POWER_LADDER.length).fill(0);
  let surgeFired = 0;
  const weatherCounts = new Map<string, number>();
  for (const { seedHex, roundId } of seasonSeeds('evidence-big', BIG)) {
    const d = drawZone(seedHex, roundId, ZONE_COUNT);
    tierCounts[STORM_POWER_LADDER.indexOf(stormPowerFromRoll(d.stormPowerRoll))] += 1;
    if (d.uSurge < SURGE_PROB) surgeFired += 1;
    const w = weatherFromRoll(d.weatherRoll).id;
    weatherCounts.set(w, (weatherCounts.get(w) ?? 0) + 1);
  }
  const space = STORM_POWER_LADDER[STORM_POWER_LADDER.length - 1]!.cumBound;
  let prev = 0;
  line('Tier             Multiplier      Expected p        Observed p     Expected n   Observed n');
  line('-'.repeat(88));
  STORM_POWER_LADDER.forEach((tier, i) => {
    const p = (tier.cumBound - prev) / space;
    prev = tier.cumBound;
    const observed = tierCounts[i]!;
    line(
      `${tier.label.padEnd(16)} ${('×' + tier.mNum / tier.mDen).padStart(9)}   ` +
        `${p.toExponential(4).padStart(13)}   ${(observed / BIG).toExponential(4).padStart(13)}   ` +
        `${(p * BIG).toFixed(1).padStart(10)}   ${String(observed).padStart(10)}`,
    );
  });
  line();

  line('--- the jackpot trigger ---------------------------------------------------');
  const exactSurge = Math.ceil(SURGE_PROB * 2 ** 20) / 2 ** 20;
  const z = (surgeFired - BIG * exactSurge) / Math.sqrt(BIG * exactSurge * (1 - exactSurge));
  line(`  Nominal probability        ${pct(SURGE_PROB, 6)}`);
  line(`  Implemented probability    ${pct(exactSurge, 6)}   (20-bit roll; this is the real figure)`);
  line(`  Observed                   ${pct(surgeFired / BIG, 6)}   n = ${surgeFired}`);
  line(`  z = ${z.toFixed(4)}   ${Math.abs(z) < 2.576 ? 'PASS' : 'FAIL'} at 99%`);
  line();

  line('--- the cosmetic weather draw (mapping is exactly uniform: 256 mod 4 = 0) --');
  for (const w of WEATHER_PATTERNS) {
    const c = weatherCounts.get(w.id) ?? 0;
    line(`  ${w.id.padEnd(12)} ${String(c).padStart(9)}   ${pct(c / BIG)}`);
  }
  line();

  // --- the battery ----------------------------------------------------------
  line('--- §3.2.2 THE SEVEN-TEST BATTERY, PER STREAM -----------------------------');
  line('p-values. A value below 0.01 is a rejection at the stated level.');
  line();
  line(
    'Stream   TotalDist   Overlaps    Coupon      Runs        Interplay   Serial      Duplicates',
  );
  line('-'.repeat(88));
  const perTest: Record<string, number[]> = {
    'total distribution': [],
    overlaps: [],
    'coupon collector': [],
    runs: [],
    'interplay correlation': [],
    'serial correlation': [],
    duplicates: [],
  };
  for (let s = 0; s < STREAMS; s++) {
    const label = `battery-${s}`;
    const xs = harbourStream(label, PER_STREAM);
    const ps = [
      totalDistribution(xs).p,
      overlaps(xs),
      couponCollector(xs),
      runsTest(xs),
      interplay(label, PER_STREAM),
      serialCorrelation(xs),
      duplicates(xs),
    ];
    Object.keys(perTest).forEach((k, i) => perTest[k]!.push(ps[i]!));
    line(
      `${String(s + 1).padStart(6)}   ` +
        ps.map((p) => p.toFixed(4).padStart(9)).join('   ') +
        (ps.some((p) => p < ALPHA) ? '   <- rejection' : ''),
    );
  }
  line();

  const all = Object.values(perTest).flat();
  const rejections = all.filter((p) => p < ALPHA).length;
  line('--- THE COLLECTIVE VERDICT ------------------------------------------------');
  line(`  Decisions                 ${all.length}   (7 tests × ${STREAMS} streams)`);
  line(`  Expected rejections       ${(all.length * ALPHA).toFixed(1)}   at α = ${ALPHA}`);
  line(`  Observed rejections       ${rejections}`);
  line();
  line('  Per test:');
  for (const [name, ps] of Object.entries(perTest)) {
    const r = ps.filter((p) => p < ALPHA).length;
    line(`    ${name.padEnd(24)} ${r}/${STREAMS} rejected`);
  }
  line();
  line('  A single seeded run of seven tests at 99% rejects at least once about 7%');
  line('  of the time against a perfect source, so "seven passes" is not a 99%');
  line('  test — it is a 93% one that fails intermittently on correct code. The');
  line('  rejection RATE across independent streams is the collective reading.');
  line();

  // KS on the pooled p-values.
  const sorted = [...all].sort((a, b) => a - b);
  let d = 0;
  sorted.forEach((p, i) => {
    d = Math.max(d, Math.abs((i + 1) / sorted.length - p), Math.abs(p - i / sorted.length));
  });
  const ksCritical = 1.63 / Math.sqrt(sorted.length);
  line(`  Kolmogorov-Smirnov of the pooled p-values against uniform(0,1):`);
  line(`    D = ${d.toFixed(4)}   critical ${ksCritical.toFixed(4)}   ${d < ksCritical ? 'PASS' : 'FAIL'}`);
  line();

  const expected = all.length * ALPHA;
  const ceiling = Math.max(6, Math.ceil(expected + 4 * Math.sqrt(expected)));
  const pass = rejections <= ceiling && d < ksCritical && dist.p > ALPHA && Math.abs(z) < 2.576;
  line('='.repeat(78));
  line(pass ? '  VERDICT: all statistical tests PASSED at 99% confidence' : '  VERDICT: FAILED');
  line('='.repeat(78));
  if (!pass) process.exitCode = 1;
}

main();
