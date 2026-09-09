/**
 * LANDFALL as a Durable Object — the Cloudflare host for the same game the Node
 * server runs.
 *
 * A Durable Object is the right home for a pari-mutuel round: it is a single
 * addressable instance with its own SQLite and its own memory, so the round
 * loop, the live pools and the settlement transaction all share one thread of
 * execution. That is the property the game already depended on when it ran as
 * one Node process, which is why the coordinator, the hub, the rooms and the
 * bots below are imported rather than reimplemented — this file is a host, not
 * a second game (software-architecture.md §4, step 6).
 *
 * IDLE PARKING: the round loop starts when the first player connects and stops
 * when the last one leaves. A pari-mutuel round with nobody in it settles the
 * house against itself forever, and on a metered runtime that is a bill with no
 * player attached. State survives in SQLite either way, so a returning player
 * finds their balance, their room and the season's seed chain intact.
 */
import { DurableObject } from 'cloudflare:workers';
import { DEFAULT_TIMINGS, SURGE_PROB, validateRakeConfig } from '@landfall/core';
import {
  ChatService,
  DEFAULT_ECONOMY,
  Hub,
  LimitsService,
  RoomManager,
  createApp,
  DrizzleSqliteRepository,
  ensureChain,
  ensureHousePlayer,
  isDemoEnv,
  log,
  resolveRoomConfigs,
  seatBots,
  type BotManager,
  type Db,
  type EconomyConfig,
  type HubConnection,
} from '@landfall/server';
import roomsJson from '@landfall/server/config/rooms.json';
import { durableTransactionHost, openDurableDb } from './db.js';
import type { Env } from './env.js';

/** Everything the game needs, built once per Durable Object lifetime. */
interface Booted {
  db: Db;
  hub: Hub;
  rooms: RoomManager;
  app: ReturnType<typeof createApp>;
}

export class LandfallGame extends DurableObject<Env> {
  private booted: Booted | null = null;
  private botManagers: BotManager[] = [];
  /** True while the round loop is running — see IDLE PARKING above. */
  private running = false;
  private connections = 0;

  /**
   * Build the game. Split from the constructor because a Durable Object is
   * constructed for any request at all, including a health check, and the
   * bootstrap should happen once and be reused.
   */
  private boot(): Booted {
    if (this.booted) return this.booted;

    const storage = this.ctx.storage;
    const db = openDurableDb(storage);
    const repo = new DrizzleSqliteRepository(db, durableTransactionHost(storage));

    ensureHousePlayer(db);

    const econ = this.economy();
    validateRakeConfig(econ.rake, econ.rakeSplit);
    const surgeProb = numberFrom(this.env.LANDFALL_SURGE_PROB, SURGE_PROB);

    const chain = ensureChain(db);
    const chat = new ChatService(db);
    const limits = new LimitsService(repo);
    const hub = new Hub(db, chat, chain.commitment, limits);

    // C5 lives in `resolveRoomConfigs`: a room asking for bots outside
    // LANDFALL_ENV=demo throws here, and the Durable Object fails to boot —
    // exactly the startup crash the Node host produces.
    const demo = isDemoEnv(this.env.LANDFALL_ENV);
    const configs = resolveRoomConfigs(roomsJson, demo, DEFAULT_TIMINGS, surgeProb, econ);
    const rooms = new RoomManager(repo, chain, configs, (roomId) => hub.events(roomId), limits);
    hub.rooms = rooms;

    const app = createApp(db, chain.commitment, surgeProb, econ, {
      // On this host readiness is not "has the loop started": the object boots
      // on demand and parks itself when empty, so an idle game is healthy. The
      // database check inside createApp is the real signal.
      ready: () => ({ ready: true }),
      sampleGauges: () => hub.sampleGauges(),
    });

    log.info('landfall durable object booted', {
      env: demo ? 'demo' : 'production-like',
      rooms: configs.map((r) => r.roomId),
      commitment: chain.commitment,
    });

    this.booted = { db, hub, rooms, app };
    return this.booted;
  }

  /** Economy overrides (A1), same variable names the Node host reads. */
  private economy(): EconomyConfig {
    const econ: EconomyConfig = { ...DEFAULT_ECONOMY };
    econ.rake = numberFrom(this.env.LANDFALL_RAKE, econ.rake);
    if (this.env.LANDFALL_RAKE_SPLIT) {
      const [house, surge, stormReserve] = this.env.LANDFALL_RAKE_SPLIT.split(',').map(Number);
      econ.rakeSplit = { house: house!, surge: surge!, stormReserve: stormReserve! };
    }
    econ.maxPayoutMultiple = numberFrom(
      this.env.LANDFALL_MAX_PAYOUT_MULTIPLE,
      econ.maxPayoutMultiple,
    );
    econ.surgeFlatEveryN = numberFrom(this.env.LANDFALL_SURGE_FLAT_EVERY, econ.surgeFlatEveryN);
    return econ;
  }

  /** Start the round loop and seat the practice bots (idempotent). */
  private startRooms(): void {
    if (this.running) return;
    const { db, rooms } = this.boot();
    rooms.start();
    this.running = true;

    const override = this.env.LANDFALL_BOTS === undefined ? null : Number(this.env.LANDFALL_BOTS);
    if (override !== null && (!Number.isInteger(override) || override < 0)) {
      throw new Error(`LANDFALL_BOTS must be a non-negative integer, got "${this.env.LANDFALL_BOTS}"`);
    }
    const { managers, seating } = seatBots(db, rooms.rooms.values(), override);
    this.botManagers = managers;
    if (managers.length > 0) log.info('practice bots started', { seating });
  }

  /** Park the game once the last player has gone. */
  private stopRooms(): void {
    if (!this.running) return;
    for (const manager of this.botManagers) manager.stop();
    this.botManagers = [];
    this.booted?.rooms.stop();
    this.running = false;
    log.info('rooms parked — no players connected');
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') return this.handleWebSocket(request);
    return this.boot().app.fetch(request);
  }

  private handleWebSocket(request: Request): Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    // The loop must be running before the session says WELCOME, because the
    // welcome payload carries the live round header.
    this.startRooms();
    const { hub } = this.boot();

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    // `accept()`, not hibernation: the round loop is a live in-memory state
    // machine driven by timers, so the object has to stay resident while anyone
    // is playing. Hibernation would evict it between frames and strand the round.
    server.accept();
    this.connections += 1;

    const connection: HubConnection = hub.connect({
      send: (data) => {
        try {
          server.send(data);
        } catch {
          // A socket that died between the readyState check and the send is a
          // disconnect, not a game error; the close handler does the cleanup.
        }
      },
      get open() {
        return server.readyState === WebSocket.READY_STATE_OPEN;
      },
    });

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      connection.close();
      this.connections -= 1;
      if (this.connections <= 0) this.stopRooms();
    };

    server.addEventListener('message', (event: MessageEvent) => {
      // The protocol is JSON text. A binary frame is not a valid client message,
      // and decoding one as text would only produce a confusing schema error.
      if (typeof event.data !== 'string') {
        server.send(
          JSON.stringify({ type: 'ERROR', code: 'BAD_FRAME', message: 'Text frames only.' }),
        );
        return;
      }
      connection.message(event.data);
    });
    server.addEventListener('close', release);
    server.addEventListener('error', release);

    return new Response(null, { status: 101, webSocket: client });
  }
}

/** Numeric env override, ignoring blanks and anything unparseable. */
function numberFrom(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
