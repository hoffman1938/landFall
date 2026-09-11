/**
 * ORDER 243 ANNEX 1, ARTICLE 13 — PEER-TO-PEER GAMES.
 *
 * The Georgian text is short, absolute, and in one place STRICTER THAN GLI-19.
 * It is reproduced here in full because the difference is the whole reason this
 * file exists separately from the GLI suites:
 *
 *   "In the case of Peer-to-Peer games, the system of a systemic-electronic
 *    operator:
 *      a) must not use automatic or computerized players to play against
 *         players;
 *      b) must give the player the possibility to be placed at a gaming table
 *         on a random basis;
 *      c) shall be obliged to define the time required for the player to
 *         perform an action;
 *      d) shall be obliged to define the consequences for the player of failing
 *         to perform an action within the required time."
 *
 * LANDFALL is a Peer-to-Peer game in exactly the sense Art. 2(r) defines: "the
 * process of a game of chance ... that takes place between two or more players,
 * where the players compete with each other". Art. 13 therefore applies in full.
 *
 * TWO CLAUSES HERE ARE NOT SATISFIED BY THE GLI READING OF THE SAME SUBJECT.
 *
 * **(a) is absolute.** GLI-19 §4.11.1(c) permits proposition players and shills
 * provided they are "clearly indicated to all other players". Art. 13(a) has no
 * such exception: computerized players are PROHIBITED, disclosed or not. A build
 * that seats practice bots is therefore a demo build and cannot be supplied
 * under a permit — which is why the bots policy is a startup crash rather than
 * a warning, and why that crash is tested rather than trusted.
 *
 * **(b) requires an OPTION, not a disclosure.** The project's own compliance
 * register had closed this against GLI-19 §4.11.1(b) by disclosing the default
 * routing rule. Disclosure does not satisfy a clause that requires the
 * possibility to exist, so the option now exists and is tested below.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  RANDOM_ROOM,
  TABLE_ROUTING_DISCLOSURE,
  TIMING_DISCLOSURE,
  chainCommitment,
  roundSeed,
} from '@landfall/core';
import { openDb, type Db, type Sqlite } from '@landfall/server-src/db/index';
import { DrizzleSqliteRepository } from '@landfall/server-src/db/repository';
import { DEFAULT_ROOM, type RoomConfig, type Timings } from '@landfall/server-src/coordinator';
import { RoomManager, resolveRoomConfig } from '@landfall/server-src/rooms';
import roomsJson from '@landfall/server-src/../config/rooms.json';

const TERMINAL = 'd4'.repeat(32);
const LEN = 500;
const TIMINGS: Timings = { anchorMs: 10_000, stormMs: 500, resolvedMs: 200, cooldownMs: 200 };

function fakeChain() {
  let index = 0;
  return {
    commitment: chainCommitment(TERMINAL, LEN),
    length: LEN,
    onRollover() {},
    consume() {
      index += 1;
      return {
        chainIndex: index,
        seedHex: roundSeed(TERMINAL, LEN, index),
        prevChainValue: index === 1 ? chainCommitment(TERMINAL, LEN) : roundSeed(TERMINAL, LEN, index - 1),
      };
    },
  };
}

const silent = () => ({
  broadcast() {},
  sendToPlayer() {},
  broadcastLandfall() {},
  systemMessage() {},
});

/** The five shipped tiers, at their shipped stake ranges. */
const TIERS: RoomConfig[] = [
  { min: 1_00, max: 50_00, seed: 25_00, floor: 90_00, id: 'skiff' },
  { min: 5_00, max: 500_00, seed: 50_00, floor: 180_00, id: 'schooner' },
  { min: 50_00, max: 5_000_00, seed: 250_00, floor: 900_00, id: 'flagship' },
  { min: 500_00, max: 50_000_00, seed: 1_250_00, floor: 4_500_00, id: 'galleon' },
  { min: 5_000_00, max: 500_000_00, seed: 6_250_00, floor: 22_500_00, id: 'leviathan' },
].map((t) => ({
  ...DEFAULT_ROOM,
  roomId: t.id,
  name: t.id,
  timings: TIMINGS,
  minStakeMinor: t.min,
  maxStakeMinor: t.max,
  seedMinor: t.seed,
  minSeedMinor: t.min,
  liquidityFloorMinor: t.floor,
  surgeProb: 0,
}));

describe('Art. 13(a) — no computerized players against players', () => {
  /**
   * The clause is absolute, so the control has to be absolute: a room asking for
   * practice opponents outside `LANDFALL_ENV=demo` is a STARTUP CRASH. A warning
   * would leave the decision to whoever read the log.
   */
  it('a room requesting computerized players refuses to start outside a demo build', () => {
    expect(() =>
      resolveRoomConfig(
        { roomId: 'x', name: 'X', botsAllowed: true, botBankrollMinor: 1_000_000_00 },
        DEFAULT_ROOM,
        false,
      ),
    ).toThrow(/BOTS POLICY VIOLATION/);
  });

  /**
   * …and the shipped configuration asks for them in every room, so this build
   * cannot be started as a permitted deployment at all. That is the honest
   * position: it is a demo, and the configuration says so by failing.
   */
  it('every shipped room refuses to start outside a demo build', () => {
    const parsed = roomsJson as { rooms: { roomId: string }[] };
    for (const room of parsed.rooms) {
      expect(() => resolveRoomConfig(room, DEFAULT_ROOM, false), room.roomId).toThrow(
        /BOTS POLICY VIOLATION/,
      );
    }
  });
});

describe('Art. 13(b) — the player may be placed at a table at random', () => {
  let db: Db;
  let sqlite: Sqlite;
  let rooms: RoomManager;

  beforeEach(() => {
    ({ db, sqlite } = openDb(':memory:'));
    const repo = new DrizzleSqliteRepository(db, sqlite);
    sqlite
      .prepare('INSERT INTO players (id, name, balance_minor, is_house, is_bot, created_at) VALUES (?,?,?,1,0,?)')
      .run(randomUUID(), 'HOUSE', 100_000_000_00, Date.now());
    rooms = new RoomManager(repo, fakeChain(), TIERS, () => silent());
  });
  afterEach(() => {
    rooms.stop();
    sqlite.close();
  });

  it('the option exists, and reaches every affordable table', () => {
    const reached = new Set<string>();
    for (let i = 0; i < 500; i++) {
      reached.add(rooms.randomRoomFor(i / 500, 500_000_00));
    }
    // A balance that affords every tier must be able to land at any of them.
    expect(reached.size).toBe(TIERS.length);
  });

  it('is roughly uniform over the tables the player can afford', () => {
    const counts = new Map<string, number>();
    const N = 6_000;
    for (let i = 0; i < N; i++) {
      const id = rooms.randomRoomFor(i / N, 500_000_00);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const expected = N / TIERS.length;
    for (const [id, n] of counts) {
      expect(Math.abs(n - expected) / expected, id).toBeLessThan(0.05);
    }
  });

  /**
   * "At random" cannot mean "at a table you cannot play". Affordability is a
   * player-protection constraint and it survives the randomisation.
   */
  it('never seats a player at a table they cannot afford', () => {
    for (let i = 0; i < 500; i++) {
      // A balance that affords only the two cheapest tiers.
      const id = rooms.randomRoomFor(i / 500, 400_00);
      const room = rooms.get(id)!;
      expect(room.cfg.minStakeMinor, id).toBeLessThanOrEqual(400_00);
    }
  });

  it('falls back to a real table when the balance affords none', () => {
    const id = rooms.randomRoomFor(0.5, 1);
    expect(rooms.get(id)).toBeDefined();
  });

  it('the sentinel is not a room id, so it cannot collide with a tier', () => {
    expect(rooms.get(RANDOM_ROOM)).toBeUndefined();
    const parsed = roomsJson as { rooms: { roomId: string }[] };
    expect(parsed.rooms.some((r) => r.roomId === RANDOM_ROOM)).toBe(false);
  });

  /**
   * The default routing rule is still disclosed — Art. 13(b) is satisfied by the
   * option, and GLI-19 §4.11.1(b) by the option plus the disclosure — and the
   * disclosure now names the option so a player can find it.
   */
  it('the disclosure names both the default rule and the random option', () => {
    expect(TABLE_ROUTING_DISCLOSURE).toMatch(/busiest table/i);
    expect(TABLE_ROUTING_DISCLOSURE).toMatch(/random/i);
    expect(TABLE_ROUTING_DISCLOSURE).toMatch(/affordab/i);
  });
});

describe('Art. 13(c)–(d) — the time to act, and the consequence of not acting', () => {
  /**
   * Landfall's answer is simple enough that the risk is leaving it implicit:
   * the only action is placing a bet, the window is published to the millisecond
   * in every round header, and missing it costs nothing at all.
   */
  it('the disclosure states the window and what happens if it passes', () => {
    expect(TIMING_DISCLOSURE).toMatch(/ten seconds/i);
    expect(TIMING_DISCLOSURE).toMatch(/no bet is placed/i);
    expect(TIMING_DISCLOSURE).toMatch(/nothing is taken from your balance/i);
    // (d) is about CONSEQUENCES, so the absence of a penalty is the disclosure.
    expect(TIMING_DISCLOSURE).toMatch(/no penalty|no turn to miss/i);
  });

  it('the window is published on the round itself, not only on the clock', () => {
    const { db: memDb, sqlite: memSqlite } = openDb(':memory:');
    memSqlite
      .prepare('INSERT INTO players (id, name, balance_minor, is_house, is_bot, created_at) VALUES (?,?,?,1,0,?)')
      .run(randomUUID(), 'HOUSE', 100_000_000_00, Date.now());
    const repo = new DrizzleSqliteRepository(memDb, memSqlite);
    const manager = new RoomManager(repo, fakeChain(), [TIERS[0]!], () => silent());
    const room = manager.get('skiff')!;
    room.start();
    const phase = room.phaseInfo();
    expect(phase.phase).toBe('ANCHOR_OPEN');
    // An absolute instant, so a client with a skewed clock can still compute the
    // remaining time rather than trusting a countdown it was handed.
    expect(phase.endsAt).toBeGreaterThan(Date.now());
    // Blind Fog — the final window in which one last change is allowed — is
    // published too, so "the time required to perform an action" is complete.
    expect(room.roundHeader().fogStartsAt).toBeGreaterThan(0);
    expect(room.roundHeader().fogStartsAt).toBeLessThan(phase.endsAt);
    room.stop();
    manager.stop();
    memSqlite.close();
  });
});
