/**
 * Phase R5 responsible-gambling tests (F1/F2) — self-set limits are
 * SERVER-enforced on the coordinator accept path, loosening waits 24h,
 * self-exclusion only extends, and the day-loss ledger is written inside
 * the settlement transaction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LIMIT_RAISE_COOLDOWN_MS, chainCommitment, roundSeed } from '@landfall/core';
import { openDb, type Db, type Sqlite } from '../src/db/index.js';
import { players } from '../src/db/schema.js';
import {
  DEFAULT_ROOM,
  RoundCoordinator,
  type RoomConfig,
  type Timings,
} from '../src/coordinator.js';
import { DrizzleSqliteRepository } from '../src/db/repository.js';
import { LimitsService, utcDayKey } from '../src/limits.js';

const TERMINAL = 'b'.repeat(64);
const TIMINGS: Timings = { anchorMs: 10_000, stormMs: 1_000, resolvedMs: 500, cooldownMs: 500 };

function fakeChain() {
  let index = 0;
  return {
    commitment: chainCommitment(TERMINAL, 1000),
    length: 1000,
    onRollover() {
      /* test double: seasons never roll over inside a unit test */
    },
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

describe('player limits (F1) + self-exclusion (F2)', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;
  let limits: LimitsService;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
    limits = new LimitsService(repo);
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

  it('rejects anchors above the self-set stake cap with a typed error + receipt', () => {
    const c = new RoundCoordinator(repo, fakeChain(), noopEvents, room({ roomId: 'f1' }), limits);
    const p = addPlayer('Careful');
    limits.setLimits(p, { stakePerRoundCapMinor: 10_00 });
    c.start();

    const over = c.fleetOrder(p, 'Careful', 'FOCUS', 0, null, 20_00);
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.code).toBe('LIMIT_STAKE');
      expect(over.receipt?.verdict).toBe('REJECTED');
      expect(over.message).not.toMatch(/problem|gambl|violat/i); // supportive, never shaming
    }
    vi.advanceTimersByTime(200);
    expect(c.fleetOrder(p, 'Careful', 'FOCUS', 0, null, 10_00).ok).toBe(true);
    c.stop();
  });

  it('enforces the daily loss limit: committed stake counts against headroom', () => {
    const c = new RoundCoordinator(repo, fakeChain(), noopEvents, room({ roomId: 'f2' }), limits);
    const p = addPlayer('Daily');
    limits.setLimits(p, { dailyLossLimitMinor: 50_00 });
    repo.addDayLoss(p, utcDayKey(), 45_00); // already 45.00 down today
    c.start();

    const over = c.fleetOrder(p, 'Daily', 'FOCUS', 0, null, 10_00);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe('LIMIT_LOSS');
    expect(c.fleetOrder(p, 'Daily', 'FOCUS', 0, null, 5_00).ok).toBe(true);
    c.stop();
  });

  it('enforces the session loss limit from live session accounting', () => {
    const c = new RoundCoordinator(repo, fakeChain(), noopEvents, room({ roomId: 'f3' }), limits);
    const p = addPlayer('Session');
    limits.setLimits(p, { sessionLossLimitMinor: 50_00 });
    limits.beginSession(p);
    limits.noteSessionNet(p, -45_00); // down 45.00 this session
    c.start();

    const over = c.fleetOrder(p, 'Session', 'FOCUS', 0, null, 10_00);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe('LIMIT_LOSS');
    expect(c.fleetOrder(p, 'Session', 'FOCUS', 0, null, 5_00).ok).toBe(true);

    // Session accounting resets when the player's last socket closes.
    limits.endSession(p);
    limits.beginSession(p);
    vi.advanceTimersByTime(200);
    expect(c.fleetOrder(p, 'Session', 'FOCUS', 0, null, 10_00).ok).toBe(true);
    c.stop();
  });

  it('tightening applies immediately; loosening waits the 24h cooldown', () => {
    const p = addPlayer('Planner');
    const t0 = Date.now();
    limits.setLimits(p, { dailyLossLimitMinor: 50_00 }, t0);
    expect(limits.getState(p, t0).dailyLossLimitMinor).toBe(50_00);

    // Raise → queued, not applied.
    limits.setLimits(p, { dailyLossLimitMinor: 100_00 }, t0 + 1_000);
    let state = limits.getState(p, t0 + 2_000);
    expect(state.dailyLossLimitMinor).toBe(50_00);
    expect(state.pending).toEqual([
      {
        field: 'dailyLossLimitMinor',
        value: 100_00,
        effectiveAt: t0 + 1_000 + LIMIT_RAISE_COOLDOWN_MS,
      },
    ]);

    // After the cooldown the raise matures.
    state = limits.getState(p, t0 + 1_000 + LIMIT_RAISE_COOLDOWN_MS + 1);
    expect(state.dailyLossLimitMinor).toBe(100_00);
    expect(state.pending).toEqual([]);

    // Lowering is immediate and supersedes any queued loosening.
    limits.setLimits(p, { dailyLossLimitMinor: 200_00 }, t0 + 2 * LIMIT_RAISE_COOLDOWN_MS);
    limits.setLimits(p, { dailyLossLimitMinor: 20_00 }, t0 + 2 * LIMIT_RAISE_COOLDOWN_MS + 1);
    state = limits.getState(p, t0 + 2 * LIMIT_RAISE_COOLDOWN_MS + 2);
    expect(state.dailyLossLimitMinor).toBe(20_00);
    expect(state.pending).toEqual([]);

    // Clearing is a loosening too — queued, never instant.
    limits.setLimits(p, { dailyLossLimitMinor: null }, t0 + 3 * LIMIT_RAISE_COOLDOWN_MS);
    state = limits.getState(p, t0 + 3 * LIMIT_RAISE_COOLDOWN_MS + 1);
    expect(state.dailyLossLimitMinor).toBe(20_00);
    expect(state.pending).toHaveLength(1);
  });

  it('self-exclusion locks anchoring and only ever extends (F2)', () => {
    const c = new RoundCoordinator(repo, fakeChain(), noopEvents, room({ roomId: 'f4' }), limits);
    const p = addPlayer('Resting');
    const t0 = Date.now();
    limits.setExclusion(p, 60, t0); // one hour
    c.start();

    const locked = c.fleetOrder(p, 'Resting', 'FOCUS', 0, null, 5_00);
    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      expect(locked.code).toBe('EXCLUDED');
      expect(locked.receipt?.verdict).toBe('REJECTED');
    }

    // A shorter re-request never shortens the lockout.
    limits.setExclusion(p, 1, t0 + 1_000);
    expect(limits.getState(p, t0 + 2_000).excludedUntil).toBe(t0 + 60 * 60_000);

    // After expiry, anchoring works again.
    expect(limits.checkOrder(p, 5_00, t0 + 61 * 60_000).ok).toBe(true);
    c.stop();
  });

  it('writes the day-loss ledger inside settlement: net equals the balance move', () => {
    const c = new RoundCoordinator(repo, fakeChain(), noopEvents, room({ roomId: 'f5' }), limits);
    const p = addPlayer('Ledger');
    limits.beginSession(p);
    const before = repo.getPlayer(p)!.balanceMinor;
    c.start();
    expect(c.fleetOrder(p, 'Ledger', 'FOCUS', 0, null, 10_00).ok).toBe(true);
    vi.advanceTimersByTime(TIMINGS.anchorMs + TIMINGS.stormMs + 50);

    const after = repo.getPlayer(p)!.balanceMinor;
    expect(repo.getDayLoss(p, utcDayKey())).toBe(before - after);
    expect(limits.sessionNet(p)).toBe(after - before);
    c.stop();
  });
});
