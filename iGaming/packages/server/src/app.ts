/**
 * Hono REST app — history + verification data. Runs on Node now, Cloudflare
 * Workers later with only an adapter change (software-architecture.md §4).
 */
import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import {
  HOUSE_SEED_DISCLOSURE,
  INTERRUPTION_RULES,
  MALFUNCTION_NOTICE,
  RULES_CHANGELOG,
  RULES_VERSION,
  SKILL_DISCLOSURE,
  STORM_POWER_APPLIES_TO,
  TABLE_ROUTING_DISCLOSURE,
  ZONE_COUNT,
  drawPresentation,
  drawZone,
  economyDisclosure,
  settlementFormulaDisclosure,
  stormPowerFromRoll,
  stormPowerPaytable,
  stormPowerRange,
  weatherFromRoll,
} from '@landfall/core';
import { DEFAULT_ECONOMY, type EconomyConfig } from './coordinator.js';
import type { Db } from './db/index.js';
import { rounds, surgeEvents } from './db/schema.js';
import { instanceId } from './log.js';
import { metrics } from './metrics.js';
import { significantEvents } from './db/schema.js';
import type { GameControl } from './gameControl.js';
import type { ControlProgramVerifier } from './selfVerify.js';
import {
  betTransactionsCsv,
  ecsReport,
  jackpotTransactionsCsv,
  monthlyJackpotBalancing,
  paytableRecord,
} from './reporting.js';

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
  /** Control-program self-verification (G17), for the on-demand endpoint. */
  verifier?: ControlProgramVerifier | undefined;
  /** Disable-on-demand service (G32). */
  control?: GameControl | undefined;
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
    if (row.voidedAt !== null) {
      // G27 — a voided round has no outcome to verify; every bet in it was
      // refunded. Say so plainly rather than reporting it as unsettled.
      return c.json({
        roundId: row.id,
        voided: true,
        voidedAt: row.voidedAt,
        voidReason: row.voidReason,
        rulesVersion: row.rulesVersion ?? null,
        note: 'Round voided before settlement. Every bet was returned in full and no rake was taken.',
      });
    }
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
      rulesVersion: row.rulesVersion ?? null,
      voidedAt: row.voidedAt ?? null,
      voidReason: row.voidReason ?? null,
    });
  });

  // -------------------------------------------------------------------------
  // Compliance surfaces
  // -------------------------------------------------------------------------

  /**
   * THE RULES ARTEFACT (G45; GLI-19 §A.5.1, Law Art. 12.1(f)).
   *
   * Served rather than embedded in the client so the rules the player reads, the
   * rules stamped on each round, and the rules in the regulatory submission are
   * literally the same bytes. §A.5.1 requires a log of changes with time stamps
   * and that the rules in force when a wager was accepted are the ones applied
   * to it — `rounds.rules_version` is the binding, this is the text.
   */
  app.get('/api/rules', (c) => {
    const economy = economyDisclosure(econ.rake, ZONE_COUNT);
    return c.json({
      rulesVersion: RULES_VERSION,
      changelog: RULES_CHANGELOG,
      malfunctionNotice: MALFUNCTION_NOTICE,
      settlement: settlementFormulaDisclosure(ZONE_COUNT, econ.rake),
      economy: {
        survivorShare: economy.survivorShare,
        longRunReturn: economy.longRunReturn,
        derivation: economy.derivation,
        surgeFrequency: economy.surgeFrequency,
        breakdown: economy.breakdown,
      },
      stormPower: {
        appliesTo: STORM_POWER_APPLIES_TO,
        range: stormPowerRange(),
        paytable: stormPowerPaytable(undefined, econ.rake, econ.maxPayoutMultiple),
        maxPayoutMultiple: econ.maxPayoutMultiple,
      },
      disclosures: {
        houseSeed: HOUSE_SEED_DISCLOSURE,
        skill: SKILL_DISCLOSURE,
        tableRouting: TABLE_ROUTING_DISCLOSURE,
      },
      interruption: INTERRUPTION_RULES,
    });
  });

  /**
   * §2.3.2 — control-program self-verification ON DEMAND. The scheduled 24-hour
   * run happens in the process; this is the "and on demand" limb, and it is what
   * an inspector or the Selected Person would call.
   */
  app.get('/api/compliance/verify', (c) => {
    if (!ops?.verifier) return c.json({ error: 'verifier not configured' }, 503);
    const result = ops.verifier.verify('ON_DEMAND');
    return c.json(result, result.passed ? 200 : 500);
  });

  /** Order 240 Art. 2.2 — the electronic control system data set, incl. GGR and RTP. */
  app.get('/api/compliance/report', (c) => {
    const period = readPeriod(c.req.query('from'), c.req.query('to'));
    const roomId = c.req.query('room') ?? undefined;
    return c.json(ecsReport(db, { ...period, roomId }));
  });

  /**
   * Order 240 Art. 3.3 / GLI §2.8.1(b) — every specific bet placed, exported.
   * CSV because the clause names it and because it is what a regulator opens.
   */
  app.get('/api/compliance/export/bets.csv', (c) => {
    const period = readPeriod(c.req.query('from'), c.req.query('to'));
    const roomId = c.req.query('room') ?? undefined;
    return c.text(betTransactionsCsv(db, { ...period, roomId }), 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="landfall-bets.csv"',
    });
  });

  /** Order 222 Art. 21(b.c) — jackpot details: every payout and every rollover. */
  app.get('/api/compliance/export/jackpots.csv', (c) => {
    const period = readPeriod(c.req.query('from'), c.req.query('to'));
    const roomId = c.req.query('room') ?? undefined;
    return c.text(jackpotTransactionsCsv(db, { ...period, roomId }), 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="landfall-jackpots.csv"',
    });
  });

  /**
   * Order 222 Annex 1 Art. 17.2 — monthly jackpot balancing. A non-zero
   * discrepancy must be recorded as an incident and notified, so the response
   * carries a 409 rather than a cheerful 200 when the identity fails.
   */
  app.get('/api/compliance/balancing', (c) => {
    const room = c.req.query('room');
    if (!room) return c.json({ error: 'room query parameter required' }, 400);
    const period = readPeriod(c.req.query('from'), c.req.query('to'));
    const result = monthlyJackpotBalancing(db, room, period);
    return c.json({ room, period, ...result }, result.incident ? 409 : 200);
  });

  /** GLI §2.8.3 — theme/paytable record with theoretical RTP and aggregates. */
  app.get('/api/compliance/paytable', (c) => c.json(paytableRecord(db)));

  /** GLI §2.9.5 / Order 222 Art. 16.2 — significant events with before/after. */
  app.get('/api/compliance/events', (c) => {
    const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 100)));
    const rows = db
      .select()
      .from(significantEvents)
      .orderBy(desc(significantEvents.id))
      .limit(limit)
      .all();
    return c.json({ events: rows });
  });

  /** §2.4.1 / §A.6.3 — what is currently disabled, and why. */
  app.get('/api/compliance/game-state', (c) => {
    if (!ops?.control) return c.json({ error: 'control not configured' }, 503);
    return c.json(ops.control.state());
  });

  return app;
}

/**
 * Reporting period, defaulting to the last 30 days. Parsed permissively because
 * these endpoints are read-only and an inspector typing a date should get data,
 * not a validation error.
 */
function readPeriod(from?: string, to?: string): { fromMs: number; toMs: number } {
  const toMs = to ? Date.parse(to) : Date.now();
  const fromMs = from ? Date.parse(from) : toMs - 30 * 24 * 60 * 60 * 1_000;
  return {
    fromMs: Number.isNaN(fromMs) ? 0 : fromMs,
    toMs: Number.isNaN(toMs) ? Date.now() : toMs,
  };
}

