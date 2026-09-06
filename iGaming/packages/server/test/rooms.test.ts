/**
 * Phase R3 integration tests — multi-room concurrency (C1), tier caps (C2/B5),
 * flag friction (B4), bots policy (C5). Real coordinators, in-memory SQLite,
 * fake timers.
 *
 * The last two suites hold the SHIPPED `config/rooms.json` to the invariants a
 * new stake tier is most likely to break: a ladder that stays ordered and inside
 * the 100× span, a liquidity floor big enough that the whale cap still admits
 * the table's own minimum bet, and bots that can afford the table they sit at.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  STARTING_BALANCE_MINOR,
  chainCommitment,
  roundSeed,
  pickGoldenAnchor,
  type StakeEntry,
} from '@landfall/core';
import { openDb, type Db, type Sqlite } from '../src/db/index.js';
import { players, rounds } from '../src/db/schema.js';
import {
  DEFAULT_ROOM,
  RoundCoordinator,
  type RoomConfig,
  type Timings,
} from '../src/coordinator.js';
import { DrizzleSqliteRepository } from '../src/db/repository.js';
import { loadRoomConfigs, resolveRoomConfig } from '../src/rooms.js';
import { BOT_BANKROLL_STAKE_MULTIPLE, BotManager } from '../src/bots.js';

const TERMINAL = 'e'.repeat(64);
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

describe('multi-room coordinator (C1)', () => {
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

  it('two rooms run concurrent independent rounds against one server', () => {
    const chain = fakeChain();
    const a = new RoundCoordinator(repo, chain, noopEvents, room({ roomId: 'a', name: 'A' }));
    const b = new RoundCoordinator(repo, chain, noopEvents, room({ roomId: 'b', name: 'B' }));
    const pa = addPlayer('Alice');
    const pb = addPlayer('Bob');
    a.start();
    b.start();

    expect(a.roundId).not.toBe(b.roundId); // distinct global round ids
    const ra = a.fleetOrder(pa, 'Alice', 'FOCUS', 0, null, 10_00);
    const rb = b.fleetOrder(pb, 'Bob', 'FOCUS', 1, null, 20_00);
    expect(ra.ok && rb.ok).toBe(true);
    // Orders are room-scoped: Alice has no fleet in room B and vice versa.
    expect(a.yourFleet(pb)).toBeNull();
    expect(b.yourFleet(pa)).toBeNull();

    // Run both rooms to settlement.
    vi.advanceTimersByTime(TIMINGS.anchorMs + TIMINGS.stormMs + 50);
    const rowA = db.select().from(rounds).where(undefined).all();
    const settled = rowA.filter((r) => r.settledAt !== null);
    expect(settled).toHaveLength(2);
    expect(new Set(settled.map((r) => r.roomId))).toEqual(new Set(['a', 'b']));

    a.stop();
    b.stop();
  });

  it('whale in a thin room is clamped; the same stake passes in a fat room (B5)', () => {
    const chain = fakeChain();
    const thin = new RoundCoordinator(
      repo,
      chain,
      noopEvents,
      room({ roomId: 'thin', name: 'Thin', whaleCapFraction: 0.25 }),
    );
    thin.start();
    const whale = addPlayer('Whale', 100_000_00);
    // Handle without the whale: 6 seeds × 50.00 = 300.00. Cap: stake ≤ othe rs/3 = 100.00.
    const tooBig = thin.fleetOrder(whale, 'Whale', 'FOCUS', 0, null, 150_00);
    expect(tooBig.ok).toBe(false);
    if (tooBig.ok) throw new Error('unreachable');
    expect(tooBig.code).toBe('WHALE_CAP');
    expect(tooBig.receipt?.verdict).toBe('REJECTED');

    // Fatten the room with other players' stakes, then the same 150.00 passes.
    for (let i = 0; i < 3; i++) {
      const p = addPlayer(`Crowd${i}`);
      expect(thin.fleetOrder(p, `Crowd${i}`, 'FOCUS', i + 1, null, 50_00).ok).toBe(true);
      vi.advanceTimersByTime(200); // respect the human-scale re-anchor cap
    }
    // others = 300 seeds + 150 crowd = 450 → cap = 150.00 at 25%.
    const fits = thin.fleetOrder(whale, 'Whale', 'FOCUS', 0, null, 150_00);
    expect(fits.ok).toBe(true);
    thin.stop();
  });

  it('rejects stakes outside the room tier (C2)', () => {
    const chain = fakeChain();
    const skiff = new RoundCoordinator(
      repo,
      chain,
      noopEvents,
      room({ roomId: 'skiff', name: 'Skiff', minStakeMinor: 1_00, maxStakeMinor: 50_00 }),
    );
    skiff.start();
    const p = addPlayer('Casual');
    const tooBig = skiff.fleetOrder(p, 'Casual', 'FOCUS', 0, null, 100_00);
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.code).toBe('STAKE_OUT_OF_TIER');
    skiff.stop();
  });

  it('flags need an anchored fleet and cool down 2-of-3 rounds (B4)', () => {
    const chain = fakeChain();
    const c = new RoundCoordinator(
      repo,
      chain,
      noopEvents,
      room({ roomId: 'flags', name: 'Flags', signalMinStakeMinor: 5_00 }),
    );
    c.start();
    const p = addPlayer('Bluffer');

    // No fleet -> rejected.
    const noFleet = c.signal(p, 'Bluffer', 0, 'RALLY');
    expect(noFleet.ok).toBe(false);
    if (!noFleet.ok) expect(noFleet.code).toBe('SIGNAL_NEEDS_FLEET');

    // Fleet below the flag minimum -> rejected.
    expect(c.fleetOrder(p, 'Bluffer', 'FOCUS', 0, null, 2_00).ok).toBe(true);
    const tooSmall = c.signal(p, 'Bluffer', 0, 'RALLY');
    expect(tooSmall.ok).toBe(false);
    if (!tooSmall.ok) expect(tooSmall.code).toBe('SIGNAL_NEEDS_FLEET');

    // Adequate fleet -> accepted (round 1 of the window).
    vi.advanceTimersByTime(200);
    expect(c.fleetOrder(p, 'Bluffer', 'FOCUS', 0, null, 10_00).ok).toBe(true);
    expect(c.signal(p, 'Bluffer', 0, 'RALLY').ok).toBe(true);

    // Round 2: flag again -> accepted (2 of 3 used).
    const advanceRound = () => {
      vi.advanceTimersByTime(
        TIMINGS.anchorMs + TIMINGS.stormMs + TIMINGS.resolvedMs + TIMINGS.cooldownMs + 50,
      );
      vi.advanceTimersByTime(200);
      expect(c.fleetOrder(p, 'Bluffer', 'FOCUS', 0, null, 10_00).ok).toBe(true);
    };
    advanceRound();
    expect(c.signal(p, 'Bluffer', 1, 'FLEE').ok).toBe(true);

    // Round 3: cooldown — 2 flags already in the last 3 rounds.
    advanceRound();
    const blocked = c.signal(p, 'Bluffer', 2, 'HOLD');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('FLAG_COOLDOWN');

    // Round 4: the window slides — the flag flies again.
    advanceRound();
    expect(c.signal(p, 'Bluffer', 3, 'RALLY').ok).toBe(true);
    c.stop();
  });

  it('bots never win the Golden Anchor, even in demo (C5)', () => {
    // Direct core check with a bot-marked snapshot: only the human is eligible.
    const stakes: StakeEntry[] = [
      { id: 'bot-a', zone: 0, amountMinor: 1_000_000, isHouseSeed: false, isBot: true },
      { id: 'human', zone: 1, amountMinor: 1_00, isHouseSeed: false },
      { id: 'seed', zone: 2, amountMinor: 50_00, isHouseSeed: true },
    ];
    for (const u of [0.01, 0.5, 0.99]) {
      expect(pickGoldenAnchor(stakes, 5, u)!.id).toBe('human');
    }
    // And when only bots survive, the pot rolls over rather than paying a bot.
    const botsOnly: StakeEntry[] = [
      { id: 'bot-a', zone: 0, amountMinor: 1_000, isHouseSeed: false, isBot: true },
    ];
    expect(pickGoldenAnchor(botsOnly, 5, 0.5)).toBeNull();
  });
});

describe('bots policy enforcement (C5)', () => {
  it('a room config requesting bots outside demo env is a startup crash', () => {
    expect(() =>
      resolveRoomConfig(
        { roomId: 'real-money', name: 'Real', botsAllowed: true },
        DEFAULT_ROOM,
        false, // not demo
      ),
    ).toThrow(/BOTS POLICY VIOLATION/);
    // The same config under demo env resolves fine.
    expect(
      resolveRoomConfig({ roomId: 'demo-room', name: 'Demo', botsAllowed: true }, DEFAULT_ROOM, true)
        .botsAllowed,
    ).toBe(true);
  });

  it('constructing a BotManager for a bots-forbidden room crashes', () => {
    const { db, sqlite } = openDb(':memory:');
    const repo = new DrizzleSqliteRepository(db, sqlite);
    const c = new RoundCoordinator(repo, fakeChain(), noopEvents, {
      ...DEFAULT_ROOM,
      botsAllowed: false,
    });
    expect(() => new BotManager(db, c, 3)).toThrow(/BOTS POLICY VIOLATION/);
    sqlite.close();
  });
});

describe('per-tier bot seating', () => {
  it('derives a bot bankroll from the tier ceiling and honours an explicit one', () => {
    const rich = resolveRoomConfig(
      {
        roomId: 'rich',
        name: 'Rich',
        minStakeMinor: 500_00,
        maxStakeMinor: 50_000_00,
        seedMinor: 1_250_00,
      },
      DEFAULT_ROOM,
      false,
    );
    expect(rich.botBankrollMinor).toBe(50_000_00 * BOT_BANKROLL_STAKE_MULTIPLE);
    expect(rich.botCount).toBeNull(); // no per-room opinion -> the global default

    const explicit = resolveRoomConfig(
      {
        roomId: 'rich',
        name: 'Rich',
        minStakeMinor: 500_00,
        maxStakeMinor: 50_000_00,
        seedMinor: 1_250_00,
        botBankrollMinor: 1_000_000_00,
        botCount: 6,
      },
      DEFAULT_ROOM,
      false,
    );
    expect(explicit.botBankrollMinor).toBe(1_000_000_00);
    expect(explicit.botCount).toBe(6);
  });

  it('refuses a bot bankroll that cannot cover one table-maximum stake', () => {
    expect(() =>
      resolveRoomConfig(
        {
          roomId: 'broke',
          name: 'Broke',
          minStakeMinor: 500_00,
          maxStakeMinor: 50_000_00,
          seedMinor: 1_250_00,
          botBankrollMinor: 100_00,
        },
        DEFAULT_ROOM,
        false,
      ),
    ).toThrow(/at least the tier maximum stake/);
  });

  it('refuses a negative or fractional bot head-count', () => {
    for (const botCount of [-1, 2.5]) {
      expect(() =>
        resolveRoomConfig({ roomId: 'r', name: 'R', botCount }, DEFAULT_ROOM, false),
      ).toThrow(/botCount must be a non-negative integer/);
    }
  });
});

describe('shipped rooms.json', () => {
  // Loaded per test rather than once at collection time, so a bad config shows
  // up as a failing assertion instead of an unattributed collection error.
  const load = () => loadRoomConfigs(true, TIMINGS, 0);

  it('offers a ladder of tiers with bots at every table', () => {
    const configs = load();
    expect(configs.length).toBeGreaterThanOrEqual(5);
    for (const cfg of configs) {
      expect(cfg.botsAllowed).toBe(true);
      expect(cfg.botCount ?? 0).toBeGreaterThan(0);
    }
    // Each tier is strictly richer than the last, and spans at most 100× so a
    // casual never shares a table with someone betting 100× their stake (C2).
    for (const [i, cfg] of configs.entries()) {
      expect(cfg.maxStakeMinor).toBeLessThanOrEqual(cfg.minStakeMinor * 100);
      const prev = configs[i - 1];
      if (prev) {
        expect(cfg.minStakeMinor).toBeGreaterThan(prev.minStakeMinor);
        expect(cfg.maxStakeMinor).toBeGreaterThan(prev.maxStakeMinor);
      }
    }
  });

  it('lets the first bettor of a dead round place the table minimum (B5 × liquidity)', () => {
    // The whale cap is evaluated against max(liveHandle, liquidityFloorMinor),
    // so on an empty table the live ceiling is floor × f/(1−f). A tier whose
    // floor is too thin for its own minimum stake would reject every opening
    // bet — the failure mode a new high-roller room walks straight into.
    for (const cfg of load()) {
      const capMinor = Math.floor(
        (cfg.whaleCapFraction / (1 - cfg.whaleCapFraction)) * cfg.liquidityFloorMinor,
      );
      expect(capMinor).toBeGreaterThanOrEqual(cfg.minStakeMinor);
    }
  });

  it('gives every bot enough to bet its table (and never less than a human starts with)', () => {
    for (const cfg of load()) {
      expect(cfg.botBankrollMinor).toBeGreaterThanOrEqual(cfg.maxStakeMinor);
      expect(cfg.botBankrollMinor).toBeGreaterThanOrEqual(STARTING_BALANCE_MINOR);
    }
  });
});
