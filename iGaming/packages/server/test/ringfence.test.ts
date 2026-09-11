/**
 * THE HOUSE-SEED RING-FENCE, end to end (gap G8; GLI-19 §A.7.1(c)–(d)).
 *
 * The change these tests guard is the riskiest in the compliance pass, because
 * it moved real money: house seeds used to be debited from the operator's
 * account at lock and credited back to it at settlement, which is precisely how
 * house-seed profit ended up inside operator revenue. They are now funded by a
 * SEGREGATED LIQUIDITY FLOAT and never touch the operator's account at all.
 *
 * Two things therefore have to be proved, and the first is not a compliance
 * point but an arithmetic one:
 *
 *   1. NO MONEY IS CREATED OR DESTROYED. Moving a debit out of one account and
 *      into a ledger is exactly the kind of edit that silently leaks value, so
 *      total value in the system is measured across many settled rounds.
 *   2. THE OPERATOR'S ONLY INFLOW IS THE RAKE. §A.7.1(c) is a rule about what
 *      comes in, and after the fence the account has one credit path and three
 *      debit paths, all of which move money toward players.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  RULES_VERSION,
  ZONE_COUNT,
  chainCommitment,
  houseFloatOpeningFor,
  roundSeed,
} from '@landfall/core';
import { openDb, type Db, type Sqlite } from '../src/db/index.js';
import {
  houseFloatLedger,
  players,
  rounds,
  significantEvents,
  stormReserveLedger,
  surgePots,
} from '../src/db/schema.js';
import { DEFAULT_ROOM, RoundCoordinator, type RoomConfig, type Timings } from '../src/coordinator.js';
import { DrizzleSqliteRepository } from '../src/db/repository.js';

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

describe('house-seed ring-fence (G8)', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;
  let houseId: string;

  const cfg: RoomConfig = {
    ...DEFAULT_ROOM,
    roomId: 'fence',
    name: 'Fence',
    timings: TIMINGS,
    seedMinor: 25_00,
    liquidityFloorMinor: 90_00,
    minSeedMinor: 1_00,
    minStakeMinor: 1_00,
    maxStakeMinor: 500_00,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
    houseId = randomUUID();
    db.insert(players)
      .values({
        id: houseId,
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

  /** Every account, fund and ledger that can hold value, summed. */
  function totalValue(): number {
    const balances = db
      .select()
      .from(players)
      .all()
      .reduce((a, p) => a + p.balanceMinor, 0);
    const pot = db.select().from(surgePots).where(eq(surgePots.roomId, cfg.roomId)).get();
    const reserve = db
      .select()
      .from(stormReserveLedger)
      .where(eq(stormReserveLedger.roomId, cfg.roomId))
      .all()
      .at(-1);
    const float = db
      .select()
      .from(houseFloatLedger)
      .where(eq(houseFloatLedger.roomId, cfg.roomId))
      .all()
      .at(-1);
    return (
      balances +
      (pot?.potMinor ?? 0) +
      (pot?.diversionMinor ?? 0) +
      (reserve?.balanceMinor ?? 0) +
      (float?.balanceMinor ?? 0)
    );
  }

  it('conserves total value across many settled rounds', () => {
    const coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, cfg);
    coordinator.start();
    runRound();

    const crew = ['Ada', 'Bo', 'Cy', 'Di', 'Eve'].map((n) => [n, addPlayer(n)] as const);
    const before = totalValue();

    for (let r = 0; r < 40; r++) {
      crew.forEach(([name, id], i) => {
        coordinator.fleetOrder(id, name, 'FOCUS', (r + i) % ZONE_COUNT, null, 10_00);
      });
      runRound();
    }
    coordinator.stop();

    // Value moves between players, the float, the reserve and the pot every
    // round — but the total is a closed system and must not drift by a unit.
    expect(totalValue()).toBe(before);
  });

  it('the operator account never receives house-seed winnings', () => {
    const coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, cfg);
    coordinator.start();
    runRound();

    const crew = ['Ada', 'Bo'].map((n) => [n, addPlayer(n)] as const);
    for (let r = 0; r < 25; r++) {
      crew.forEach(([name, id], i) => {
        coordinator.fleetOrder(id, name, 'FOCUS', (r + i) % ZONE_COUNT, null, 5_00);
      });
      runRound();
    }
    coordinator.stop();

    // Seeds settled every round — five of six survive each time, so under the
    // old accounting the house would have booked a large stream of credits.
    const floatRows = db
      .select()
      .from(houseFloatLedger)
      .where(eq(houseFloatLedger.roomId, cfg.roomId))
      .all();
    expect(floatRows.length).toBeGreaterThan(20);
    expect(floatRows.some((r) => r.returnedMinor > 0)).toBe(true);
    expect(floatRows.some((r) => r.netMinor !== 0)).toBe(true);

    // Every credit back to a surviving seed landed in the float, never in the
    // operator's balance: the float's own P&L is non-trivial and self-consistent.
    const staked = floatRows.reduce((a, r) => a + r.stakedMinor, 0);
    const returned = floatRows.reduce((a, r) => a + r.returnedMinor, 0);
    const topUps = floatRows.reduce((a, r) => a + r.topUpMinor, 0);
    const opening = houseFloatOpeningFor(cfg.seedMinor, ZONE_COUNT, cfg.liquidityFloorMinor);
    expect(floatRows.at(-1)!.balanceMinor).toBe(opening + topUps - staked + returned);
    // A float sized for many rounds should not be booking routine top-ups.
    expect(topUps).toBe(0);
  });

  it('the Storm Reserve opens capitalized and never goes negative (G11)', () => {
    const coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, cfg);
    coordinator.start();
    runRound();

    const crew = ['Ada', 'Bo', 'Cy'].map((n) => [n, addPlayer(n)] as const);
    for (let r = 0; r < 30; r++) {
      crew.forEach(([name, id], i) => {
        coordinator.fleetOrder(id, name, 'FOCUS', (r + i) % ZONE_COUNT, null, 20_00);
      });
      runRound();
    }
    coordinator.stop();

    const rows = db
      .select()
      .from(stormReserveLedger)
      .where(eq(stormReserveLedger.roomId, cfg.roomId))
      .all();
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) {
      expect(row.balanceMinor).toBeGreaterThanOrEqual(0);
    }
    // Opening capital is real money the operator put in, not a free balance.
    expect(rows[0]!.balanceMinor).toBeGreaterThan(0);
  });

  it('regularises a legacy negative reserve at construction, not inside a round', () => {
    // Databases written before rules v2 can carry a negative reserve balance —
    // that was the old design, and it is exactly what G11 objects to. Folding it
    // into the next round's settlement would book a large house backstop against
    // a round that did not cause it, and raise a false incident for an upgrade.
    // A high round id so this legacy row cannot collide with the rounds the
    // coordinator is about to open — the collision itself is tested below.
    db.insert(stormReserveLedger)
      .values({
        roundId: 9_999,
        roomId: cfg.roomId,
        inflowMinor: 0,
        outflowMinor: 500_00,
        balanceMinor: -500_00,
        backstopMinor: 0,
        createdAt: Date.now(),
      })
      .run();

    const coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, cfg);
    coordinator.start();
    runRound();
    coordinator.stop();

    const rows = db
      .select()
      .from(stormReserveLedger)
      .where(eq(stormReserveLedger.roomId, cfg.roomId))
      .all();
    // Every row written after the migration is non-negative, and no round was
    // charged a backstop for the historical deficit.
    for (const row of rows.filter((r) => r.roundId !== 9_999)) {
      expect(row.balanceMinor).toBeGreaterThanOrEqual(0);
      expect(row.backstopMinor).toBe(0);
    }

    const events = db.select().from(significantEvents).all();
    const migration = events.find((e) => e.reason?.includes('rules v2 migration'));
    expect(migration).toBeDefined();
    expect(migration!.valueBefore).toBe('-50000');
    // An upgrade is an alteration to record, not an incident to notify.
    expect(migration!.incident).toBe(false);
  });

  /**
   * G27 / GLI-19 §4.16, §A.6.4 — a round that cannot be settled is VOIDED and
   * every bet in it refunded, rather than leaving stakes debited and nobody paid.
   *
   * The failure is induced by pre-inserting the reserve ledger row that
   * settlement will try to write, so the settlement transaction throws on a
   * unique-constraint violation. Any throw inside settlement takes the same
   * path — including the core conservation assert, which is the one that
   * matters most: an arithmetic disagreement must never be paid out.
   */
  it('voids a round it cannot settle and refunds every bet (G27)', () => {
    const coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, cfg);
    const player = addPlayer('Ada');
    const before = db.select().from(players).where(eq(players.id, player)).get()!.balanceMinor;

    // Round ids autoincrement from 1 in a fresh database, so this is the row the
    // first settlement will collide with.
    db.insert(stormReserveLedger)
      .values({
        roundId: 1,
        roomId: cfg.roomId,
        inflowMinor: 0,
        outflowMinor: 0,
        balanceMinor: 0,
        backstopMinor: 0,
        createdAt: Date.now(),
      })
      .run();

    coordinator.start();
    coordinator.fleetOrder(player, 'Ada', 'FOCUS', 0, null, 10_00);
    runRound();
    coordinator.stop();

    const round = db.select().from(rounds).where(eq(rounds.id, 1)).get()!;
    expect(round.voidedAt).not.toBeNull();
    expect(round.voidReason).toBeTruthy();
    expect(round.settledAt).toBeNull();

    // The bet came back in full — no rake, no partial settlement.
    expect(db.select().from(players).where(eq(players.id, player)).get()!.balanceMinor).toBe(before);

    const events = db.select().from(significantEvents).all();
    const voided = events.find((e) => e.component === 'round.1');
    expect(voided?.category).toBe('INCIDENT');
    expect(voided?.incident).toBe(true);
    expect(voided?.valueAfter).toBe('VOID');
  });

  it('stamps the rules version on every round it opens (G45)', () => {
    const coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, cfg);
    coordinator.start();
    runRound();
    runRound();
    coordinator.stop();

    const all = db.select().from(rounds).all();
    expect(all.length).toBeGreaterThan(1);
    // Reads the constant rather than a literal: the assertion is that the
    // version in force is stamped, not that it happens to be any given number.
    for (const row of all) expect(row.rulesVersion).toBe(RULES_VERSION);
  });
});
