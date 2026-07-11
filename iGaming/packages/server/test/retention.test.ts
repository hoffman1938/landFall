/**
 * Phase R5 retention tests (E1/E2) — Skipper Records update inside settlement,
 * persist across coordinator restarts (reconnect survival), and the replay
 * carries fog movement + flag honesty. Real coordinators, in-memory SQLite,
 * fake timers, same harness as rooms.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { chainCommitment, roundSeed, type WreckWakeReplay } from '@landfall/core';
import { openDb, type Db, type Sqlite } from '../src/db/index.js';
import { players, rounds } from '../src/db/schema.js';
import {
  DEFAULT_ROOM,
  RoundCoordinator,
  flagHonest,
  type RoomConfig,
  type Timings,
} from '../src/coordinator.js';
import { DrizzleSqliteRepository } from '../src/db/repository.js';

const TERMINAL = 'a'.repeat(64);
const TIMINGS: Timings = { anchorMs: 10_000, stormMs: 1_000, resolvedMs: 500, cooldownMs: 500 };

function fakeChain() {
  let index = 0;
  return {
    commitment: chainCommitment(TERMINAL, 1000),
    length: 1000,
    consume() {
      index += 1;
      return {
        chainIndex: index,
        seedHex: roundSeed(TERMINAL, 1000, index),
        prevChainValue:
          index === 1 ? chainCommitment(TERMINAL, 1000) : roundSeed(TERMINAL, 1000, index - 1),
      };
    },
  };
}

const noopEvents = {
  broadcast() {},
  sendToPlayer() {},
  broadcastLandfall() {},
  systemMessage() {},
};

function room(overrides: Partial<RoomConfig>): RoomConfig {
  return { ...DEFAULT_ROOM, timings: TIMINGS, ...overrides };
}

const settleRound = () => TIMINGS.anchorMs + TIMINGS.stormMs + 50;
const fullRound = () =>
  TIMINGS.anchorMs + TIMINGS.stormMs + TIMINGS.resolvedMs + TIMINGS.cooldownMs + 50;

describe('skipper records (E1)', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
  });

  afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
  });

  function addPlayer(name: string, balance = 1_000_000): string {
    const id = randomUUID();
    db.insert(players)
      .values({ id, name, balanceMinor: balance, isHouse: false, createdAt: Date.now() })
      .run();
    return id;
  }

  function struckZoneOf(roundId: number): number {
    const row = db.select().from(rounds).all().find((r) => r.id === roundId);
    expect(row?.struckZone).not.toBeNull();
    return row!.struckZone!;
  }

  it('updates streak, rounds sailed and biggest salvage inside settlement', () => {
    const c = new RoundCoordinator(repo, fakeChain(), noopEvents, room({ roomId: 'e1' }));
    const pa = addPlayer('Alice');
    const pb = addPlayer('Bob');
    c.start();
    const roundId = c.roundId;
    expect(c.fleetOrder(pa, 'Alice', 'FOCUS', 0, null, 10_00).ok).toBe(true);
    expect(c.fleetOrder(pb, 'Bob', 'FOCUS', 1, null, 10_00).ok).toBe(true);
    vi.advanceTimersByTime(settleRound());
    const struck = struckZoneOf(roundId);

    for (const [pid, zone] of [
      [pa, 0],
      [pb, 1],
    ] as const) {
      const rec = repo.getSkipperRecord(pid)!;
      expect(rec.roundsSailed).toBe(1);
      if (zone === struck) {
        // Wrecked: streak stays 0, no salvage recorded.
        expect(rec.currentStreak).toBe(0);
        expect(rec.biggestSalvageMinor).toBe(0);
      } else {
        // Survived: streak 1, positive salvage (house seeds guarantee a wreck pool).
        expect(rec.currentStreak).toBe(1);
        expect(rec.bestStreak).toBe(1);
        expect(rec.biggestSalvageMinor).toBeGreaterThan(0);
      }
    }
    c.stop();
  });

  it('counts a bluff when the flag contradicts the fleet at lock, not when honest', () => {
    const c = new RoundCoordinator(repo, fakeChain(), noopEvents, room({ roomId: 'e1b' }));
    const bluffer = addPlayer('Bluffer');
    const honest = addPlayer('Honest');
    c.start();
    expect(c.fleetOrder(bluffer, 'Bluffer', 'FOCUS', 0, null, 10_00).ok).toBe(true);
    expect(c.fleetOrder(honest, 'Honest', 'FOCUS', 2, null, 10_00).ok).toBe(true);
    // Bluffer rallies a cove they never sail to; Honest rallies their own cove.
    expect(c.signal(bluffer, 'Bluffer', 3, 'RALLY').ok).toBe(true);
    expect(c.signal(honest, 'Honest', 2, 'RALLY').ok).toBe(true);
    vi.advanceTimersByTime(settleRound());

    expect(repo.getSkipperRecord(bluffer)!.bluffsCalled).toBe(1);
    expect(repo.getSkipperRecord(honest)!.bluffsCalled).toBe(0);
    c.stop();
  });

  it('flagHonest: FLEE is honest only away from the fleet, RALLY/HOLD only on it', () => {
    expect(flagHonest('RALLY', 2, new Set([2]))).toBe(true);
    expect(flagHonest('RALLY', 2, new Set([1]))).toBe(false);
    expect(flagHonest('HOLD', 4, new Set([4, 1]))).toBe(true);
    expect(flagHonest('FLEE', 3, new Set([3]))).toBe(false);
    expect(flagHonest('FLEE', 3, new Set([0]))).toBe(true);
    expect(flagHonest('RALLY', 5, new Set())).toBe(false); // fleetless rally = bluff
  });

  it('records a Golden Anchor win (split fleet always leaves a survivor)', () => {
    const c = new RoundCoordinator(
      repo,
      fakeChain(),
      noopEvents,
      room({ roomId: 'e1c', surgeProb: 1 }),
    );
    const p = addPlayer('Lucky');
    c.start();
    expect(c.fleetOrder(p, 'Lucky', 'SPLIT', 0, 3, 10_00).ok).toBe(true);
    vi.advanceTimersByTime(settleRound());
    expect(repo.getSkipperRecord(p)!.surgeWins).toBe(1);
    c.stop();
  });

  it('streak resets on a wreck and the record survives a coordinator restart', () => {
    const chain = fakeChain();
    let c = new RoundCoordinator(repo, chain, noopEvents, room({ roomId: 'e1d' }));
    const p = addPlayer('Sailor');
    c.start();

    // Sail rounds until the storm hits the player's cove once.
    let wreckedAt: number | null = null;
    for (let i = 0; i < 12 && wreckedAt === null; i++) {
      const roundId = c.roundId;
      expect(c.fleetOrder(p, 'Sailor', 'FOCUS', 0, null, 10_00).ok).toBe(true);
      vi.advanceTimersByTime(settleRound());
      if (struckZoneOf(roundId) === 0) wreckedAt = i;
      vi.advanceTimersByTime(fullRound() - settleRound());
    }
    expect(wreckedAt).not.toBeNull(); // P(no hit in 12) ≈ 11%; deterministic seed avoids flake
    const rec = repo.getSkipperRecord(p)!;
    expect(rec.currentStreak).toBe(0); // loop exits right after the wreck
    expect(rec.bestStreak).toBe(wreckedAt!);
    c.stop();

    // "Survives reconnects": a fresh coordinator + repo view reads the same row.
    c = new RoundCoordinator(repo, chain, noopEvents, room({ roomId: 'e1d' }));
    expect(repo.getSkipperRecord(p)).toEqual(rec);
    c.stop();
  });
});

describe('wreck wake replay v2 (E2)', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
  });

  afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
  });

  it('carries fog net movement, biggest salvage and flag honesty from public data', () => {
    let replay: WreckWakeReplay | null = null;
    const events = {
      ...noopEvents,
      broadcastLandfall(build: (playerId: string) => unknown) {
        replay = (build('nobody') as { replay: WreckWakeReplay }).replay;
      },
    };
    const c = new RoundCoordinator(repo, fakeChain(), events, room({ roomId: 'e2' }));
    const pa = (() => {
      const id = randomUUID();
      db.insert(players)
        .values({ id, name: 'Mover', balanceMinor: 1_000_000, isHouse: false, createdAt: Date.now() })
        .run();
      return id;
    })();
    c.start();
    expect(c.fleetOrder(pa, 'Mover', 'FOCUS', 1, null, 10_00).ok).toBe(true);
    expect(c.signal(pa, 'Mover', 4, 'RALLY').ok).toBe(true); // never sails to 4 → bluff

    // Move INSIDE the fog: cove 1 → cove 2 (this is the one hidden final order).
    vi.advanceTimersByTime(TIMINGS.anchorMs - 1_000); // Blind Fog is the last 3s
    expect(c.fleetOrder(pa, 'Mover', 'FOCUS', 2, null, 10_00).ok).toBe(true);
    vi.advanceTimersByTime(1_000 + TIMINGS.stormMs + 50);

    expect(replay).not.toBeNull();
    const r = replay! as WreckWakeReplay;
    expect(r.fogNetBoats).toBeDefined();
    expect(r.fogNetBoats![1]).toBe(-1); // left cove 1 in the fog
    expect(r.fogNetBoats![2]).toBe(1); // arrived at cove 2
    expect(r.flagReveals).toEqual([{ name: 'Mover', zone: 4, kind: 'RALLY', honest: false }]);
    // Biggest salvage: present iff the mover survived (public exact data).
    const struck = db.select().from(rounds).all()[0]!.struckZone!;
    if (struck !== 2) {
      expect(r.biggestSalvage?.name).toBe('Mover');
      expect(r.biggestSalvage!.amountMinor).toBeGreaterThan(0);
    }
    c.stop();
  });
});
