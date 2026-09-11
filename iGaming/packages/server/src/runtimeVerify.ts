/**
 * HOST-NEUTRAL CONTROL-PROGRAM VERIFICATION (GLI-19 §2.3.2; gap G17).
 *
 * `selfVerify.ts` is the full verifier: it walks `packages/core` and
 * `packages/server` on disk, digests every source file, the room config, the
 * resolved economy and the database DDL, and compares the result against the
 * certified baseline. It needs `node:fs`, so it exists only on the Node host.
 *
 * THE PROBLEM THAT LEAVES. The public build runs on Cloudflare Workers, where
 * there is no filesystem — so that host passed no verifier to `createApp` at
 * all and `/api/compliance/verify` answered `503 verifier not configured`. The
 * §2.3.2 surface was therefore absent on precisely the deployment an inspector
 * would reach for, while the compliance documentation described it as present.
 *
 * WHAT THIS VERIFIES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * §2.3.2(b) asks for "executables, libraries, gaming or system configurations,
 * operating system files, components that control required system reporting,
 * and database elements". On a Worker the code identity is established by the
 * platform rather than by the program: a Worker version is immutable, content-
 * addressed and named by a deployment id, and the running bundle cannot be
 * altered in place the way a file on a server can. What CAN still differ between
 * two deployments of the same bundle — and what Law of Georgia Art. 24¹.2 treats
 * as a MATERIAL change requiring fresh consent — is the RESOLVED GAMING
 * CONFIGURATION: the stake tiers, the rake and its split, the payout cap, the
 * Storm Power ladder, the surge probability, the rules version, the bots policy.
 *
 * So this digests exactly that, at runtime, from the values the game is actually
 * using rather than from the file they were read out of — and the result says
 * `coverage: 'CONFIGURATION'` so nobody can mistake it for the full manifest.
 * Reporting a narrower check honestly is the requirement; reporting a 503, or
 * reporting a full verification that did not happen, are both worse.
 */
import { sha256Hex } from '@landfall/core';
import {
  RAKE,
  RAKE_SPLIT,
  RULES_VERSION,
  STORM_POWER_LADDER,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  WHALE_CAP_FRACTION,
  ZONE_COUNT,
} from '@landfall/core';
import type { EconomyConfig, RoomConfig } from './coordinator.js';
import type { GameRepository } from './db/repository.js';
import { log } from './log.js';
import { metrics } from './metrics.js';

export type VerificationTrigger = 'SCHEDULED' | 'STARTUP' | 'ON_DEMAND';

export interface RuntimeVerificationEntry {
  component: string;
  digestHex: string;
}

export interface RuntimeVerificationResult {
  passed: boolean;
  digestHex: string;
  baselineHex: string;
  changed: string[];
  trigger: VerificationTrigger;
  at: number;
  /**
   * How much of §2.3.2(b) this run actually covered. `FULL` is the Node
   * verifier's source-walking manifest; `CONFIGURATION` is this one.
   */
  coverage: 'CONFIGURATION';
  /** Plain-language statement of the limit, carried in the response itself. */
  note: string;
}

/**
 * The verification surface `createApp` needs. Declared here so `AppOps` can
 * accept either verifier without the REST layer knowing which host it is on.
 */
export interface ControlVerifier {
  verify(trigger: VerificationTrigger): {
    passed: boolean;
    digestHex: string;
    baselineHex: string;
    changed: string[];
    trigger: VerificationTrigger;
    at: number;
  };
}

/** Every runtime value that decides money, as one canonical string. */
export function runtimeConfigManifest(
  rooms: readonly RoomConfig[],
  econ: EconomyConfig,
  surgeProb: number,
): RuntimeVerificationEntry[] {
  const entries: RuntimeVerificationEntry[] = [
    {
      component: 'config:economy',
      digestHex: sha256Hex(
        JSON.stringify({
          rulesVersion: RULES_VERSION,
          zoneCount: ZONE_COUNT,
          rake: econ.rake,
          rakeSplit: econ.rakeSplit,
          maxPayoutMultiple: econ.maxPayoutMultiple,
          surgeFlatEveryN: econ.surgeFlatEveryN,
          surgeProb,
          // The compiled-in defaults too: an override that happens to equal the
          // default is still a different configuration to certify against.
          defaults: {
            rake: RAKE,
            rakeSplit: RAKE_SPLIT,
            maxPayoutMultiple: STORM_POWER_MAX_PAYOUT_MULTIPLE,
            whaleCapFraction: WHALE_CAP_FRACTION,
          },
          ladder: STORM_POWER_LADDER,
        }),
      ),
    },
  ];
  for (const room of [...rooms].sort((a, b) => a.roomId.localeCompare(b.roomId))) {
    entries.push({
      component: `config:room:${room.roomId}`,
      digestHex: sha256Hex(
        JSON.stringify({
          roomId: room.roomId,
          minStakeMinor: room.minStakeMinor,
          maxStakeMinor: room.maxStakeMinor,
          whaleCapFraction: room.whaleCapFraction,
          seedMinor: room.seedMinor,
          liquidityFloorMinor: room.liquidityFloorMinor,
          minSeedMinor: room.minSeedMinor,
          surgeProb: room.surgeProb,
          surgeFloorMinor: room.surgeFloorMinor,
          signalMinStakeMinor: room.signalMinStakeMinor,
          botsAllowed: room.botsAllowed,
          botCount: room.botCount,
          botBankrollMinor: room.botBankrollMinor,
          econ: room.econ,
          timings: room.timings,
        }),
      ),
    });
  }
  return entries.sort((a, b) => a.component.localeCompare(b.component));
}

/**
 * Run a configuration verification and record it, with the same baseline,
 * failure-indication and significant-event behaviour as the Node verifier.
 *
 * Stateless by design: the baseline comes from the repository, so a Durable
 * Object that is evicted and rebuilt compares against the same certified
 * fingerprint rather than silently re-baselining on its own restart.
 */
export function runtimeControlManifest(
  repo: GameRepository,
  rooms: readonly RoomConfig[],
  econ: EconomyConfig,
  surgeProb: number,
  trigger: VerificationTrigger,
): RuntimeVerificationResult {
  const entries = runtimeConfigManifest(rooms, econ, surgeProb);
  const digestHex = sha256Hex(entries.map((e) => `${e.component}:${e.digestHex}`).join('\n'));
  const baselineHex = repo.lastControlBaseline() ?? digestHex;
  const passed = digestHex === baselineHex;

  repo.insertControlVerification({
    trigger,
    digestHex,
    baselineHex,
    passed,
    manifestJson: JSON.stringify(entries),
  });

  metrics.gauge(
    'landfall_control_program_verified',
    'Control program self-verification: 1 = digest matches the certified baseline.',
    passed ? 1 : 0,
  );
  if (!passed) {
    log.error('CONTROL PROGRAM VERIFICATION FAILED', { trigger, expected: baselineHex, actual: digestHex });
    repo.insertSignificantEvent({
      category: 'INTEGRITY',
      component: 'control-program:configuration',
      actor: 'system',
      reason: `runtime configuration verification failed (${trigger})`,
      valueBefore: baselineHex,
      valueAfter: digestHex,
      incident: true,
    });
  }

  return {
    passed,
    digestHex,
    baselineHex,
    // Without the previous manifest in memory this reports the scope rather
    // than guessing at individual components.
    changed: passed ? [] : entries.map((e) => e.component),
    trigger,
    at: Date.now(),
    coverage: 'CONFIGURATION',
    note:
      'Runtime configuration verification. Covers every value that decides money — stake tiers, ' +
      'rake and split, payout cap, Storm Power ladder, surge probability, bots policy and rules ' +
      'version — digested from the values in use, not from the file they were read from. It does ' +
      'NOT walk source files: on this host the code identity is the immutable deployed bundle ' +
      'version. The full source manifest is produced by the Node verifier and by ' +
      'scripts/verify-control-program.ts.',
  };
}
