import { serve } from '@hono/node-server';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { eq } from 'drizzle-orm';
import { DEFAULT_TIMINGS, SURGE_PROB } from '@landfall/core';
import { createApp } from './app.js';
import { BotManager } from './bots.js';
import { ensureChain } from './chain.js';
import { ChatService } from './chat.js';
import { RoundCoordinator, type Timings } from './coordinator.js';
import { openDb } from './db/index.js';
import { players } from './db/schema.js';
import { Hub } from './hub.js';

const PORT = Number(process.env.PORT ?? 8787);
// fileURLToPath (not URL.pathname) so the path is valid on Windows too.
const DB_FILE =
  process.env.LANDFALL_DB ?? fileURLToPath(new URL('../data/landfall.db', import.meta.url));

// Fast timings for local integration testing (LANDFALL_FAST=1).
const timings: Timings =
  process.env.LANDFALL_FAST === '1'
    ? { anchorMs: 3_000, stormMs: 1_500, resolvedMs: 1_000, cooldownMs: 800 }
    : DEFAULT_TIMINGS;

const { db, sqlite } = openDb(DB_FILE);

// House player (owns seed stakes + rake; a real row so conservation is auditable in the DB).
let house = db.select().from(players).where(eq(players.isHouse, true)).get();
if (!house) {
  house = {
    id: randomUUID(),
    name: 'HOUSE',
    balanceMinor: 10_000_000_00,
    isHouse: true,
    createdAt: Date.now(),
  };
  db.insert(players).values(house).run();
}

const chain = ensureChain(db);
const chat = new ChatService(db);
const hub = new Hub(db, chat, chain.commitment);
// Surge probability overridable for local testing; recorded in /api/round for verification.
const surgeProb = Number(process.env.LANDFALL_SURGE_PROB ?? SURGE_PROB);
const coordinator = new RoundCoordinator(db, sqlite, chain, hub, timings, surgeProb);
hub.coordinator = coordinator;

const app = createApp(db, chain.commitment, surgeProb);
const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[landfall] REST on http://localhost:${info.port}  (db: ${DB_FILE})`);
  console.log(`[landfall] chain commitment: ${chain.commitment}`);
  console.log(`[landfall] timings: ${JSON.stringify(timings)}`);
});

const wss = new WebSocketServer({ server: server as never, path: '/ws' });
hub.attach(wss);
coordinator.start();
console.log(`[landfall] WS on ws://localhost:${PORT}/ws — rounds running`);

// Practice bots so solo players can see the crowd dynamics (LANDFALL_BOTS=0 disables).
const botCount = Number(process.env.LANDFALL_BOTS ?? 14);
let botManager: BotManager | null = null;
if (botCount > 0) {
  botManager = new BotManager(db, coordinator, botCount);
  botManager.start();
}

process.on('SIGINT', () => {
  botManager?.stop();
  coordinator.stop();
  wss.close();
  sqlite.close();
  process.exit(0);
});
