/**
 * BUILD AND CONFIGURATION IDENTITY — what, exactly, was tested.
 *
 * An evidence pack that cannot name the artefact it describes is not evidence.
 * GLI-19 §2.3.2 requires the system to be able to verify that its critical
 * control components are authentic copies of the approved ones, and §2.3.3 wants
 * that verification to be reproducible by an INDEPENDENT third party without
 * trusting — or even starting — the server. Law of Georgia Art. 24¹.2 adds the
 * reason it matters commercially: a change to the bet, the winnings, the game
 * architecture, the RNG platform or the jackpot payout system is a MATERIAL
 * change requiring prior Revenue Service consent and a fresh certificate.
 *
 * So this prints two digests and the values behind them:
 *
 *   SOURCE DIGEST         SHA-256 over every outcome-determining source file in
 *                         `packages/core` and `packages/server`, sorted by path.
 *   CONFIGURATION DIGEST  SHA-256 over the RESOLVED economy — the rake and its
 *                         split, the liability cap, the Storm Power ladder, the
 *                         stake tiers, the jackpot parameters, the rules version.
 *
 * The second is the one people forget. `rooms.json`, `RAKE` and the ladder are
 * all runtime-configurable, so a deployment can change what players are paid
 * without a single byte of code moving. A verification scheme that digested only
 * code would let the most consequential class of change pass unfingerprinted.
 *
 * Reproduce:  cd certification-tests && tsx simulations/identity.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RAKE,
  RAKE_MAX,
  RAKE_MIN,
  RAKE_SPLIT,
  RULES_CHANGELOG,
  RULES_VERSION,
  STORM_POWER_LADDER,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  SURGE_PROB,
  SURGE_RESET_BUDGET_FRACTION,
  SEED_CHAIN_LENGTH,
  WHALE_CAP_FRACTION,
  ZONE_COUNT,
  economyDisclosure,
  theoreticalRtp,
} from '@landfall/core';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKAGES = resolve(HERE, '..', '..', 'iGaming', 'packages');

const sha256 = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex');
const line = (s = ''): void => process.stdout.write(`${s}\n`);

/** Every source file under a directory, sorted, excluding tests and build output. */
function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names.sort()) {
      if (name === 'node_modules' || name === 'dist' || name === 'test' || name.startsWith('.')) {
        continue;
      }
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function main(): void {
  line('LANDFALL — BUILD AND CONFIGURATION IDENTITY');
  line('='.repeat(78));
  line(`Generated        ${new Date().toISOString()}`);
  line(`Rules version    v${RULES_VERSION}`);
  line();

  // --- source ---------------------------------------------------------------
  const entries: { component: string; digest: string; bytes: number }[] = [];
  for (const pkg of ['core', 'server']) {
    for (const file of sourceFiles(join(PACKAGES, pkg, 'src'))) {
      const buf = readFileSync(file);
      entries.push({
        component: relative(PACKAGES, file).split('\\').join('/'),
        digest: sha256(buf),
        bytes: buf.byteLength,
      });
    }
  }
  for (const extra of ['server/config/rooms.json']) {
    const buf = readFileSync(join(PACKAGES, extra));
    entries.push({ component: extra, digest: sha256(buf), bytes: buf.byteLength });
  }
  entries.sort((a, b) => a.component.localeCompare(b.component));
  const sourceDigest = sha256(entries.map((e) => `${e.component}:${e.digest}`).join('\n'));

  line('--- SOURCE DIGEST ---------------------------------------------------------');
  line(`  Files           ${entries.length}`);
  line(`  Bytes           ${entries.reduce((a, e) => a + e.bytes, 0).toLocaleString('en-US')}`);
  line(`  SHA-256         ${sourceDigest}`);
  line();
  line('  Per-component manifest (the same one `server/src/selfVerify.ts` builds):');
  for (const e of entries) {
    line(`    ${e.digest.slice(0, 16)}  ${String(e.bytes).padStart(7)}  ${e.component}`);
  }
  line();

  // --- configuration --------------------------------------------------------
  const economy = {
    rulesVersion: RULES_VERSION,
    zoneCount: ZONE_COUNT,
    rake: RAKE,
    rakeBounds: [RAKE_MIN, RAKE_MAX],
    rakeSplit: RAKE_SPLIT,
    maxPayoutMultiple: STORM_POWER_MAX_PAYOUT_MULTIPLE,
    whaleCapFraction: WHALE_CAP_FRACTION,
    surgeProb: SURGE_PROB,
    surgeResetBudgetFraction: SURGE_RESET_BUDGET_FRACTION,
    seedChainLength: SEED_CHAIN_LENGTH,
    ladder: STORM_POWER_LADDER,
  };
  const configDigest = sha256(JSON.stringify(economy));

  line('--- CONFIGURATION DIGEST --------------------------------------------------');
  line(`  SHA-256         ${configDigest}`);
  line();
  line('  The values behind it:');
  line(`    Harbours per round             ${ZONE_COUNT}`);
  line(`    Rake on the struck pool        ${(RAKE * 100).toFixed(2)}%   (permitted range ${(RAKE_MIN * 100).toFixed(0)}%-${(RAKE_MAX * 100).toFixed(0)}%)`);
  line(`    Rake split                     house ${RAKE_SPLIT.house} / jackpot ${RAKE_SPLIT.surge} / reserve ${RAKE_SPLIT.stormReserve}`);
  line(`    Payout liability cap           ${STORM_POWER_MAX_PAYOUT_MULTIPLE}× round handle`);
  line(`    Round-share cap per player     ${(WHALE_CAP_FRACTION * 100).toFixed(0)}%`);
  line(`    Jackpot trigger probability    ${(SURGE_PROB * 100).toFixed(4)}%   (~1 round in ${Math.round(1 / SURGE_PROB)})`);
  line(`    Jackpot reset budget           ${(SURGE_RESET_BUDGET_FRACTION * 100).toFixed(0)}% of what the house rake share can fund`);
  line(`    Seed chain length              ${SEED_CHAIN_LENGTH.toLocaleString('en-US')} rounds per season`);
  line();
  line('    Storm Power ladder:');
  let prev = 0;
  const space = STORM_POWER_LADDER[STORM_POWER_LADDER.length - 1]!.cumBound;
  for (const tier of STORM_POWER_LADDER) {
    const count = tier.cumBound - prev;
    prev = tier.cumBound;
    line(
      `      ${tier.label.padEnd(16)} ×${String(tier.mNum / tier.mDen).padStart(6)}   ` +
        `${count}/${space}   1 in ${Math.round(space / count).toLocaleString('en-US')}`,
    );
  }
  line();

  // --- the published economy ------------------------------------------------
  const rtp = theoreticalRtp();
  const disclosure = economyDisclosure();
  line('--- THE PUBLISHED ECONOMY -------------------------------------------------');
  line(`  Theoretical return to player   ${(rtp.totalRtp * 100).toFixed(4)}%`);
  line(`    base pari-mutuel             ${(rtp.baseReturn * 100).toFixed(4)}%`);
  line(`    jackpot contribution         ${(rtp.surgeReturn * 100).toFixed(4)}%`);
  line(`    multiplier ladder            ${(rtp.stormPowerReturn * 100).toFixed(4)}%`);
  line(`    house-funded jackpot reset   ${(rtp.jackpotReseedReturn * 100).toFixed(4)}%`);
  line(`  Operator theoretical hold      ${(rtp.operatorHold * 100).toFixed(4)}%`);
  line();
  line('  As shown to players:');
  line(`    "${disclosure.longRunReturn}"`);
  line(`    ${disclosure.derivation}`);
  line();

  // --- the rules changelog --------------------------------------------------
  line('--- RULES CHANGE LOG (GLI-19 §A.5.1; Law Art. 24¹.2) ----------------------');
  for (const row of RULES_CHANGELOG) {
    line(`  v${row.version}  ${row.effective}  ${row.material ? 'MATERIAL' : 'non-material'}`);
    if (row.limb) line(`      ${row.limb}`);
    for (const chunk of wrap(row.summary, 72)) line(`      ${chunk}`);
    line();
  }

  line('='.repeat(78));
  line('  Quote BOTH digests in any report that cites figures from this pack.');
  line('  A figure without them describes an unidentified build.');
  line('='.repeat(78));
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

main();
