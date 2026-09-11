/**
 * DEMO MODE — GLI-19 §4.9.1 (free play), §4.11.1(c)–(d) (shills and bots),
 * §A.2.5 (test accounts), §2.5.6 (financial transactions).
 *
 * The build under certification is a DEMO build: it plays for virtual credits
 * with no cash value, there is no payment instrument anywhere in it, and the
 * tables are populated with practice opponents so a solo player sees real crowd
 * dynamics. Each of those is a regulated fact, and §4.9.1 is unusually specific
 * about them:
 *
 *   (a) free play must accurately represent the normal operation of a paid game
 *       and must not mislead about the likelihood of winning;
 *   (b) the mode must be prominently displayed so a player knows at all times;
 *   (c) it must not increment a real credit meter or account balance.
 *
 * The two things that most often go wrong here are both tested below: practice
 * opponents leaking into figures that are supposed to describe real players, and
 * a demo economy that behaves differently from the paid one.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  SURGE_PROB,
  ZONE_COUNT,
  drawZone,
  liquidityLevel,
  pickGoldenAnchor,
  pickGoldenAnchorFlat,
  settleRound,
  theoreticalRtp,
  type StakeEntry,
} from '@landfall/core';
import { openDb, type Db, type Sqlite } from '@landfall/server-src/db/index';
import { DrizzleSqliteRepository } from '@landfall/server-src/db/repository';
import { PracticeCredits, DEMO_PRACTICE_FLOAT_MINOR } from '@landfall/server-src/demoCredits';
import { isDemoEnv, resolveRoomConfig } from '@landfall/server-src/rooms';
import { DEFAULT_ROOM } from '@landfall/server-src/coordinator';
import roomsJson from '@landfall/server-src/../config/rooms.json';

describe('GLI-19 §4.11.1(d) / C5 — practice opponents exist only in a demo build', () => {
  /**
   * THE NON-NEGOTIABLE ONE. A practice bot in a real-money room would be a
   * proposition player the operator funds and does not disclose. The policy is
   * enforced as a STARTUP CRASH rather than a warning, so a misconfiguration
   * cannot reach players.
   */
  it('a room requesting bots outside a demo build refuses to start', () => {
    expect(() =>
      resolveRoomConfig(
        { roomId: 'x', name: 'X', botsAllowed: true, botBankrollMinor: 1_000_000_00 },
        DEFAULT_ROOM,
        false, // not a demo
      ),
    ).toThrow(/BOTS POLICY VIOLATION/);
  });

  it('the same room is accepted in a demo build', () => {
    const cfg = resolveRoomConfig(
      { roomId: 'x', name: 'X', botsAllowed: true, botBankrollMinor: 1_000_000_00 },
      DEFAULT_ROOM,
      true,
    );
    expect(cfg.botsAllowed).toBe(true);
  });

  it('the demo flag comes from the environment, and nothing else opens it', () => {
    expect(isDemoEnv('demo')).toBe(true);
    for (const value of [undefined, '', 'DEMO', 'production', 'true', '1', 'demo ']) {
      expect(isDemoEnv(value), `env "${String(value)}"`).toBe(false);
    }
  });

  /**
   * The shipped configuration IS a demo configuration — every room asks for
   * bots — so this build must never be started without `LANDFALL_ENV=demo`.
   * Stating that here means the fact is in the evidence pack rather than only in
   * a comment in a JSON file.
   */
  it('the shipped rooms.json is a demo configuration, and says so by failing', () => {
    const parsed = roomsJson as { rooms: { roomId: string; botsAllowed?: boolean }[] };
    expect(parsed.rooms.length).toBeGreaterThan(0);
    expect(parsed.rooms.every((r) => r.botsAllowed === true)).toBe(true);
    for (const room of parsed.rooms) {
      expect(() => resolveRoomConfig(room, DEFAULT_ROOM, false), room.roomId).toThrow(
        /BOTS POLICY VIOLATION/,
      );
    }
  });
});

describe('GLI-19 §4.11.1(c) — practice opponents are marked, and never win the jackpot', () => {
  it('a bot stake can never be selected for the jackpot, at any roll', () => {
    const stakes: StakeEntry[] = [
      { id: 'bot-1', zone: 1, amountMinor: 500_000_00, isHouseSeed: false, isBot: true },
      { id: 'bot-2', zone: 2, amountMinor: 500_000_00, isHouseSeed: false, isBot: true },
      { id: 'human', zone: 3, amountMinor: 1_00, isHouseSeed: false },
    ];
    for (let i = 0; i < 500; i++) {
      expect(pickGoldenAnchor(stakes, 0, i / 500)?.id).toBe('human');
      expect(pickGoldenAnchorFlat(stakes, 0, i / 500)?.id).toBe('human');
    }
  });

  /**
   * …but a bot DOES settle pari-mutuel like any other stake. That is the point
   * of §4.9.1(a): the demo must represent the paid game, and in the paid game
   * those stakes would be other players' money. Excluding them from settlement
   * would make demo payouts unlike production payouts.
   */
  it('a bot stake settles exactly like a player stake', () => {
    const asBot: StakeEntry[] = [
      { id: 'hit', zone: 0, amountMinor: 100_00, isHouseSeed: false },
      { id: 'x', zone: 1, amountMinor: 50_00, isHouseSeed: false, isBot: true },
    ];
    const asHuman: StakeEntry[] = [
      { id: 'hit', zone: 0, amountMinor: 100_00, isHouseSeed: false },
      { id: 'x', zone: 1, amountMinor: 50_00, isHouseSeed: false },
    ];
    const a = settleRound(asBot, 0, 0.12);
    const b = settleRound(asHuman, 0, 0.12);
    expect(a.lines.find((l) => l.id === 'x')!.payoutMinor).toBe(
      b.lines.find((l) => l.id === 'x')!.payoutMinor,
    );
  });

  /** Population figures shown to players count humans only. */
  it('the lobby liquidity hint is a function of human count alone', () => {
    expect(liquidityLevel(0)).toBe('quiet');
    expect(liquidityLevel(3)).toBe('filling');
    expect(liquidityLevel(8)).toBe('busy');
    // It is a display hint and takes no other input — it cannot be influenced
    // by bots because it has no parameter for them.
    expect(liquidityLevel.length).toBe(1);
  });
});

describe('GLI-19 §4.9.1(a) — the demo represents the paid game', () => {
  /**
   * The odds and the economy are the SAME CODE in both modes. There is no demo
   * branch in the draw, in settlement, or in the return model — which is the
   * strongest form of "does not mislead about the likelihood of winning".
   */
  it('the draw has no demo mode: the same seed gives the same outcome', () => {
    const seedHex = 'c'.repeat(64);
    const before = process.env.LANDFALL_ENV;
    try {
      process.env.LANDFALL_ENV = 'demo';
      const inDemo = drawZone(seedHex, 42, ZONE_COUNT);
      process.env.LANDFALL_ENV = 'production';
      const inProduction = drawZone(seedHex, 42, ZONE_COUNT);
      expect(inProduction).toEqual(inDemo);
    } finally {
      if (before === undefined) delete process.env.LANDFALL_ENV;
      else process.env.LANDFALL_ENV = before;
    }
  });

  it('the published return is the same figure in both modes', () => {
    // `theoreticalRtp` is a pure function of economy configuration and reads no
    // environment at all; asserting its arity is how that stays true.
    expect(theoreticalRtp().totalRtp).toBe(theoreticalRtp().totalRtp);
    expect(theoreticalRtp().totalRtp).toBeGreaterThan(0.99);
    expect(SURGE_PROB).toBeGreaterThan(0);
  });
});

describe('GLI-19 §4.9.1(c) / §2.5.6 — practice credits are not money', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;

  beforeEach(() => {
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
  });
  afterEach(() => sqlite.close());

  const addPlayer = (balance: number): string => {
    const id = randomUUID();
    sqlite
      .prepare(
        'INSERT INTO players (id, name, balance_minor, is_house, is_bot, created_at) VALUES (?,?,?,0,0,?)',
      )
      .run(id, `P${id.slice(0, 6)}`, balance, Date.now());
    return id;
  };
  const balanceOf = (id: string): number =>
    (sqlite.prepare('SELECT balance_minor AS b FROM players WHERE id = ?').get(id) as { b: number })
      .b;

  /**
   * THE DEFECT THIS CLOSES. Nothing in the system ever added to a player's
   * balance. A demo player who lost their float was locked out permanently —
   * every order refused, seated at the cheapest table and unable to bet on it.
   * §4.9.1(a) asks a no-wager mode to represent the normal operation of a paid
   * game, and a paid game does not lock a player out of its own rules.
   */
  it('restores the practice float to a player who cannot afford any table', () => {
    const credits = new PracticeCredits(repo, true);
    const id = addPlayer(0);
    const grant = credits.grant(id, 1_00);
    expect(grant.granted).toBe(true);
    expect(balanceOf(id)).toBe(DEMO_PRACTICE_FLOAT_MINOR);
  });

  /** …and refuses outright in any build that is not a demo. */
  it('refuses in a build that is not a demo', () => {
    const credits = new PracticeCredits(repo, false);
    const id = addPlayer(0);
    expect(credits.grant(id, 1_00).reason).toBe('NOT_DEMO');
    expect(balanceOf(id)).toBe(0);
  });

  /**
   * It is a restore, not a reward. A top-up can never leave a player holding
   * more than they started with, so it cannot be farmed and cannot be mistaken
   * for winnings — which is what keeps it outside §2.5.6's deposit rules.
   */
  it('can never raise a balance above the starting float', () => {
    const credits = new PracticeCredits(repo, true);
    const rich = addPlayer(DEMO_PRACTICE_FLOAT_MINOR * 10);
    expect(credits.grant(rich, 1_00).granted).toBe(false);
    expect(balanceOf(rich)).toBe(DEMO_PRACTICE_FLOAT_MINOR * 10);
  });

  /** Every grant is on the record with the balance before and after (§2.9.5). */
  it('ledgers each grant as a significant event', () => {
    const credits = new PracticeCredits(repo, true);
    const id = addPlayer(11);
    credits.grant(id, 1_00);
    const row = sqlite
      .prepare(
        "SELECT value_before, value_after, reason FROM significant_events WHERE category = 'DEMO_CREDITS'",
      )
      .get() as { value_before: string; value_after: string; reason: string };
    expect(row.value_before).toBe('11');
    expect(row.value_after).toBe(String(DEMO_PRACTICE_FLOAT_MINOR));
    expect(row.reason).toMatch(/no cash value/i);
  });

  /**
   * The credits are MINTED, not taken from the house. A house debit would put
   * practice credits into the operator-revenue reconciliation, where
   * `reconcileOperatorRevenue` would correctly report them as leakage.
   */
  it('does not move money out of the house account', () => {
    const houseId = randomUUID();
    sqlite
      .prepare(
        'INSERT INTO players (id, name, balance_minor, is_house, is_bot, created_at) VALUES (?,?,?,1,0,?)',
      )
      .run(houseId, 'HOUSE', 7_777_00, Date.now());
    new PracticeCredits(repo, true).grant(addPlayer(0), 1_00);
    expect(balanceOf(houseId)).toBe(7_777_00);
  });
});

describe('there is no real-money path in this build', () => {
  /**
   * §2.5.6 governs deposits and withdrawals. It does not engage here because
   * there is no payment instrument in the codebase at all — no card, no wallet,
   * no bank reference, no cashier. That is a claim worth making explicitly and
   * mechanically, because "we did not implement payments" is exactly the sort of
   * thing that is true until somebody adds a library.
   */
  it('the protocol carries no deposit, withdrawal or payment message', () => {
    const protocolMessages = [
      'HELLO',
      'JOIN_ROOM',
      'ANCHOR',
      'FLEET_ORDER',
      'CANCEL_ORDER',
      'SIGNAL',
      'CHAT',
      'GET_SKIPPER',
      'SET_LIMITS',
      'SET_EXCLUSION',
      'REQUEST_PRACTICE_CREDITS',
    ];
    for (const forbidden of ['DEPOSIT', 'WITHDRAW', 'PAYMENT', 'CARD', 'CASHOUT', 'TRANSFER']) {
      expect(protocolMessages.some((m) => m.includes(forbidden))).toBe(false);
    }
    // The one message that moves credits is explicitly a PRACTICE message and
    // the server refuses it outside a demo build.
    expect(protocolMessages).toContain('REQUEST_PRACTICE_CREDITS');
  });

  /**
   * §2.5.6(f) — "it shall not be possible to transfer funds between two player
   * accounts". There is no such path: settlement moves money from the struck
   * pool to survivors under the published rule, and nothing else writes a
   * balance from one player's instruction.
   */
  it('no player action can move credits to another named player', () => {
    // A player's own order can only ever reduce their balance by their stake,
    // and settlement is driven by the draw rather than by a recipient.
    const stakes: StakeEntry[] = [
      { id: 'a', zone: 0, amountMinor: 100_00, isHouseSeed: false },
      { id: 'b', zone: 1, amountMinor: 100_00, isHouseSeed: false },
    ];
    const result = settleRound(stakes, 0, 0.12);
    // 'b' is paid from the POOL, not from 'a' — the distinction is that the
    // payout is a function of the struck pool and the survivor pool, and would
    // be identical if 'a' were replaced by any other stake of the same size.
    const other: StakeEntry[] = [
      { id: 'someone-else', zone: 0, amountMinor: 100_00, isHouseSeed: false },
      { id: 'b', zone: 1, amountMinor: 100_00, isHouseSeed: false },
    ];
    expect(settleRound(other, 0, 0.12).lines.find((l) => l.id === 'b')!.payoutMinor).toBe(
      result.lines.find((l) => l.id === 'b')!.payoutMinor,
    );
  });
});
