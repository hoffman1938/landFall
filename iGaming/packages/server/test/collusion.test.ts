/**
 * B3 acceptance: a scripted 5-account synthetic syndicate is flagged in the
 * top ranks of the suspicion report while normal (bot-like, human-jittered)
 * traffic is not. The generator below mirrors the patterns the panel named:
 * robotic reaction timing, correlated fog orders, coordinated mass bluffs,
 * and min-stake probe churn — against 15 normal accounts with human jitter,
 * independent zones and honest flags.
 */
import { describe, expect, it } from 'vitest';
import { scanTelemetry, type TelemetryEvent } from '../src/collusion.js';

/** Deterministic PRNG (mulberry32) so the "normal player" noise is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ANCHOR_MS = 10_000;
const ROUNDS = 30;
const SYNDICATE = ['syn-1', 'syn-2', 'syn-3', 'syn-4', 'syn-5'];
const NORMALS = Array.from({ length: 15 }, (_, i) => `norm-${i + 1}`);

function order(
  playerId: string,
  roundId: number,
  msIntoPhase: number,
  zone: number,
  stakeMinor: number,
  opts: { inFog?: boolean; isMinStake?: boolean } = {},
): TelemetryEvent {
  return {
    playerId,
    action: 'FLEET_ORDER',
    roundId,
    msIntoPhase,
    zone,
    stakeMinor,
    inFog: opts.inFog ?? msIntoPhase >= ANCHOR_MS - 3_000,
    isMinStake: opts.isMinStake ?? false,
    detail: 'FOCUS',
  };
}

function signal(playerId: string, roundId: number, ms: number, zone: number): TelemetryEvent {
  return {
    playerId,
    action: 'SIGNAL',
    roundId,
    msIntoPhase: ms,
    zone,
    stakeMinor: null,
    inFog: false,
    isMinStake: false,
    detail: 'RALLY',
  };
}

function buildTelemetry(): TelemetryEvent[] {
  const rng = mulberry32(0xc0ffee);
  const events: TelemetryEvent[] = [];

  for (let r = 0; r < ROUNDS; r++) {
    const roundId = 100 + r;
    const syndicateZone = r % 6;

    // --- the syndicate: robotic timing, shared fog zone, mass bluffs, probes ---
    SYNDICATE.forEach((id, idx) => {
      // first order: near-constant reaction (σ ≈ 17ms — impossible for humans)
      events.push(order(id, roundId, 2_000 + idx * 40 + Math.floor(rng() * 60), (r + idx) % 6, 5_00));
      // final fog order: everyone lands the same zone within ~200ms
      events.push(
        order(id, roundId, 8_600 + Math.floor(rng() * 200), syndicateZone, 5_00, { inFog: true }),
      );
    });
    // two members flag a decoy zone every third round, then finish elsewhere
    if (r % 3 === 0) {
      const decoy = (syndicateZone + 3) % 6;
      events.push(signal('syn-1', roundId, 3_000, decoy));
      events.push(signal('syn-2', roundId, 3_150, decoy));
    }
    // one member churns min-stake probes most rounds
    if (r % 2 === 0) {
      events.push(order('syn-5', roundId, 4_000, (r + 1) % 6, 1_00, { isMinStake: true }));
      events.push(order('syn-5', roundId, 5_200, (r + 2) % 6, 1_00, { isMinStake: true }));
    }

    // --- normal traffic: human jitter, independent zones, honest flags ---
    for (const id of NORMALS) {
      if (rng() < 0.8) {
        const ms = 500 + Math.floor(rng() * 8_500);
        const zone = Math.floor(rng() * 6);
        events.push(order(id, roundId, ms, zone, 2_00 + Math.floor(rng() * 48) * 100));
        // a quarter of the time they also adjust during fog, to their own zone
        if (rng() < 0.25) {
          events.push(
            order(id, roundId, 7_200 + Math.floor(rng() * 2_500), Math.floor(rng() * 6), 3_00, {
              inFog: true,
            }),
          );
        }
        // occasional honest flag on the zone they actually hold
        if (rng() < 0.1) events.push(signal(id, roundId, 2_000 + Math.floor(rng() * 3_000), zone));
      }
    }
  }
  return events;
}

describe('collusion scan (B3)', () => {
  const reports = scanTelemetry(buildTelemetry());
  const byId = new Map(reports.map((r) => [r.playerId, r]));

  it('ranks the 5-account synthetic syndicate at the top', () => {
    const top5 = reports.slice(0, 5).map((r) => r.playerId);
    expect(new Set(top5)).toEqual(new Set(SYNDICATE));
  });

  it('separates the syndicate cleanly from normal traffic', () => {
    const minSyndicate = Math.min(...SYNDICATE.map((id) => byId.get(id)!.score));
    const maxNormal = Math.max(...NORMALS.map((id) => byId.get(id)?.score ?? 0));
    expect(minSyndicate).toBeGreaterThan(2 * maxNormal);
    expect(maxNormal).toBeLessThan(0.25);
  });

  it('attributes the right evidence to the right detectors', () => {
    // every syndicate member shows robotic timing and a fog partner
    for (const id of SYNDICATE) {
      const r = byId.get(id)!;
      expect(r.regularity.score).toBeGreaterThan(0.7);
      expect(r.fogCorrelation.score).toBeGreaterThan(0.8);
    }
    // the bluff pair is caught; a non-bluffing member is not
    expect(byId.get('syn-1')!.coordinatedBluffs.score).toBeGreaterThan(0.9);
    expect(byId.get('syn-2')!.coordinatedBluffs.score).toBeGreaterThan(0.9);
    expect(byId.get('syn-3')!.coordinatedBluffs.score).toBe(0);
    // the prober is caught; the others are not probing
    expect(byId.get('syn-5')!.probing.score).toBe(1);
    expect(byId.get('syn-4')!.probing.score).toBe(0);
  });

  it('gives an empty scan an empty report', () => {
    expect(scanTelemetry([])).toEqual([]);
  });
});
