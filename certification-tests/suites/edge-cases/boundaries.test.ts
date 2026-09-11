/**
 * BOUNDARIES, GUARDS AND HOSTILE INPUT.
 *
 * GLI-19 §4.2.3 requires that simultaneous or sequential player input cannot
 * cause a malfunction or a result contrary to design intent, and §4.2.2(c)
 * requires that there be no hidden control that affects the outcome. Neither is
 * a statement about a happy path, so this file is about the unhappy ones: the
 * limits of the stake range, the configuration validators, the responsible-
 * gambling gates, and a fuzz over the accept path.
 *
 * The guiding question throughout is the one a laboratory actually asks: CAN A
 * PLAYER, OR A MISCONFIGURATION, PUT THE GAME IN A STATE ITS RULES DO NOT
 * DESCRIBE? Every answer below is no, and each one says how it is prevented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  MAX_STAKE_MINOR,
  MIN_STAKE_MINOR,
  RAKE_MAX,
  RAKE_MIN,
  WHALE_CAP_FRACTION,
  ZONE_COUNT,
  clientMessage,
  validateRakeConfig,
} from '@landfall/core';
import { openDb, type Db, type Sqlite } from '@landfall/server-src/db/index';
import { DrizzleSqliteRepository } from '@landfall/server-src/db/repository';
import {
  DEFAULT_ROOM,
  RoundCoordinator,
  type RoomConfig,
  type Timings,
} from '@landfall/server-src/coordinator';
import { resolveRoomConfig } from '@landfall/server-src/rooms';
import { LimitsService } from '@landfall/server-src/limits';
import { chainCommitment, roundSeed } from '@landfall/core';

const TERMINAL = 'b2'.repeat(32);
const LEN = 3_000;
const TIMINGS: Timings = { anchorMs: 60_000, stormMs: 500, resolvedMs: 200, cooldownMs: 200 };
const REANCHOR_MS = 200;

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

const silent = {
  broadcast() {},
  sendToPlayer() {},
  broadcastLandfall() {},
  systemMessage() {},
};

const cfg: RoomConfig = {
  ...DEFAULT_ROOM,
  roomId: 'edges',
  name: 'Edges',
  timings: TIMINGS,
  seedMinor: 25_00,
  liquidityFloorMinor: 90_00,
  minSeedMinor: 1_00,
  minStakeMinor: 1_00,
  maxStakeMinor: 500_00,
  surgeProb: 0,
};

describe('GLI-19 §4.2.2 — the wire protocol rejects by default', () => {
  /**
   * Every inbound frame is schema-validated before it reaches the game, so an
   * undocumented field cannot become an undocumented control. The schema is the
   * exhaustive list of what a client may say.
   */
  it('refuses malformed, unknown and out-of-range messages', () => {
    const bad: unknown[] = [
      null,
      42,
      'ANCHOR',
      {},
      { type: 'NOT_A_MESSAGE' },
      { type: 'ANCHOR' }, // missing fields
      { type: 'ANCHOR', zone: -1, stakeMinor: 100 },
      { type: 'ANCHOR', zone: ZONE_COUNT, stakeMinor: 100 }, // one past the last harbour
      { type: 'ANCHOR', zone: 1.5, stakeMinor: 100 },
      { type: 'ANCHOR', zone: 0, stakeMinor: 0 },
      { type: 'ANCHOR', zone: 0, stakeMinor: -100 },
      { type: 'ANCHOR', zone: 0, stakeMinor: 10.5 },
      { type: 'ANCHOR', zone: 0, stakeMinor: MAX_STAKE_MINOR + 1 },
      { type: 'ANCHOR', zone: 0, stakeMinor: Number.MAX_SAFE_INTEGER },
      { type: 'ANCHOR', zone: 0, stakeMinor: Number.POSITIVE_INFINITY },
      { type: 'ANCHOR', zone: 0, stakeMinor: Number.NaN },
      { type: 'CHAT', text: 'x'.repeat(10_000) },
    ];
    for (const message of bad) {
      expect(clientMessage.safeParse(message).success, JSON.stringify(message)).toBe(false);
    }
  });

  /**
   * WHERE THE SCHEMA STOPS AND THE GAME BEGINS. A split order with no second
   * harbour is structurally well-formed and semantically nonsense, so the schema
   * accepts it and the ACCEPT PATH refuses it (`BAD_SPLIT`, asserted below).
   * That split of responsibility is deliberate and worth recording: the schema's
   * job is to bound what can be parsed, and the game's job is to decide what can
   * be played. Neither can be relied on alone.
   */
  it('leaves semantic rules to the game rather than to the schema', () => {
    expect(
      clientMessage.safeParse({
        type: 'FLEET_ORDER',
        mode: 'SPLIT',
        primaryZone: 0,
        stakeMinor: 100,
      }).success,
    ).toBe(true);
  });

  it('accepts exactly the documented messages at their boundaries', () => {
    const good: unknown[] = [
      { type: 'HELLO' },
      { type: 'ANCHOR', zone: 0, stakeMinor: MIN_STAKE_MINOR },
      { type: 'ANCHOR', zone: ZONE_COUNT - 1, stakeMinor: MAX_STAKE_MINOR },
      { type: 'FLEET_ORDER', mode: 'FOCUS', primaryZone: 2, stakeMinor: 500 },
      { type: 'FLEET_ORDER', mode: 'SPLIT', primaryZone: 2, secondaryZone: 3, stakeMinor: 500 },
      { type: 'CANCEL_ORDER' },
      { type: 'SIGNAL', zone: 1, kind: 'RALLY' },
      { type: 'REQUEST_PRACTICE_CREDITS' },
    ];
    for (const message of good) {
      expect(clientMessage.safeParse(message).success, JSON.stringify(message)).toBe(true);
    }
  });
});

describe('configuration guards — a bad room cannot start', () => {
  it('refuses a rake outside the permitted range, or a split that does not sum to 1', () => {
    expect(() => validateRakeConfig(RAKE_MIN - 0.001, { house: 0.5, surge: 0.25, stormReserve: 0.25 })).toThrow();
    expect(() => validateRakeConfig(RAKE_MAX + 0.001, { house: 0.5, surge: 0.25, stormReserve: 0.25 })).toThrow();
    expect(() => validateRakeConfig(0.12, { house: 0.5, surge: 0.25, stormReserve: 0.3 })).toThrow(/sum to 1/);
    expect(() => validateRakeConfig(0.12, { house: -0.1, surge: 0.55, stormReserve: 0.55 })).toThrow(/non-negative/);
    expect(() => validateRakeConfig(Number.NaN, { house: 0.5, surge: 0.25, stormReserve: 0.25 })).toThrow();
    // …and the shipped values are inside it.
    expect(() => validateRakeConfig(0.12, { house: 0.5, surge: 0.25, stormReserve: 0.25 })).not.toThrow();
  });

  it('refuses a stake tier outside the protocol bounds or inverted', () => {
    expect(() =>
      resolveRoomConfig({ roomId: 'x', name: 'X', minStakeMinor: 500_00, maxStakeMinor: 1_00 }, DEFAULT_ROOM, false),
    ).toThrow(/minStake > maxStake/);
  });

  /**
   * The guard that makes a room PLAYABLE rather than merely valid. The 25%
   * round-share cap on an empty table is a third of the guaranteed liquidity;
   * if that is below the table's own minimum bet, the first bettor of every
   * round is rejected by a rule meant for whales and nobody can ever start.
   */
  it('refuses a room where the round-share cap would reject the first bet', () => {
    expect(() =>
      resolveRoomConfig(
        {
          roomId: 'x',
          name: 'X',
          minStakeMinor: 500_00,
          maxStakeMinor: 5_000_00,
          seedMinor: 500_00,
          minSeedMinor: 500_00,
          liquidityFloorMinor: 100, // far too thin for this tier's minimum bet
        },
        DEFAULT_ROOM,
        false,
      ),
    ).toThrow(/round-share cap/);
  });

  it('refuses a practice bot too poor to play the table it sits at', () => {
    expect(() =>
      resolveRoomConfig(
        {
          roomId: 'x',
          name: 'X',
          minStakeMinor: 5_000_00,
          maxStakeMinor: 500_000_00,
          seedMinor: 6_250_00,
          minSeedMinor: 5_000_00,
          liquidityFloorMinor: 22_500_00,
          botsAllowed: true,
          botBankrollMinor: 1_00, // cannot cover one bet at this table
        },
        DEFAULT_ROOM,
        true,
      ),
    ).toThrow(/botBankrollMinor/);
  });

  it('refuses a seed floor above the seed ceiling', () => {
    expect(() =>
      resolveRoomConfig(
        { roomId: 'x', name: 'X', seedMinor: 1_00, minSeedMinor: 50_00 },
        DEFAULT_ROOM,
        false,
      ),
    ).toThrow(/exceeds the seed ceiling/);
  });
});

describe('the accept path under hostile and boundary input', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;
  let coordinator: RoundCoordinator;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
    sqlite
      .prepare('INSERT INTO players (id, name, balance_minor, is_house, is_bot, created_at) VALUES (?,?,?,1,0,?)')
      .run(randomUUID(), 'HOUSE', 100_000_000_00, Date.now());
    coordinator = new RoundCoordinator(repo, fakeChain(), silent, cfg);
    coordinator.start();
  });
  afterEach(() => {
    coordinator.stop();
    sqlite.close();
    vi.useRealTimers();
  });

  const addPlayer = (balance = 10_000_00): string => {
    const id = randomUUID();
    sqlite
      .prepare('INSERT INTO players (id, name, balance_minor, is_house, is_bot, created_at) VALUES (?,?,?,0,0,?)')
      .run(id, `P${id.slice(0, 8)}`, balance, Date.now());
    return id;
  };
  const balanceOf = (id: string): number =>
    (sqlite.prepare('SELECT balance_minor AS b FROM players WHERE id = ?').get(id) as { b: number }).b;

  it('refuses a stake outside the room tier, at both ends', () => {
    const id = addPlayer();
    const below = coordinator.anchor(id, 'P', 0, cfg.minStakeMinor - 1);
    expect(below.ok).toBe(false);
    if (!below.ok) expect(below.code).toBe('STAKE_OUT_OF_TIER');
    vi.advanceTimersByTime(REANCHOR_MS);
    const above = coordinator.anchor(id, 'P', 0, cfg.maxStakeMinor + 1);
    expect(above.ok).toBe(false);
    if (!above.ok) expect(above.code).toBe('STAKE_OUT_OF_TIER');
    expect(balanceOf(id)).toBe(10_000_00);
  });

  /**
   * §B5 — the round-share cap. It exists so no single player can hold more than
   * a quarter of a round, which caps both payout domination and the leverage a
   * whale has over what everyone else can read from the pools.
   */
  it('holds the round-share cap, and the cap rises as players arrive', () => {
    const a = addPlayer();
    const deadTableCap = Math.floor(
      (WHALE_CAP_FRACTION / (1 - WHALE_CAP_FRACTION)) * cfg.liquidityFloorMinor,
    );
    const over = coordinator.anchor(a, 'A', 0, deadTableCap + 1_00);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe('WHALE_CAP');

    vi.advanceTimersByTime(REANCHOR_MS);
    expect(coordinator.anchor(a, 'A', 0, deadTableCap).ok).toBe(true);

    // A second player raises everybody's ceiling, because the cap is a share of
    // the round rather than a fixed number.
    const b = addPlayer();
    vi.advanceTimersByTime(REANCHOR_MS);
    expect(coordinator.anchor(b, 'B', 1, deadTableCap + 1_00).ok).toBe(true);
  });

  it('refuses a split order onto the same harbour twice', () => {
    const id = addPlayer();
    const r = coordinator.fleetOrder(id, 'P', 'SPLIT', 2, 2, 10_00);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BAD_SPLIT');
  });

  /**
   * §4.2.3 — repeated and rapid input must not produce a state the rules do not
   * describe. The guard is a minimum interval between orders; the property that
   * matters is that a player's committed stake and their balance always agree,
   * however many orders they fire.
   */
  it('survives a burst of orders with the balance always reconciling', () => {
    const id = addPlayer();
    const opening = balanceOf(id);
    let committed = 0;
    for (let i = 0; i < 200; i++) {
      vi.advanceTimersByTime(REANCHOR_MS);
      const stake = cfg.minStakeMinor + ((i * 7) % 20) * cfg.minStakeMinor;
      const r = coordinator.anchor(id, 'P', i % ZONE_COUNT, stake);
      if (r.ok) committed = stake;
      // The invariant, checked after EVERY order, accepted or refused.
      expect(balanceOf(id)).toBe(opening - committed);
    }
    expect(coordinator.yourFleet(id)?.stakeMinor).toBe(committed);
  });

  it('refuses every order once the round has locked', () => {
    const id = addPlayer();
    vi.advanceTimersByTime(TIMINGS.anchorMs + 20);
    const r = coordinator.anchor(id, 'P', 0, 10_00);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ROUND_LOCKED');
    expect(coordinator.cancelOrder(id).ok).toBe(false);
    expect(coordinator.signal(id, 'P', 0, 'RALLY').ok).toBe(false);
  });

  it('refuses an order from a player the server does not know', () => {
    const r = coordinator.anchor('not-a-player', 'Ghost', 0, 10_00);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NO_PLAYER');
  });

  it('refuses a signal from a player with no anchored fleet', () => {
    const id = addPlayer();
    const r = coordinator.signal(id, 'P', 0, 'RALLY');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SIGNAL_NEEDS_FLEET');
  });
});

describe('responsible gambling gates are server-side, not client cosmetics', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;
  let limits: LimitsService;
  let coordinator: RoundCoordinator;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
    sqlite
      .prepare('INSERT INTO players (id, name, balance_minor, is_house, is_bot, created_at) VALUES (?,?,?,1,0,?)')
      .run(randomUUID(), 'HOUSE', 100_000_000_00, Date.now());
    limits = new LimitsService(repo);
    coordinator = new RoundCoordinator(repo, fakeChain(), silent, cfg, limits);
    coordinator.start();
  });
  afterEach(() => {
    coordinator.stop();
    sqlite.close();
    vi.useRealTimers();
  });

  const addPlayer = (): string => {
    const id = randomUUID();
    sqlite
      .prepare('INSERT INTO players (id, name, balance_minor, is_house, is_bot, created_at) VALUES (?,?,?,0,0,?)')
      .run(id, `P${id.slice(0, 8)}`, 100_000_00, Date.now());
    return id;
  };

  it('enforces a self-imposed per-round stake cap on the accept path', () => {
    const id = addPlayer();
    limits.setLimits(id, { stakePerRoundCapMinor: 5_00 });
    const refused = coordinator.anchor(id, 'P', 0, 10_00);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe('LIMIT_STAKE');
    vi.advanceTimersByTime(REANCHOR_MS);
    expect(coordinator.anchor(id, 'P', 0, 5_00).ok).toBe(true);
  });

  it('enforces self-exclusion, and exclusion only ever extends', () => {
    const id = addPlayer();
    limits.setExclusion(id, 60);
    const refused = coordinator.anchor(id, 'P', 0, 5_00);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe('EXCLUDED');

    // A shorter request is a no-op: a break cannot be cut short in the moment
    // it is most tempting to cut it short.
    const before = limits.getState(id).excludedUntil;
    limits.setExclusion(id, 1);
    expect(limits.getState(id).excludedUntil).toBe(before);
    // A longer one extends it.
    limits.setExclusion(id, 120);
    expect(limits.getState(id).excludedUntil!).toBeGreaterThan(before!);
  });

  /**
   * Tightening a limit is immediate; LOOSENING one waits out a cooldown. That
   * asymmetry is the whole point — a limit a player can lift in the moment they
   * want to exceed it is not a limit.
   */
  it('applies a tightened limit at once and defers a loosened one', () => {
    const id = addPlayer();
    const now = Date.now();
    limits.setLimits(id, { stakePerRoundCapMinor: 50_00 }, now);
    expect(limits.getState(id, now).stakePerRoundCapMinor).toBe(50_00);

    // Tighter: immediate.
    limits.setLimits(id, { stakePerRoundCapMinor: 10_00 }, now);
    expect(limits.getState(id, now).stakePerRoundCapMinor).toBe(10_00);

    // Looser: queued, and still enforced at the tighter value meanwhile.
    limits.setLimits(id, { stakePerRoundCapMinor: 500_00 }, now);
    expect(limits.getState(id, now).stakePerRoundCapMinor).toBe(10_00);
    expect(limits.getState(id, now).pending).toHaveLength(1);
    const refused = coordinator.anchor(id, 'P', 0, 100_00);
    expect(refused.ok).toBe(false);

    // …and it matures after the cooldown.
    const later = now + 25 * 60 * 60 * 1_000;
    expect(limits.getState(id, later).stakePerRoundCapMinor).toBe(500_00);
  });

  it('counts committed stake against the daily loss limit before it is lost', () => {
    const id = addPlayer();
    limits.setLimits(id, { dailyLossLimitMinor: 15_00 });
    expect(coordinator.anchor(id, 'P', 0, 10_00).ok).toBe(true);
    vi.advanceTimersByTime(REANCHOR_MS);
    // A second order that would take the committed total past the limit is
    // refused even though nothing has been lost yet.
    const refused = coordinator.anchor(id, 'P', 0, 20_00);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe('LIMIT_LOSS');
  });
});
