/**
 * DISABLE ON DEMAND, end to end (gap G32; GLI-19 §2.4.1, §4.15.1, §A.6.3).
 *
 * `GameControl` has existed for a while and so has `/api/compliance/game-state`.
 * What did not exist was any call to `betsAllowed()` — the method was reachable
 * from nowhere in the codebase. So "disable all gaming activity" wrote an audit
 * entry, reported DISABLED to anyone who asked, and then went on accepting bets.
 *
 * That is a worse failure than an absent control, because the compliance surface
 * is the thing an inspector trusts. These tests exercise the gate through the
 * coordinator's real accept path, which is the only place it can be proved.
 *
 * §4.15.1's other half matters just as much and is tested here too: a disable
 * must let a game already in progress CONCLUDE. Stopping a locked round would
 * strand every bet in it and turn a routine operational action into the
 * interrupted-game incident §4.16 exists to handle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { chainCommitment, roundSeed } from '@landfall/core';
import { openDb, type Db, type Sqlite } from '../src/db/index.js';
import { players, rounds, significantEvents, stakes } from '../src/db/schema.js';
import { GameControl } from '../src/gameControl.js';
import { DEFAULT_ROOM, RoundCoordinator, type RoomConfig, type Timings } from '../src/coordinator.js';
import { DrizzleSqliteRepository } from '../src/db/repository.js';

const TERMINAL = 'c'.repeat(64);
/**
 * A long anchor window: these tests place several orders in one round, and the
 * coordinator's 150 ms re-anchor guard means each one has to be separated in
 * time. `REANCHOR_MS` below is that separation.
 */
const TIMINGS: Timings = { anchorMs: 5_000, stormMs: 500, resolvedMs: 200, cooldownMs: 200 };
/** Past ANCHOR_MIN_INTERVAL_MS, so the next order is not refused as TOO_FAST. */
const REANCHOR_MS = 200;

function fakeChain() {
  let index = 0;
  return {
    commitment: chainCommitment(TERMINAL, 1000),
    length: 1000,
    onRollover() {},
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

const cfg: RoomConfig = {
  ...DEFAULT_ROOM,
  roomId: 'control',
  name: 'Control',
  timings: TIMINGS,
  seedMinor: 25_00,
  liquidityFloorMinor: 90_00,
  minSeedMinor: 1_00,
  minStakeMinor: 1_00,
  maxStakeMinor: 500_00,
};

describe('disable on demand (G32)', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;
  let control: GameControl;
  let coordinator: RoundCoordinator;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
    db.insert(players)
      .values({
        id: randomUUID(),
        name: 'HOUSE',
        balanceMinor: 10_000_000_00,
        isHouse: true,
        createdAt: Date.now(),
      })
      .run();
    control = new GameControl(repo);
    coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, cfg, undefined, control);
  });

  afterEach(() => {
    coordinator.stop();
    sqlite.close();
    vi.useRealTimers();
  });

  function addPlayer(name: string, balance = 10_000_00): string {
    const id = randomUUID();
    db.insert(players)
      .values({ id, name, balanceMinor: balance, isHouse: false, createdAt: Date.now() })
      .run();
    return id;
  }

  const balanceOf = (id: string): number =>
    db.select().from(players).where(eq(players.id, id)).get()!.balanceMinor;

  it('refuses new bets while all gaming is disabled — the finding this closes', () => {
    coordinator.start();
    const playerId = addPlayer('Ada');

    const before = coordinator.anchor(playerId, 'Ada', 0, 10_00);
    expect(before.ok).toBe(true);
    vi.advanceTimersByTime(REANCHOR_MS);
    expect(coordinator.cancelOrder(playerId).ok).toBe(true);

    control.disable('ALL', 'regulator instruction', 'inspector-1');

    vi.advanceTimersByTime(REANCHOR_MS);
    const after = coordinator.anchor(playerId, 'Ada', 0, 10_00);
    expect(after.ok).toBe(false);
    if (after.ok) throw new Error('unreachable');
    expect(after.code).toBe('GAMING_DISABLED');
    // No money moved, and the refusal is receipted like any other (B1).
    expect(balanceOf(playerId)).toBe(10_000_00);
    expect(after.receipt).toBeDefined();
  });

  it('scopes a disable to one room, and to one player', () => {
    coordinator.start();
    const ada = addPlayer('Ada');
    const bo = addPlayer('Bo');

    // A disable on a DIFFERENT room does not touch this one.
    control.disable('ROOM', 'maintenance', 'ops', 'somewhere-else');
    expect(coordinator.anchor(ada, 'Ada', 0, 10_00).ok).toBe(true);
    vi.advanceTimersByTime(REANCHOR_MS);
    expect(coordinator.cancelOrder(ada).ok).toBe(true);

    control.disable('ROOM', 'maintenance', 'ops', cfg.roomId);
    vi.advanceTimersByTime(REANCHOR_MS);
    expect(coordinator.anchor(ada, 'Ada', 0, 10_00).ok).toBe(false);
    control.enable('ROOM', 'ops', cfg.roomId);

    // A per-player block stops that player and nobody else.
    control.disable('PLAYER', 'operator account block', 'ops', bo);
    vi.advanceTimersByTime(REANCHOR_MS);
    expect(coordinator.anchor(ada, 'Ada', 0, 10_00).ok).toBe(true);
    expect(coordinator.anchor(bo, 'Bo', 1, 10_00).ok).toBe(false);
  });

  it('signals are refused too — a paused table is paused for everything', () => {
    coordinator.start();
    const playerId = addPlayer('Cy');
    coordinator.anchor(playerId, 'Cy', 3, 10_00);
    control.disable('ALL', 'incident', 'ops');
    const r = coordinator.signal(playerId, 'Cy', 3, 'RALLY');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('GAMING_DISABLED');
  });

  /**
   * §4.15.1 — "all players playing that game shall be permitted to conclude
   * their current game in play". A disable landing after lock must not strand
   * the bets it finds there.
   */
  it('lets a round already locked settle normally', () => {
    coordinator.start();
    const playerId = addPlayer('Di');
    expect(coordinator.anchor(playerId, 'Di', 2, 10_00).ok).toBe(true);

    // Past the lock, with the bet accepted and the storm on its way.
    vi.advanceTimersByTime(TIMINGS.anchorMs + 20);
    control.disable('ALL', 'disabled mid-round', 'ops');
    vi.advanceTimersByTime(TIMINGS.stormMs + TIMINGS.resolvedMs + TIMINGS.cooldownMs + 40);

    const round = db.select().from(rounds).where(eq(rounds.id, 1)).get()!;
    expect(round.settledAt).not.toBeNull();
    expect(round.voidedAt).toBeNull();
    const settled = db.select().from(stakes).where(eq(stakes.roundId, 1)).all();
    expect(settled.every((s) => s.outcome !== null)).toBe(true);
  });

  it('cancelling a bet still works while disabled — refunds are player protection', () => {
    coordinator.start();
    const playerId = addPlayer('Eve');
    coordinator.anchor(playerId, 'Eve', 4, 10_00);
    expect(balanceOf(playerId)).toBe(10_000_00 - 10_00);

    control.disable('ALL', 'incident', 'ops');
    vi.advanceTimersByTime(REANCHOR_MS);
    const cancelled = coordinator.cancelOrder(playerId);
    expect(cancelled.ok).toBe(true);
    expect(balanceOf(playerId)).toBe(10_000_00);
  });

  it('re-enabling restores play, and both transitions are audit-logged (§A.6.3)', () => {
    coordinator.start();
    const playerId = addPlayer('Fay');
    control.disable('ALL', 'scheduled maintenance window', 'ops-oncall');
    expect(coordinator.anchor(playerId, 'Fay', 0, 10_00).ok).toBe(false);
    control.enable('ALL', 'ops-oncall');
    vi.advanceTimersByTime(REANCHOR_MS);
    expect(coordinator.anchor(playerId, 'Fay', 0, 10_00).ok).toBe(true);

    const events = db
      .select()
      .from(significantEvents)
      .all()
      .filter((e) => e.category === 'GAME_STATE');
    expect(events).toHaveLength(2);
    // Date, time and reason, with the value before and after (§2.9.5).
    expect(events[0]!.reason).toBe('scheduled maintenance window');
    expect(events[0]!.actor).toBe('ops-oncall');
    expect(events[0]!.valueBefore).toBe('ENABLED');
    expect(events[0]!.valueAfter).toBe('DISABLED');
    expect(events[0]!.createdAt).toBeGreaterThan(0);
    expect(events[1]!.valueAfter).toBe('ENABLED');
    expect(control.state().all).toBeNull();
  });

  it('a coordinator with no gate configured behaves exactly as before', () => {
    const ungated = new RoundCoordinator(repo, fakeChain(), noopEvents, {
      ...cfg,
      roomId: 'ungated',
    });
    ungated.start();
    const playerId = addPlayer('Gus');
    control.disable('ALL', 'irrelevant — this room has no gate', 'ops');
    expect(ungated.anchor(playerId, 'Gus', 0, 10_00).ok).toBe(true);
    ungated.stop();
  });
});
