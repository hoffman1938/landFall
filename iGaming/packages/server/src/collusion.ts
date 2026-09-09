/**
 * Collusion baseline analysis (remediation B3) — pure functions over the
 * action_telemetry rows, so the detectors are unit-testable without a DB
 * (test/collusion.test.ts) and runnable offline (scripts/collusion-scan.ts).
 *
 * Four detectors, per the panel's syndicate model:
 *   1. reaction regularity impossible for humans (sub-human timing variance);
 *   2. correlated final orders across accounts (same zone, tight windows,
 *      round after round, during Blind Fog);
 *   3. coordinated flag/move divergence — mass bluffs (several accounts flag a
 *      zone and then all finish elsewhere in the same round);
 *   4. repeated min-stake probing (min-stake orders churned to read pools).
 *
 * Output is a RANKED SUSPICION REPORT with human-readable evidence. No
 * auto-bans — this is evidence for ops (see security-review.md §1.25).
 */

export interface TelemetryEvent {
  playerId: string;
  action: 'FLEET_ORDER' | 'CANCEL_ORDER' | 'SIGNAL';
  roundId: number;
  msIntoPhase: number;
  zone: number | null;
  stakeMinor: number | null;
  inFog: boolean;
  isMinStake: boolean;
  detail: string | null;
}

export interface SuspicionComponent {
  /** 0 (unremarkable) … 1 (maximally suspicious). */
  score: number;
  evidence: string;
}

export interface SuspicionReport {
  playerId: string;
  /** Weighted total in [0, 1]; the ranked report sorts by this. */
  score: number;
  regularity: SuspicionComponent;
  fogCorrelation: SuspicionComponent;
  coordinatedBluffs: SuspicionComponent;
  probing: SuspicionComponent;
}

/* ---------- tunables (documented thresholds, not magic) ---------- */

/** Rounds of first-order timing needed before regularity is judged at all. */
export const REGULARITY_MIN_SAMPLES = 8;
/**
 * Humans placing a first order each round jitter by seconds; a standard
 * deviation under this is scripted territory (score scales linearly to 0 here).
 */
export const REGULARITY_HUMAN_STDDEV_MS = 250;
/** Fog-order rounds two accounts must share before their correlation counts. */
export const FOG_PAIR_MIN_SHARED_ROUNDS = 5;
/** Two fog orders this close together are "the same hand" for correlation. */
export const FOG_PAIR_TIGHT_WINDOW_MS = 500;
/** Coordinated-bluff rounds that saturate the bluff score. */
export const BLUFF_ROUNDS_FOR_MAX = 4;
/** Probing rounds that saturate the probing score. */
export const PROBE_ROUNDS_FOR_MAX = 5;

/** Component weights — timing evidence is strongest, so it carries the most. */
export const WEIGHTS = {
  regularity: 0.35,
  fogCorrelation: 0.35,
  coordinatedBluffs: 0.15,
  probing: 0.15,
} as const;

/* ---------- helpers ---------- */

function stddev(values: number[]): number {
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

interface PerPlayer {
  /** roundId -> ms of the FIRST fleet order in that round. */
  firstOrderMs: Map<number, number>;
  /** roundId -> {zone, ms} of the LAST fog fleet order in that round. */
  fogFinal: Map<number, { zone: number; ms: number }>;
  /** roundId -> zone of the LAST fleet order in that round (any phase). */
  lastOrderZone: Map<number, number>;
  /** roundId -> flagged zone (first signal). */
  signalZone: Map<number, number>;
  /** roundIds where the player cancelled. */
  cancelRounds: Set<number>;
  /** roundId -> count of min-stake fleet orders. */
  minStakeOrders: Map<number, number>;
}

function groupByPlayer(events: TelemetryEvent[]): Map<string, PerPlayer> {
  const players = new Map<string, PerPlayer>();
  const get = (id: string): PerPlayer => {
    let p = players.get(id);
    if (!p) {
      p = {
        firstOrderMs: new Map(),
        fogFinal: new Map(),
        lastOrderZone: new Map(),
        signalZone: new Map(),
        cancelRounds: new Set(),
        minStakeOrders: new Map(),
      };
      players.set(id, p);
    }
    return p;
  };

  for (const e of events) {
    const p = get(e.playerId);
    if (e.action === 'FLEET_ORDER' && e.zone !== null) {
      const first = p.firstOrderMs.get(e.roundId);
      if (first === undefined || e.msIntoPhase < first) {
        p.firstOrderMs.set(e.roundId, e.msIntoPhase);
      }
      const prevZoneMs = p.fogFinal.get(e.roundId);
      if (e.inFog && (prevZoneMs === undefined || e.msIntoPhase > prevZoneMs.ms)) {
        p.fogFinal.set(e.roundId, { zone: e.zone, ms: e.msIntoPhase });
      }
      p.lastOrderZone.set(e.roundId, e.zone); // events arrive in accept order
      if (e.isMinStake) {
        p.minStakeOrders.set(e.roundId, (p.minStakeOrders.get(e.roundId) ?? 0) + 1);
      }
    } else if (e.action === 'CANCEL_ORDER') {
      p.cancelRounds.add(e.roundId);
      p.lastOrderZone.delete(e.roundId); // the fleet left the bay entirely
    } else if (e.action === 'SIGNAL' && e.zone !== null) {
      if (!p.signalZone.has(e.roundId)) p.signalZone.set(e.roundId, e.zone);
    }
  }
  return players;
}

/* ---------- the scan ---------- */

export function scanTelemetry(events: TelemetryEvent[]): SuspicionReport[] {
  const players = groupByPlayer(events);
  const ids = [...players.keys()];

  // 2. correlated fog orders — best partner per player, computed pairwise.
  const fogCorrelation = new Map<string, SuspicionComponent>();
  for (const id of ids) fogCorrelation.set(id, { score: 0, evidence: '—' });
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = players.get(ids[i]!)!;
      const b = players.get(ids[j]!)!;
      let shared = 0;
      let sameZoneTight = 0;
      for (const [roundId, fa] of a.fogFinal) {
        const fb = b.fogFinal.get(roundId);
        if (!fb) continue;
        shared += 1;
        if (fa.zone === fb.zone && Math.abs(fa.ms - fb.ms) <= FOG_PAIR_TIGHT_WINDOW_MS) {
          sameZoneTight += 1;
        }
      }
      if (shared < FOG_PAIR_MIN_SHARED_ROUNDS) continue;
      const score = clamp01(sameZoneTight / shared);
      for (const [id, partner] of [
        [ids[i]!, ids[j]!],
        [ids[j]!, ids[i]!],
      ] as const) {
        if (score > fogCorrelation.get(id)!.score) {
          fogCorrelation.set(id, {
            score,
            evidence: `${sameZoneTight}/${shared} shared fog rounds same-zone within ${FOG_PAIR_TIGHT_WINDOW_MS}ms of ${partner}`,
          });
        }
      }
    }
  }

  // 3. coordinated bluffs: per round, zone -> players who flagged it and ended elsewhere.
  const bluffRounds = new Map<string, number>(); // playerId -> coordinated bluff round count
  const byRoundZoneBluffers = new Map<string, string[]>(); // `${roundId}:${zone}` -> playerIds
  for (const id of ids) {
    const p = players.get(id)!;
    for (const [roundId, flaggedZone] of p.signalZone) {
      const finalZone = p.lastOrderZone.get(roundId);
      const bluffed = finalZone === undefined || finalZone !== flaggedZone;
      if (!bluffed) continue;
      const key = `${roundId}:${flaggedZone}`;
      byRoundZoneBluffers.set(key, [...(byRoundZoneBluffers.get(key) ?? []), id]);
    }
  }
  for (const bluffers of byRoundZoneBluffers.values()) {
    if (bluffers.length < 2) continue; // a lone bluff is legitimate play
    for (const id of bluffers) bluffRounds.set(id, (bluffRounds.get(id) ?? 0) + 1);
  }

  // assemble per-player reports
  const reports: SuspicionReport[] = ids.map((id) => {
    const p = players.get(id)!;

    // 1. reaction regularity
    const timings = [...p.firstOrderMs.values()];
    let regularity: SuspicionComponent = {
      score: 0,
      evidence: `only ${timings.length} first-order samples`,
    };
    if (timings.length >= REGULARITY_MIN_SAMPLES) {
      const sd = stddev(timings);
      regularity = {
        score: clamp01(1 - sd / REGULARITY_HUMAN_STDDEV_MS),
        evidence: `first-order timing σ=${sd.toFixed(0)}ms over ${timings.length} rounds`,
      };
    }

    // 3. coordinated bluffs
    const coordBluffs = bluffRounds.get(id) ?? 0;
    const coordinatedBluffs: SuspicionComponent = {
      score: clamp01(coordBluffs / BLUFF_ROUNDS_FOR_MAX),
      evidence:
        coordBluffs > 0
          ? `${coordBluffs} rounds bluffing the same zone as another account`
          : '—',
    };

    // 4. min-stake probing: ≥2 min-stake orders in a round, or min-stake + cancel.
    let probeRounds = 0;
    for (const [roundId, n] of p.minStakeOrders) {
      if (n >= 2 || p.cancelRounds.has(roundId)) probeRounds += 1;
    }
    const probing: SuspicionComponent = {
      score: clamp01(probeRounds / PROBE_ROUNDS_FOR_MAX),
      evidence: probeRounds > 0 ? `${probeRounds} rounds of min-stake probe churn` : '—',
    };

    const fog = fogCorrelation.get(id)!;
    const score =
      WEIGHTS.regularity * regularity.score +
      WEIGHTS.fogCorrelation * fog.score +
      WEIGHTS.coordinatedBluffs * coordinatedBluffs.score +
      WEIGHTS.probing * probing.score;

    return {
      playerId: id,
      score,
      regularity,
      fogCorrelation: fog,
      coordinatedBluffs,
      probing,
    };
  });

  return reports.sort((a, b) => b.score - a.score);
}
