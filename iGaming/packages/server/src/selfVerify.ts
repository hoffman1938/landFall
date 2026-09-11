/**
 * CONTROL PROGRAM SELF-VERIFICATION (gap G17; GLI-19 §2.3.2, §2.3.3, §2.6.3).
 *
 * §2.3.2 requires the system to verify itself AT LEAST EVERY 24 HOURS AND ON
 * DEMAND, using a digest of at least 128 bits, covering:
 *
 *     executables, libraries, GAMING AND SYSTEM CONFIGURATION, operating-system
 *     files, reporting components and database elements
 *
 * with an indication when verification fails. §2.3.3 additionally wants an
 * independent third-party verification method that does not depend on the
 * system's own security software.
 *
 * THE CONFIGURATION LIMB IS THE ONE THAT MATTERS HERE, and it is why this file
 * digests more than source. `rooms.json`, the rake, the rake split, the Storm
 * Power ladder and the liability cap are all runtime-configurable, and under Law
 * Art. 24¹.2 every one of them is a MATERIAL CHANGE surface — a change to the
 * bet, the winnings or the jackpot payout system requires prior Revenue Service
 * consent and a fresh authorization certificate. A verification scheme that
 * digested only code would let the single most consequential class of change
 * pass without leaving a fingerprint.
 *
 * The digest is SHA-256 (256 bits, well past the 128-bit floor) over a sorted
 * manifest of per-component digests, so a failure names the component that
 * moved rather than just reporting a mismatch.
 *
 * INDEPENDENT VERIFICATION (§2.3.3): `manifest()` is a pure function of files on
 * disk and the resolved config, with no dependency on the running game, the
 * database or any auth path. `scripts/verify-control-program.ts` runs it
 * standalone so a third party can reproduce the digest without trusting — or
 * even starting — the server.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RAKE,
  RAKE_SPLIT,
  RULES_VERSION,
  STORM_POWER_LADDER,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  SURGE_PROB,
  WHALE_CAP_FRACTION,
  ZONE_COUNT,
} from '@landfall/core';
import type { GameRepository } from './db/repository.js';
import { log } from './log.js';
import { metrics } from './metrics.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** packages/ — the root of everything that decides an outcome. */
const PACKAGES_ROOT = resolve(HERE, '..', '..');

export interface ManifestEntry {
  component: string;
  digestHex: string;
  bytes: number;
}

export interface ControlManifest {
  /** SHA-256 over the sorted per-component manifest. */
  digestHex: string;
  entries: ManifestEntry[];
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Every .ts file under a directory, sorted, excluding tests and build output. */
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
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

/**
 * Build the manifest. Pure: same files and same config give the same digest on
 * any machine, which is what makes third-party reproduction possible.
 */
export function controlManifest(): ControlManifest {
  const entries: ManifestEntry[] = [];

  // (a) Executables and libraries — the outcome-determining source.
  for (const pkg of ['core', 'server']) {
    for (const file of sourceFiles(join(PACKAGES_ROOT, pkg, 'src'))) {
      const buf = readFileSync(file);
      entries.push({
        component: `src:${relative(PACKAGES_ROOT, file).split('\\').join('/')}`,
        digestHex: sha256Hex(buf),
        bytes: buf.byteLength,
      });
    }
  }

  // (b) Gaming configuration — room tiers, stake ranges, seeds, bot policy.
  for (const file of ['server/config/rooms.json']) {
    try {
      const buf = readFileSync(join(PACKAGES_ROOT, file));
      entries.push({ component: `config:${file}`, digestHex: sha256Hex(buf), bytes: buf.byteLength });
    } catch {
      // A missing optional config is itself a fact worth recording.
      entries.push({ component: `config:${file}`, digestHex: sha256Hex('ABSENT'), bytes: 0 });
    }
  }

  // (c) The economy constants as RESOLVED at runtime. Digesting the source file
  // is not enough: an env override or a room config could change the effective
  // rake without changing a byte of code, and that is a material change.
  const economy = JSON.stringify({
    rulesVersion: RULES_VERSION,
    zoneCount: ZONE_COUNT,
    rake: RAKE,
    rakeSplit: RAKE_SPLIT,
    maxPayoutMultiple: STORM_POWER_MAX_PAYOUT_MULTIPLE,
    whaleCapFraction: WHALE_CAP_FRACTION,
    surgeProb: SURGE_PROB,
    ladder: STORM_POWER_LADDER,
  });
  entries.push({
    component: 'config:economy',
    digestHex: sha256Hex(economy),
    bytes: Buffer.byteLength(economy),
  });

  // (d) Database elements — the schema the reporting components read.
  try {
    const ddl = readFileSync(join(PACKAGES_ROOT, 'server', 'src', 'db', 'ddl.ts'));
    entries.push({ component: 'db:schema', digestHex: sha256Hex(ddl), bytes: ddl.byteLength });
  } catch {
    /* covered by the src: entries above */
  }

  entries.sort((a, b) => a.component.localeCompare(b.component));
  const digestHex = sha256Hex(entries.map((e) => `${e.component}:${e.digestHex}`).join('\n'));
  return { digestHex, entries };
}

export interface VerificationResult {
  passed: boolean;
  digestHex: string;
  baselineHex: string;
  /** Components whose digest differs from the baseline run, when one exists. */
  changed: string[];
  trigger: 'SCHEDULED' | 'STARTUP' | 'ON_DEMAND';
  at: number;
}

/**
 * Runs a verification and records it. The FIRST run establishes the baseline —
 * that is the certified artefact's fingerprint, and every later run is compared
 * against it.
 */
export class ControlProgramVerifier {
  private baselineHex: string | undefined;
  private baselineEntries = new Map<string, string>();
  private last: VerificationResult | undefined;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private repo: GameRepository) {
    this.baselineHex = repo.lastControlBaseline();
  }

  /** §2.3.2 — "at least every 24 hours". */
  static readonly INTERVAL_MS = 24 * 60 * 60 * 1_000;

  verify(trigger: VerificationResult['trigger']): VerificationResult {
    const manifest = controlManifest();
    const baseline = this.baselineHex ?? manifest.digestHex;
    const passed = manifest.digestHex === baseline;

    const changed: string[] = [];
    if (!passed && this.baselineEntries.size > 0) {
      for (const entry of manifest.entries) {
        const was = this.baselineEntries.get(entry.component);
        if (was !== undefined && was !== entry.digestHex) changed.push(entry.component);
      }
    }
    if (this.baselineEntries.size === 0) {
      for (const entry of manifest.entries) this.baselineEntries.set(entry.component, entry.digestHex);
    }
    this.baselineHex = baseline;

    const result: VerificationResult = {
      passed,
      digestHex: manifest.digestHex,
      baselineHex: baseline,
      changed,
      trigger,
      at: Date.now(),
    };
    this.last = result;

    this.repo.insertControlVerification({
      trigger,
      digestHex: manifest.digestHex,
      baselineHex: baseline,
      passed,
      manifestJson: JSON.stringify(manifest.entries),
    });

    // §2.3.2 "an indication on failure" — a metric an operator can alert on, a
    // structured log line, and a significant-event row with the value before
    // and after, which is what §2.9.5 wants for an alteration.
    metrics.gauge(
      'landfall_control_program_verified',
      'Control program self-verification: 1 = digest matches the certified baseline.',
      passed ? 1 : 0,
    );
    if (!passed) {
      log.error('CONTROL PROGRAM VERIFICATION FAILED', {
        trigger,
        expected: baseline,
        actual: manifest.digestHex,
        changed,
      });
      this.repo.insertSignificantEvent({
        category: 'INTEGRITY',
        component: changed.length > 0 ? changed.join(', ') : 'control-program',
        actor: 'system',
        reason: `self-verification failed (${trigger})`,
        valueBefore: baseline,
        valueAfter: manifest.digestHex,
        incident: true,
      });
    } else {
      log.info('control program verified', { trigger, digest: manifest.digestHex });
    }
    return result;
  }

  /** The most recent result, for the readiness probe and the on-demand endpoint. */
  latest(): VerificationResult | undefined {
    return this.last;
  }

  start(): void {
    this.verify('STARTUP');
    this.timer = setInterval(() => this.verify('SCHEDULED'), ControlProgramVerifier.INTERVAL_MS);
    // Never hold the process open for a health check.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
