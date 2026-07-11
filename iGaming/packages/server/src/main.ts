import { serve } from '@hono/node-server';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { eq } from 'drizzle-orm';
import { DEFAULT_TIMINGS, SURGE_PROB, validateRakeConfig } from '@landfall/core';
import { createApp } from './app.js';
import { BotManager } from './bots.js';
import { ensureChain } from './chain.js';
import { ChatService } from './chat.js';
import { DEFAULT_ECONOMY, type CoordinatorEvents, type EconomyConfig, type Timings } from './coordinator.js';
import { openDb } from './db/index.js';
import { DrizzleSqliteRepository } from './db/repository.js';
import { players } from './db/schema.js';
import { Hub } from './hub.js';
import { LimitsService } from './limits.js';
import { RoomManager, isDemoEnv, loadRoomConfigs } from './rooms.js';

const PORT = Number(process.env.PORT ?? 8787);
// fileURLToPath (not URL.pathname) so the path is valid on Windows too.
const DB_FILE =
  process.env.LANDFALL_DB ?? fileURLToPath(new URL('../data/landfall.db', import.meta.url));

// Fast timings for local integration testing (LANDFALL_FAST=1).
const timings: Timings =
  process.env.LANDFALL_FAST === '1'
    ? { anchorMs: 3_000, stormMs: 1_500, resolvedMs: 1_000, cooldownMs: 800 }
    : DEFAULT_TIMINGS;

// Economy overrides (A1): LANDFALL_RAKE=0.12, LANDFALL_RAKE_SPLIT=house,surge,reserve
// (e.g. "0.5,0.25,0.25"), LANDFALL_MAX_PAYOUT_MULTIPLE=25. Validated; the server
// refuses to start on an invalid config rather than running bad math. These are
// the BASE values; per-room overrides come from the rooms config (C1/C2).
const econ: EconomyConfig = { ...DEFAULT_ECONOMY };
if (process.env.LANDFALL_RAKE) econ.rake = Number(process.env.LANDFALL_RAKE);
if (process.env.LANDFALL_RAKE_SPLIT) {
  const [house, surge, stormReserve] = process.env.LANDFALL_RAKE_SPLIT.split(',').map(Number);
  econ.rakeSplit = { house: house!, surge: surge!, stormReserve: stormReserve! };
}
if (process.env.LANDFALL_MAX_PAYOUT_MULTIPLE) {
  econ.maxPayoutMultiple = Number(process.env.LANDFALL_MAX_PAYOUT_MULTIPLE);
}
// Flat-odds Golden Anchor cadence (A4, P2 flag; 0 = off until RG review clears it).
if (process.env.LANDFALL_SURGE_FLAT_EVERY) {
  econ.surgeFlatEveryN = Number(process.env.LANDFALL_SURGE_FLAT_EVERY);
}
validateRakeConfig(econ.rake, econ.rakeSplit);

const { db, sqlite } = openDb(DB_FILE);
const repo = new DrizzleSqliteRepository(db, sqlite);

// House player (owns seed stakes + rake; a real row so conservation is auditable in the DB).
let house = db.select().from(players).where(eq(players.isHouse, true)).get();
if (!house) {
  house = {
    id: randomUUID(),
    name: 'HOUSE',
    balanceMinor: 10_000_000_00,
    isHouse: true,
    isBot: false,
    lastRoomId: null,
    createdAt: Date.now(),
  };
  db.insert(players).values(house).run();
}

const chain = ensureChain(db);
const chat = new ChatService(db);
// Responsible gambling (F1/F2): one service across all rooms, server-enforced.
const limits = new LimitsService(repo);
const hub = new Hub(db, chat, chain.commitment, limits);
// Surge probability overridable for local testing; recorded in /api/round for verification.
const surgeProb = Number(process.env.LANDFALL_SURGE_PROB ?? SURGE_PROB);

// Rooms (C1/C2): tier configs from server config; bots policy enforced at load (C5).
const demo = isDemoEnv();
const roomConfigs = loadRoomConfigs(demo, timings, surgeProb, econ);
const makeEvents = (roomId: string): CoordinatorEvents => ({
  broadcast: (msg) => hub.broadcastToRoom(roomId, msg),
  sendToPlayer: (playerId, msg) => hub.sendToPlayerInRoom(roomId, playerId, msg),
  broadcastLandfall: (build) => hub.broadcastLandfallToRoom(roomId, build),
  systemMessage: (text) => hub.systemMessageToRoom(roomId, text),
});
const rooms = new RoomManager(repo, chain, roomConfigs, makeEvents, limits);
hub.rooms = rooms;

const app = createApp(db, chain.commitment, surgeProb, econ);
const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[landfall] REST on http://localhost:${info.port}  (db: ${DB_FILE})`);
  console.log(`[landfall] chain commitment: ${chain.commitment}`);
  console.log(`[landfall] timings: ${JSON.stringify(timings)}`);
  console.log(
    `[landfall] rooms: ${roomConfigs.map((r) => `${r.roomId} (${r.minStakeMinor / 100}–${r.maxStakeMinor / 100}${r.botsAllowed ? ', bots' : ''})`).join(' · ')} — env ${demo ? 'DEMO' : 'production-like'}`,
  );
});

const wss = new WebSocketServer({ server: server as never, path: '/ws' });
hub.attach(wss);
rooms.start();
console.log(`[landfall] WS on ws://localhost:${PORT}/ws — rounds running`);

// Practice bots so solo players can see the crowd dynamics (LANDFALL_BOTS=0
// disables). Bots exist ONLY in rooms whose config allows them, which the
// rooms loader already refused outside LANDFALL_ENV=demo (C5).
const botCount = Number(process.env.LANDFALL_BOTS ?? 14);
const botManagers: BotManager[] = [];
if (botCount > 0) {
  for (const room of rooms.rooms.values()) {
    if (!room.cfg.botsAllowed) continue;
    const manager = new BotManager(db, room, botCount);
    manager.start();
    botManagers.push(manager);
  }
}

process.on('SIGINT', () => {
  for (const manager of botManagers) manager.stop();
  rooms.stop();
  wss.close();
  sqlite.close();
  process.exit(0);
});
