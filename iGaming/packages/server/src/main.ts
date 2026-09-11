import { serve } from '@hono/node-server';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DEFAULT_TIMINGS, SURGE_PROB, validateRakeConfig } from '@landfall/core';
import { createApp } from './app.js';
import { seatBots } from './bots.js';
import { ensureChain } from './chain.js';
import { ChatService } from './chat.js';
import { PracticeCredits } from './demoCredits.js';
import { DEFAULT_ECONOMY, type EconomyConfig, type Timings } from './coordinator.js';
import { openDb } from './db/index.js';
import { DrizzleSqliteRepository } from './db/repository.js';
import { ensureHousePlayer } from './house.js';
import { Hub } from './hub.js';
import { LimitsService } from './limits.js';
import { instanceId, log } from './log.js';
import { metrics } from './metrics.js';
import { loadRoomConfigs } from './rooms-file.js';
import { RoomManager, isDemoEnv } from './rooms.js';
import { ControlProgramVerifier } from './selfVerify.js';
import { GameControl } from './gameControl.js';

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
ensureHousePlayer(db);

const chain = ensureChain(db);
const chat = new ChatService(db);
// Responsible gambling (F1/F2): one service across all rooms, server-enforced.
const limits = new LimitsService(repo);
// Rooms (C1/C2): tier configs from server config; bots policy enforced at load (C5).
const demo = isDemoEnv();
// Demo practice credits — virtual, no cash value, and refused outright outside
// LANDFALL_ENV=demo. Without this a demo player who lost their float could never
// bet again (see demoCredits.ts).
const practice = demo ? new PracticeCredits(repo, true) : undefined;
const hub = new Hub(db, chat, chain.commitment, limits, practice);
// A season rollover replaces the commitment mid-flight; clients holding the old
// one would read honest rounds as unverifiable (chain.ts).
chain.onRollover((commitment) => {
  hub.rotateChainCommitment(commitment);
  repo.insertSignificantEvent({
    category: 'INTEGRITY',
    component: 'seed_chain',
    actor: 'system',
    reason: 'season seed chain exhausted; next season minted and committed before its first round',
    valueAfter: commitment,
  });
});
// Surge probability overridable for local testing; recorded in /api/round for verification.
const surgeProb = Number(process.env.LANDFALL_SURGE_PROB ?? SURGE_PROB);

const roomConfigs = loadRoomConfigs(demo, timings, surgeProb, econ);
// G32 — disable on demand (all gaming / a room / a player), audit-logged. Built
// BEFORE the rooms because every coordinator consults it on the accept path.
const control = new GameControl(repo);
const rooms = new RoomManager(
  repo,
  chain,
  roomConfigs,
  (roomId) => hub.events(roomId),
  limits,
  control,
);
hub.rooms = rooms;

// Rooms are "ready" once the loop is actually running; an instance whose game
// loop stopped must fail readiness even though the process is still alive.
let roomsRunning = false;
let shuttingDown = false;

// G17 — control-program self-verification: at startup, then every 24 hours,
// plus the on-demand endpoint. The first run establishes the certified baseline.
const verifier = new ControlProgramVerifier(repo);

const app = createApp(db, () => chain.commitment, surgeProb, econ, {
  ready: () =>
    shuttingDown
      ? { ready: false, reason: 'draining' }
      : roomsRunning
        ? { ready: true }
        : { ready: false, reason: 'rooms not started' },
  sampleGauges: () => hub.sampleGauges(),
  verifier,
  control,
  // §2.4.1 operator control is authenticated or it is unavailable — never open.
  opsToken: process.env.LANDFALL_OPS_TOKEN,
});

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  log.info('rest listening', { port: info.port, db: DB_FILE, instance: instanceId() });
  log.info('chain committed', { commitment: chain.commitment });
  log.info('timings configured', { ...timings });
  log.info('rooms configured', {
    env: demo ? 'demo' : 'production-like',
    rooms: roomConfigs.map((r) => ({
      roomId: r.roomId,
      minStakeMinor: r.minStakeMinor,
      maxStakeMinor: r.maxStakeMinor,
      seedCeilingMinor: r.seedMinor,
      liquidityFloorMinor: r.liquidityFloorMinor,
      botsAllowed: r.botsAllowed,
      botCount: r.botCount,
      botBankrollMinor: r.botBankrollMinor,
    })),
  });
  metrics.gauge('landfall_rooms_configured', 'Rooms configured on this instance.', roomConfigs.length);
});

const wss = new WebSocketServer({ server: server as never, path: '/ws' });
hub.attach(wss);
rooms.start();
roomsRunning = true;
verifier.start();
log.info('ws listening', { path: '/ws', port: PORT });

// Practice bots so solo players can see the crowd dynamics. Head-counts come
// from the rooms config per tier; LANDFALL_BOTS overrides every room and
// LANDFALL_BOTS=0 disables bots entirely. Bots exist ONLY in rooms whose config
// allows them, which the rooms loader already refused outside LANDFALL_ENV=demo (C5).
const botsEnv = process.env.LANDFALL_BOTS;
const botOverride = botsEnv === undefined ? null : Number(botsEnv);
if (botOverride !== null && (!Number.isInteger(botOverride) || botOverride < 0)) {
  throw new Error(`LANDFALL_BOTS must be a non-negative integer, got "${botsEnv}"`);
}
const { managers: botManagers, seating: botSeating } = seatBots(
  db,
  rooms.rooms.values(),
  botOverride,
);

if (botManagers.length > 0) {
  log.info('practice bots started', { rooms: botManagers.length, seating: botSeating });
}

/**
 * Graceful shutdown. An orchestrator sends SIGTERM and then waits: we fail
 * readiness FIRST so the load balancer stops sending new players, then stop the
 * bots and the round loop, close sockets, and only then close the database —
 * so no settlement transaction is ever interrupted mid-write.
 */
let shutdownStarted = false;
function shutdown(signal: string): void {
  if (shutdownStarted) return;
  shutdownStarted = true;
  shuttingDown = true;
  log.info('shutting down', { signal });
  for (const manager of botManagers) manager.stop();
  verifier.stop();
  rooms.stop();
  roomsRunning = false;
  wss.close();
  server.close(() => {
    sqlite.close();
    log.info('shutdown complete', { signal });
    process.exit(0);
  });
  // Never hang a deploy on a socket that refuses to close.
  setTimeout(() => {
    log.warn('shutdown forced after timeout', { signal });
    process.exit(0);
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// A crash that reaches here would otherwise vanish into an unformatted stack.
process.on('uncaughtException', (err) => {
  metrics.counter('landfall_uncaught_errors_total', 'Uncaught exceptions.');
  log.error('uncaught exception', { err });
});
process.on('unhandledRejection', (reason) => {
  metrics.counter('landfall_uncaught_errors_total', 'Uncaught exceptions.');
  log.error('unhandled rejection', { err: reason instanceof Error ? reason : String(reason) });
});
