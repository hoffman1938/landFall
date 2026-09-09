/**
 * Hono REST app — history + verification data. Runs on Node now, Cloudflare
 * Workers later with only an adapter change (software-architecture.md §4).
 */
import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import {
  ZONE_COUNT,
  drawPresentation,
  drawZone,
  stormPowerFromRoll,
  weatherFromRoll,
} from '@landfall/core';
import { DEFAULT_ECONOMY, type EconomyConfig } from './coordinator.js';
import type { Db } from './db/index.js';
import { rounds, surgeEvents } from './db/schema.js';
import { instanceId } from './log.js';
import { metrics } from './metrics.js';

/**
 * Operational hooks the process supplies to the REST layer. Kept as a callback
 * bag so `createApp` stays a pure function of its inputs and tests can build an
 * app with no rooms, no sockets and no scheduler.
 */
export interface AppOps {
  /** Readiness: is this instance able to serve traffic right now? */
  ready(): { ready: boolean; reason?: string };
  /** Called on a metrics scrape, to refresh live gauges before rendering. */
  sampleGauges?(): void;
}

export function createApp(
  db: Db,
  chainCommitment: string,
  surgeProb: number,
  econ: EconomyConfig = DEFAULT_ECONOMY,
  ops?: AppOps,
) {
  const app = new Hono();
  const startedAt = Date.now();

  /**
   * LIVENESS — "is the process up?". Never touches the database, so a DB blip
   * can't get a healthy process killed by an orchestrator. Pair with /api/ready.
   */
  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      game: 'landfall',
      instance: instanceId(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    }),
  );

  /**
   * READINESS — "should this instance receive traffic?". Checks the database is
   * actually answering and the rooms are running; a load balancer that only ever
   * probed liveness would keep routing players to an instance whose game loop
   * has stopped.
   */
  app.get('/api/ready', (c) => {
    let dbOk: boolean;
    try {
      db.select({ id: rounds.id }).from(rounds).limit(1).all();
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const rooms = ops?.ready() ?? { ready: true };
    const ready = dbOk && rooms.ready;
    return c.json(
      { ready, db: dbOk, rooms: rooms.ready, reason: rooms.reason, instance: instanceId() },
      ready ? 200 : 503,
    );
  });

  /** Prometheus scrape target. Text exposition format, no client library. */
  app.get('/api/metrics', (c) => {
    ops?.sampleGauges?.();
    metrics.gauge('landfall_uptime_seconds', 'Process uptime.', (Date.now() - startedAt) / 1000);
    return c.text(metrics.render(), 200, {
      'content-type': 'text/plain; version=0.0.4; charset=utf-8',
    });
  });

  app.get('/api/chain', (c) => c.json({ commitment: chainCommitment }));

  app.get('/api/history', (c) => {
    const rows = db
      .select({
        id: rounds.id,
        struckZone: rounds.struckZone,
        settledAt: rounds.settledAt,
      })
      .from(rounds)
      .orderBy(desc(rounds.id))
      .limit(50)
      .all()
      .filter((r) => r.struckZone !== null);
    return c.json({ rounds: rows });
  });

  /** Public verification record for a settled round (rng-provably-fair-spec.md §6). */
  app.get('/api/round/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'bad round id' }, 400);
    const row = db.select().from(rounds).where(eq(rounds.id, id)).get();
    if (!row) return c.json({ error: 'not found' }, 404);
    if (!row.settledAt || row.seedHex === null) {
      return c.json({ error: 'round not settled yet — seeds reveal only after landfall' }, 403);
    }
    const surge = db.select().from(surgeEvents).where(eq(surgeEvents.roundId, id)).get();
    // Storm Power is a pure function of the (now-revealed) seed — recompute for the record.
    const draw = drawZone(row.seedHex, row.id, ZONE_COUNT);
    const power = stormPowerFromRoll(draw.stormPowerRoll);
    const weather = weatherFromRoll(draw.weatherRoll);
    // v4 presentation domains — separate HMACs over the same revealed seed, so
    // the announcement the player saw before the round can be rechecked after it.
    const presentation = drawPresentation(row.seedHex, row.id);
    return c.json({
      roundId: row.id,
      chainIndex: row.chainIndex,
      prevChainValue: row.prevChainValue,
      seedHex: row.seedHex,
      struckZone: row.struckZone,
      lockSnapshot: row.lockSnapshotJson ? JSON.parse(row.lockSnapshotJson) : [],
      // Economy config as settled (falls back to the live config for legacy rows).
      rake: row.rakeBp !== null ? row.rakeBp / 10_000 : econ.rake,
      maxPayoutMultiple: row.maxPayoutMultiple ?? econ.maxPayoutMultiple,
      powerCapped: row.powerCapped ?? false,
      zoneCount: ZONE_COUNT,
      surgeProb,
      surge: surge
        ? {
            winnerStakeId: surge.winnerStakeId,
            amountMinor: surge.amountMinor,
            flatOdds: surge.flatOdds,
          }
        : null,
      stormPower: { label: power.label, mNum: power.mNum, mDen: power.mDen },
      weather,
      eventTier: presentation.eventTier,
      environment: presentation.environment,
    });
  });

  return app;
}
