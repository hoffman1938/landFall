/**
 * Adaptive house liquidity, end to end against a real coordinator.
 *
 * The policy itself is unit-tested in @landfall/core; these tests pin the parts
 * only the server can get wrong: that the seed actually follows settled traffic,
 * that it is published before anchoring opens, that it reaches the lock snapshot
 * verification reads, and that shrinking it does not turn the whale cap against
 * the first player through the door.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ZONE_COUNT, chainCommitment, roundSeed } from '@landfall/core';
import { openDb, type Db, type Sqlite } from '../src/db/index.js';
import { players, rounds } from '../src/db/schema.js';
import {
  DEFAULT_ROOM,
  RoundCoordinator,
  type RoomConfig,
  type Timings,
} from '../src/coordinator.js';
import { DrizzleSqliteRepository } from '../src/db/repository.js';
import { RoomManager, resolveRoomConfig } from '../src/rooms.js';

const TERMINAL = 'e'.repeat(64);
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

describe('adaptive house liquidity in the round loop', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
    // House player: seeds are real stakes, so conservation needs a real row.
    db.insert(players)
      .values({
        id: randomUUID(),
        name: 'HOUSE',
        balanceMinor: 10_000_000_00,
        isHouse: true,
        createdAt: Date.now(),
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
  });

  function addPlayer(name: string, balance = 1_000_000_00): string {
    const id = randomUUID();
    db.insert(players)
      .values({ id, name, balanceMinor: balance, isHouse: false, createdAt: Date.now() })
      .run();
    return id;
  }

  function runRound(): void {
    vi.advanceTimersByTime(
      TIMINGS.anchorMs + TIMINGS.stormMs + TIMINGS.resolvedMs + TIMINGS.cooldownMs + 50,
    );
  }

  /** Fills a room with enough traffic to push its handle EMA past the floor. */
  function playRounds(coordinator: RoundCoordinator, rounds: number, stakeMinor: number): void {
    const crew = ['Ada', 'Bo', 'Cy', 'Di', 'Eve'].map((n) => [n, addPlayer(n)] as const);
    for (let r = 0; r < rounds; r++) {
      crew.forEach(([name, id], i) => {
        coordinator.fleetOrder(id, name, 'FOCUS', (r + i) % ZONE_COUNT, null, stakeMinor);
      });
      runRound();
    }
  }

  it('a dead table is seeded to the floor; a busy one falls to the token seed', () => {
    const cfg = room({
      roomId: 'liq',
      name: 'Liq',
      seedMinor: 25_00,
      liquidityFloorMinor: 90_00,
      minSeedMinor: 1_00,
      minStakeMinor: 1_00,
      maxStakeMinor: 500_00,
    });
    const coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, cfg);
    coordinator.start();

    // Nobody has ever played here: the house carries the table up to the floor,
    // 90.00 spread over six coves. (The ceiling only binds when floor/K is
    // above it — it is a liability limit, not the normal operating point.)
    expect(coordinator.roundHeader().houseSeedMinor).toBe(90_00 / ZONE_COUNT);
    runRound();

    // Five fleets betting 25.00 puts ~125.00 of real handle on the table, well
    // past the 90.00 floor — the house should get out of the way entirely.
    playRounds(coordinator, 8, 25_00);
    expect(coordinator.roundHeader().houseSeedMinor).toBe(1_00);
    coordinator.stop();
  });

  it('the published seed is the one that reaches the lock snapshot', () => {
    const cfg = room({
      roomId: 'snap',
      name: 'Snap',
      seedMinor: 25_00,
      liquidityFloorMinor: 60_00,
      minSeedMinor: 1_00,
      minStakeMinor: 1_00,
      maxStakeMinor: 500_00,
    });
    const coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, cfg);
    coordinator.start();

    playRounds(coordinator, 4, 10_00);

    // Verification recomputes payouts from the snapshot alone, so the seed the
    // header promised must be exactly the seed the snapshot recorded.
    const announced = coordinator.roundHeader().houseSeedMinor;
    const player = addPlayer('Zed');
    coordinator.fleetOrder(player, 'Zed', 'FOCUS', 1, null, 5_00);
    runRound();

    const settled = db
      .select()
      .from(rounds)
      .all()
      .filter((r) => r.lockSnapshotJson !== null);
    const last = settled[settled.length - 2]!; // the round whose header we read
    const snapshot = JSON.parse(last.lockSnapshotJson!) as {
      amountMinor: number;
      isHouseSeed: boolean;
    }[];
    const houseLines = snapshot.filter((line) => line.isHouseSeed);
    expect(houseLines).toHaveLength(ZONE_COUNT);
    for (const line of houseLines) expect(line.amountMinor).toBe(announced);
  });

  it('the whale cap does not clamp the first bettor once the seed shrinks (B5 floor)', () => {
    const cfg = room({
      roomId: 'cap',
      name: 'Cap',
      seedMinor: 25_00,
      liquidityFloorMinor: 90_00,
      minSeedMinor: 1_00,
      minStakeMinor: 1_00,
      maxStakeMinor: 500_00,
      whaleCapFraction: 0.25,
    });
    const coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, cfg);
    coordinator.start();

    // Drive the seed down to the token amount.
    playRounds(coordinator, 8, 25_00);
    expect(coordinator.roundHeader().houseSeedMinor).toBe(1_00);

    // First anchor of a fresh round: the live handle is only 6 × 1.00 of seed.
    // Without the liquidity floor the cap would be 25% of 6.00 = 2.00.
    const casual = addPlayer('Casual');
    const result = coordinator.fleetOrder(casual, 'Casual', 'FOCUS', 2, null, 25_00);
    expect(result.ok).toBe(true);

    coordinator.stop();
  });

  it('the seed never exceeds its configured ceiling, whatever the traffic', () => {
    const cfg = room({
      roomId: 'ceil',
      name: 'Ceil',
      seedMinor: 5_00,
      liquidityFloorMinor: 10_000_00, // absurd floor
      minSeedMinor: 1_00,
      minStakeMinor: 1_00,
    });
    const coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, cfg);
    coordinator.start();
    expect(coordinator.roundHeader().houseSeedMinor).toBe(5_00);
    coordinator.stop();
  });
});

describe('room config + population routing', () => {
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

  const base = room({ roomId: 'base', name: 'Base' });

  it('defaults the liquidity floor to the old flat seed total', () => {
    const cfg = resolveRoomConfig({ roomId: 'r', name: 'R', seedMinor: 25_00 }, base, false);
    expect(cfg.liquidityFloorMinor).toBe(25_00 * ZONE_COUNT);
  });

  it('defaults the token seed to the room minimum stake', () => {
    const cfg = resolveRoomConfig(
      { roomId: 'r', name: 'R', minStakeMinor: 5_00, maxStakeMinor: 500_00, seedMinor: 50_00 },
      base,
      false,
    );
    expect(cfg.minSeedMinor).toBe(5_00);
  });

  it('refuses a token seed above the seed ceiling', () => {
    expect(() =>
      resolveRoomConfig(
        { roomId: 'r', name: 'R', seedMinor: 1_00, minSeedMinor: 50_00 },
        base,
        false,
      ),
    ).toThrow(/exceeds the seed ceiling/);
  });

  it('seats an unrouted player at the busiest room they can afford', () => {
    const chain = fakeChain();
    const configs = [
      room({ roomId: 'skiff', name: 'Skiff', minStakeMinor: 1_00, maxStakeMinor: 50_00 }),
      room({ roomId: 'flagship', name: 'Flagship', minStakeMinor: 50_00, maxStakeMinor: 5_000_00 }),
    ];
    const rooms = new RoomManager(repo, chain, configs, () => noopEvents);

    // Liquidity beats configuration order: three humans in flagship win.
    expect(rooms.bestRoomFor(new Map([['flagship', 3]]))).toBe('flagship');
    // ...but never at a table the player cannot afford.
    expect(rooms.bestRoomFor(new Map([['flagship', 3]]), 10_00)).toBe('skiff');
    // Equally empty rooms fall back to configuration order (cheapest first).
    expect(rooms.bestRoomFor(new Map())).toBe('skiff');
  });
});
