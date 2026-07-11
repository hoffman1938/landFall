/**
 * Hono REST app — history + verification data. Runs on Node now, Cloudflare
 * Workers later with only an adapter change (software-architecture.md §4).
 */
import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { ZONE_COUNT, drawZone, stormPowerFromRoll, weatherFromRoll } from '@landfall/core';
import { DEFAULT_ECONOMY, type EconomyConfig } from './coordinator.js';
import type { Db } from './db/index.js';
import { rounds, surgeEvents } from './db/schema.js';

export function createApp(
  db: Db,
  chainCommitment: string,
  surgeProb: number,
  econ: EconomyConfig = DEFAULT_ECONOMY,
) {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, game: 'landfall' }));

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
    });
  });

  return app;
}
