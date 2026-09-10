/** Real SQLite/coordinator/hub regression coverage for idle parking and reconnects. */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chainCommitment, roundSeed, type ServerMessage } from '@landfall/core';
import { openDb, type Db, type Sqlite } from '../src/db/index.js';
import { players, rounds, stakes } from '../src/db/schema.js';
import { DrizzleSqliteRepository } from '../src/db/repository.js';
import { DEFAULT_ROOM, type Timings } from '../src/coordinator.js';
import { RoomManager } from '../src/rooms.js';
import { Hub, type HubConnection } from '../src/hub.js';
import { ChatService } from '../src/chat.js';
import { LimitsService } from '../src/limits.js';

const TERMINAL = 'b'.repeat(64);
const TIMINGS: Timings = { anchorMs: 10_000, stormMs: 1_000, resolvedMs: 500, cooldownMs: 500 };
const FULL_ROUND_MS = Object.values(TIMINGS).reduce((sum, ms) => sum + ms, 0);

function fakeChain() {
  let index = 0;
  return {
    commitment: chainCommitment(TERMINAL, 100),
    length: 100,
    consume() {
      index += 1;
      return {
        chainIndex: index,
        seedHex: roundSeed(TERMINAL, 100, index),
        prevChainValue:
          index === 1 ? chainCommitment(TERMINAL, 100) : roundSeed(TERMINAL, 100, index - 1),
      };
    },
  };
}

interface Client {
  connection: HubConnection;
  messages: ServerMessage[];
  send(message: unknown): void;
}

function latestWelcome(client: Client) {
  const message = [...client.messages].reverse().find((m) => m.type === 'WELCOME');
  if (!message || message.type !== 'WELCOME') throw new Error('Expected WELCOME');
  return message;
}

describe('idle parking and room routing', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;
  let rooms: RoomManager;
  let hub: Hub;
  let clients: Client[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
    db.insert(players)
      .values({
        id: randomUUID(),
        name: 'HOUSE',
        isHouse: true,
        balanceMinor: 100_000_000,
        createdAt: Date.now(),
      })
      .run();
    const chain = fakeChain();
    const limits = new LimitsService(repo);
    hub = new Hub(db, new ChatService(db), chain.commitment, limits);
    rooms = new RoomManager(
      repo,
      chain,
      ['a', 'b'].map((roomId) => ({
        ...DEFAULT_ROOM,
        roomId,
        name: roomId,
        timings: TIMINGS,
        surgeProb: 0,
      })),
      (id) => hub.events(id),
      limits,
    );
    hub.rooms = rooms;
    clients = [];
    rooms.start();
  });

  afterEach(() => {
    for (const client of clients) client.connection.close();
    rooms.stop();
    vi.clearAllTimers();
    sqlite.close();
    vi.useRealTimers();
  });

  function connect(playerId?: string): Client {
    const messages: ServerMessage[] = [];
    const connection = hub.connect({
      open: true,
      send: (json) => messages.push(JSON.parse(json) as ServerMessage),
    });
    const client = {
      connection,
      messages,
      send: (message: unknown) => connection.message(JSON.stringify(message)),
    };
    clients.push(client);
    client.send({ type: 'HELLO', ...(playerId ? { playerId } : {}) });
    return client;
  }

  function place(client: Client, zone = 1) {
    client.send({ type: 'FLEET_ORDER', mode: 'FOCUS', primaryZone: zone, stakeMinor: 500 });
    expect(client.messages.some((m) => m.type === 'ANCHOR_ACK')).toBe(true);
  }

  it.each(['ANCHOR_OPEN', 'LOCKED_STORM'] as const)(
    'settles accepted stakes exactly once when parked in %s',
    (atPhase) => {
      const client = connect();
      const welcome = latestWelcome(client);
      const current = rooms.get(welcome.roomId)!;
      const roundId = current.roundId;
      place(client);
      if (atPhase === 'LOCKED_STORM') vi.advanceTimersByTime(TIMINGS.anchorMs);
      expect(current.phase).toBe(atPhase);
      client.connection.close();
      expect(hub.pruneClosedSessions()).toBe(0);
      rooms.park();
      vi.advanceTimersByTime(FULL_ROUND_MS + 60_000);
      expect(current.roundId).toBe(roundId);
      expect(db.select().from(rounds).all()).toHaveLength(2);
      const settled = db
        .select()
        .from(rounds)
        .all()
        .find((r) => r.id === roundId)!;
      expect(settled.settledAt).not.toBeNull();
      const paid = db
        .select()
        .from(stakes)
        .all()
        .filter((s) => s.playerId === welcome.playerId);
      expect(paid).toHaveLength(1);
      expect(paid[0]!.payoutMinor).not.toBeNull();
      const expectedBalance = welcome.balanceMinor - 500 + paid[0]!.payoutMinor!;
      expect(repo.getPlayer(welcome.playerId)!.balanceMinor).toBe(expectedBalance);
      rooms.start();
      const returning = connect(welcome.playerId);
      expect(latestWelcome(returning).balanceMinor).toBe(expectedBalance);
      expect(latestWelcome(returning).yourFleet).toBeNull();
      expect(current.roundId).not.toBe(roundId);
    },
  );

  it('resumes a parked but unfinished round without replacing its accepted fleet', () => {
    const client = connect();
    const welcome = latestWelcome(client);
    const current = rooms.get(welcome.roomId)!;
    const roundId = current.roundId;
    place(client);
    client.connection.close();
    rooms.park();
    vi.advanceTimersByTime(2_000);
    rooms.start();
    rooms.start(); // another new socket cannot consume another seed or round
    const returning = connect(welcome.playerId);
    expect(current.roundId).toBe(roundId);
    expect(latestWelcome(returning).yourFleet?.stakeMinor).toBe(500);
    expect(latestWelcome(returning).balanceMinor).toBe(welcome.balanceMinor - 500);
    vi.advanceTimersByTime(FULL_ROUND_MS - 2_000);
    expect(current.roundId).not.toBe(roundId);
    expect(db.select().from(rounds).all()).toHaveLength(4);
    expect(returning.messages.filter((m) => m.type === 'LANDFALL')).toHaveLength(1);
  });

  it.each(['RESOLVED', 'COOLDOWN'] as const)(
    'parks immediately after settlement in %s and opens one fresh round on return',
    (atPhase) => {
      vi.advanceTimersByTime(
        TIMINGS.anchorMs + TIMINGS.stormMs + (atPhase === 'COOLDOWN' ? TIMINGS.resolvedMs : 0),
      );
      expect(rooms.get('a')!.phase).toBe(atPhase);
      rooms.park();
      vi.advanceTimersByTime(60_000);
      expect(db.select().from(rounds).all()).toHaveLength(2);
      rooms.start();
      rooms.start();
      expect(db.select().from(rounds).all()).toHaveLength(4);
      expect(rooms.get('a')!.phase).toBe('ANCHOR_OPEN');
    },
  );

  it('restores a spent fog order on reconnect and rejects a second change', () => {
    const client = connect();
    const welcome = latestWelcome(client);
    const current = rooms.get(welcome.roomId)!;
    place(client);
    vi.advanceTimersByTime(TIMINGS.anchorMs - 1_000);
    place(client, 2);
    expect(current.finalOrderUsed(welcome.playerId)).toBe(true);
    client.connection.close();
    rooms.park();
    rooms.start();
    const returning = connect(welcome.playerId);
    expect(latestWelcome(returning).finalOrderUsed).toBe(true);
    expect(latestWelcome(returning).yourFleet?.primaryZone).toBe(2);
    returning.send({ type: 'FLEET_ORDER', mode: 'FOCUS', primaryZone: 3, stakeMinor: 500 });
    expect(returning.messages.at(-1)).toMatchObject({ type: 'ERROR', code: 'FINAL_ORDER_USED' });
    expect(current.yourFleet(welcome.playerId)?.primaryZone).toBe(2);
  });

  it.each(['locked', 'fog-used'] as const)(
    'keeps the player subscribed to their result when a %s bet cannot be cancelled for a switch',
    (state) => {
      const client = connect();
      const welcome = latestWelcome(client);
      const current = rooms.get(welcome.roomId)!;
      const roundId = current.roundId;
      place(client);
      if (state === 'locked') vi.advanceTimersByTime(TIMINGS.anchorMs);
      else {
        vi.advanceTimersByTime(TIMINGS.anchorMs - 1_000);
        place(client, 2);
      }
      const before = repo.getPlayer(welcome.playerId)!.balanceMinor;
      client.send({ type: 'JOIN_ROOM', roomId: 'b' });
      expect(client.messages.at(-1)).toMatchObject({ type: 'ERROR', code: 'ROOM_SWITCH_PENDING' });
      expect(latestWelcome(client).roomId).toBe(welcome.roomId);
      expect(repo.getPlayer(welcome.playerId)!.lastRoomId).toBe(welcome.roomId);
      expect(repo.getPlayer(welcome.playerId)!.balanceMinor).toBe(before);
      expect(current.yourFleet(welcome.playerId)).not.toBeNull();
      vi.advanceTimersByTime(2_000);
      expect(client.messages.filter((m) => m.type === 'LANDFALL')).toEqual([
        expect.objectContaining({ type: 'LANDFALL', roundId }),
      ]);
    },
  );

  it('rejects a too-fast refund without leaving the room, then refunds once before switching', () => {
    const client = connect();
    const welcome = latestWelcome(client);
    const current = rooms.get(welcome.roomId)!;
    place(client);
    client.send({ type: 'JOIN_ROOM', roomId: 'b' });
    expect(client.messages.at(-1)).toMatchObject({ type: 'ERROR', code: 'ROOM_SWITCH_PENDING' });
    expect(current.yourFleet(welcome.playerId)?.stakeMinor).toBe(500);
    vi.advanceTimersByTime(1_000);
    client.send({ type: 'JOIN_ROOM', roomId: 'b' });
    expect(latestWelcome(client).roomId).toBe('b');
    expect(latestWelcome(client).balanceMinor).toBe(welcome.balanceMinor);
    expect(current.yourFleet(welcome.playerId)).toBeNull();
    client.send({ type: 'JOIN_ROOM', roomId: 'b' });
    expect(repo.getPlayer(welcome.playerId)!.balanceMinor).toBe(welcome.balanceMinor);
  });

  it('allows a table switch after settlement without refunding the settled stake again', () => {
    const client = connect();
    const welcome = latestWelcome(client);
    place(client);
    vi.advanceTimersByTime(TIMINGS.anchorMs + TIMINGS.stormMs);
    const balance = repo.getPlayer(welcome.playerId)!.balanceMinor;
    client.send({ type: 'JOIN_ROOM', roomId: 'b' });
    expect(latestWelcome(client).roomId).toBe('b');
    expect(latestWelcome(client).balanceMinor).toBe(balance);
  });
});
