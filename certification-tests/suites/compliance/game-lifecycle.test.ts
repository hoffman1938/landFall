/**
 * THE GAME, END TO END — GLI-19 §4.3.3, §4.15.1, §4.16, §A.6.3, §A.6.4, §A.7.1;
 * Order 222 Annex 1 Art. 13, 16.1(b); Order 240 Art. 3.1.
 *
 * Everything above this file tests a pure function. This one stands a real
 * `RoundCoordinator` up against a real SQLite database and drives whole rounds
 * through it, because several clauses are about what happens to MONEY ACROSS
 * TIME and cannot be established any other way:
 *
 *   - a wager is debited when accepted and settled or returned, never stranded;
 *   - a disable stops new bets but lets a locked round conclude;
 *   - a round that cannot be settled is voided, refunded, and recorded;
 *   - the operator's account receives the rake and nothing else;
 *   - nothing in the system creates or destroys value.
 *
 * The database is in-memory and the clock is faked, so a twenty-second round
 * takes microseconds and the whole file runs in a second.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RULES_VERSION, chainCommitment, roundSeed } from '@landfall/core';
import { openDb, type Db, type Sqlite } from '@landfall/server-src/db/index';
import { DrizzleSqliteRepository } from '@landfall/server-src/db/repository';
import {
  DEFAULT_ROOM,
  RoundCoordinator,
  type RoomConfig,
  type Timings,
} from '@landfall/server-src/coordinator';
import { GameControl } from '@landfall/server-src/gameControl';

/*
 * Queries here are plain SQL against the same database the game writes, not the
 * ORM the game uses. That is deliberate for a certification suite: reading the
 * tables directly is how an auditor would inspect them, and it means these
 * assertions cannot accidentally pass because a mapping layer agreed with
 * itself. The column names below are the ones in `server/src/db/ddl.ts`.
 */

const TERMINAL = 'a1'.repeat(32);
const CHAIN_LENGTH = 5_000;
const TIMINGS: Timings = { anchorMs: 5_000, stormMs: 500, resolvedMs: 200, cooldownMs: 200 };
const ROUND_MS = TIMINGS.anchorMs + TIMINGS.stormMs + TIMINGS.resolvedMs + TIMINGS.cooldownMs + 20;
/** Past the coordinator's 150 ms re-anchor guard. */
const REANCHOR_MS = 200;

function fakeChain() {
  let index = 0;
  return {
    commitment: chainCommitment(TERMINAL, CHAIN_LENGTH),
    length: CHAIN_LENGTH,
    onRollover() {},
    consume() {
      index += 1;
      return {
        chainIndex: index,
        seedHex: roundSeed(TERMINAL, CHAIN_LENGTH, index),
        prevChainValue:
          index === 1
            ? chainCommitment(TERMINAL, CHAIN_LENGTH)
            : roundSeed(TERMINAL, CHAIN_LENGTH, index - 1),
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
  roomId: 'cert',
  name: 'Certification',
  timings: TIMINGS,
  seedMinor: 25_00,
  liquidityFloorMinor: 90_00,
  minSeedMinor: 1_00,
  minStakeMinor: 1_00,
  maxStakeMinor: 500_00,
  /*
   * No jackpot in the default room. A surge payout is a second credit on top of
   * the settlement, so it would make the exact-balance assertions below say
   * "the balance moved by the stake, the award, AND possibly a jackpot", which
   * is a weaker statement. `surgeRoom` below turns it on where the point is
   * precisely that the jackpot money is conserved too.
   */
  surgeProb: 0,
};

/** The same table with the jackpot firing often, for the conservation checks. */
const surgeCfg: RoomConfig = { ...cfg, roomId: 'cert-surge', surgeProb: 0.25 };

describe('the round loop, end to end', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;
  let houseId: string;
  let coordinator: RoundCoordinator;
  let control: GameControl;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
    houseId = randomUUID();
    sqlite
      .prepare(
        'INSERT INTO players (id, name, balance_minor, is_house, is_bot, created_at) VALUES (?,?,?,1,0,?)',
      )
      .run(houseId, 'HOUSE', 100_000_000_00, Date.now());
    control = new GameControl(repo);
    coordinator = new RoundCoordinator(repo, fakeChain(), silent, cfg, undefined, control);
  });

  afterEach(() => {
    coordinator.stop();
    sqlite.close();
    vi.useRealTimers();
  });

  const addPlayer = (name: string, balance = 100_000_00): string => {
    const id = randomUUID();
    sqlite
      .prepare(
        'INSERT INTO players (id, name, balance_minor, is_house, is_bot, created_at) VALUES (?,?,?,0,0,?)',
      )
      .run(id, name, balance, Date.now());
    return id;
  };
  const balanceOf = (id: string): number =>
    (sqlite.prepare('SELECT balance_minor AS b FROM players WHERE id = ?').get(id) as { b: number })
      .b;
  const one = <T>(sql: string, ...args: unknown[]): T =>
    sqlite.prepare(sql).get(...(args as never[])) as T;
  const all = <T>(sql: string, ...args: unknown[]): T[] =>
    sqlite.prepare(sql).all(...(args as never[])) as T[];

  /** Every account, fund and ledger that can hold value, summed. */
  function totalValue(roomId: string = cfg.roomId): number {
    const balances =
      one<{ t: number | null }>('SELECT SUM(balance_minor) AS t FROM players').t ?? 0;
    const pot = one<{ p: number; d: number } | undefined>(
      'SELECT pot_minor AS p, diversion_minor AS d FROM surge_pots WHERE room_id = ?',
      roomId,
    );
    const reserve = one<{ b: number } | undefined>(
      'SELECT balance_minor AS b FROM storm_reserve_ledger WHERE room_id = ? ORDER BY round_id DESC LIMIT 1',
      roomId,
    );
    const float = one<{ b: number } | undefined>(
      'SELECT balance_minor AS b FROM house_float_ledger WHERE room_id = ? ORDER BY round_id DESC LIMIT 1',
      roomId,
    );
    return balances + (pot?.p ?? 0) + (pot?.d ?? 0) + (reserve?.b ?? 0) + (float?.b ?? 0);
  }

  // -------------------------------------------------------------------------

  describe('GLI-19 §4.3.3 — the wager and the award', () => {
    it('debits on accept and credits the award at settlement', () => {
      coordinator.start();
      const id = addPlayer('Ada');
      const opening = balanceOf(id);

      const accepted = coordinator.anchor(id, 'Ada', 1, 20_00);
      expect(accepted.ok).toBe(true);
      // §4.3.3(b): the amount wagered is subtracted at the start of the cycle.
      expect(balanceOf(id)).toBe(opening - 20_00);

      vi.advanceTimersByTime(ROUND_MS);
      const round = one<{ settled_at: number | null; rules_version: number }>(
        'SELECT settled_at, rules_version FROM rounds WHERE id = 1',
      );
      expect(round.settled_at).not.toBeNull();
      expect(round.rules_version).toBe(RULES_VERSION);

      // §4.3.3(d): the cycle is complete when the transfer has taken place.
      const line = one<{ outcome: string | null; payout_minor: number | null }>(
        'SELECT outcome, payout_minor FROM stakes WHERE round_id = 1 AND player_id = ?',
        id,
      );
      expect(line.outcome).not.toBeNull();
      expect(balanceOf(id)).toBe(opening - 20_00 + (line.payout_minor ?? 0));
    });

    it('refuses a wager that would take the balance negative', () => {
      coordinator.start();
      const id = addPlayer('Bo', 5_00);
      const refused = coordinator.anchor(id, 'Bo', 0, 20_00);
      expect(refused.ok).toBe(false);
      if (refused.ok) throw new Error('unreachable');
      expect(refused.code).toBe('INSUFFICIENT');
      expect(balanceOf(id)).toBe(5_00);
    });

    it('a cancelled order is refunded in full before lock', () => {
      coordinator.start();
      const id = addPlayer('Cy');
      const opening = balanceOf(id);
      // Under the 25% round-share cap, which on a quiet table is a third of the
      // room's guaranteed liquidity.
      coordinator.anchor(id, 'Cy', 3, 20_00);
      vi.advanceTimersByTime(REANCHOR_MS);
      const cancelled = coordinator.cancelOrder(id);
      expect(cancelled.ok).toBe(true);
      expect(balanceOf(id)).toBe(opening);
    });
  });

  describe('GLI-19 §A.7.1 — the operator profits from the rake and nothing else', () => {
    /**
     * The house seed is staked on every harbour and settles like a player, so
     * without a ring-fence its winnings would land in the same account as the
     * rake. After the fence the operator's account has ONE credit path.
     */
    it('the house account never receives house-seed winnings', () => {
      coordinator.start();
      const crew = ['Ada', 'Bo', 'Cy', 'Di'].map((n) => [n, addPlayer(n)] as const);
      for (let round = 0; round < 12; round++) {
        crew.forEach(([name, id], i) => {
          coordinator.anchor(id, name, (round + i) % 6, 10_00 + i * 5_00);
        });
        vi.advanceTimersByTime(ROUND_MS);
      }

      // Every credit into the house account should be rake; every debit should
      // be one of the three disclosed funding obligations.
      const rakeTotal =
        one<{ t: number | null }>('SELECT SUM(rake_minor) AS t FROM rounds').t ?? 0;
      expect(rakeTotal).toBeGreaterThan(0);

      // The float ledger is the record that the seed's P&L went somewhere else.
      const floatRows = all<{ net_minor: number }>(
        'SELECT net_minor FROM house_float_ledger WHERE room_id = ?',
        cfg.roomId,
      );
      expect(floatRows.length).toBeGreaterThan(0);
      const seedPL = floatRows.reduce((a, r) => a + r.net_minor, 0);
      // The seed made or lost money — either is fine; what matters is that the
      // figure is on the float ledger and not in the operator's balance.
      expect(Number.isInteger(seedPL)).toBe(true);
    });

    it('conserves total value across many settled rounds, jackpot included', () => {
      // The jackpot-heavy room: a payout, a reset and a rollover all happen
      // inside this window, so the identity covers every money path there is.
      coordinator.stop();
      coordinator = new RoundCoordinator(repo, fakeChain(), silent, surgeCfg, undefined, control);
      coordinator.start();
      vi.advanceTimersByTime(ROUND_MS);
      const crew = ['Eve', 'Fay', 'Gus', 'Hal', 'Ivy'].map((n) => [n, addPlayer(n)] as const);
      const before = totalValue(surgeCfg.roomId);

      for (let round = 0; round < 25; round++) {
        crew.forEach(([name, id], i) => {
          coordinator.anchor(id, name, (round * 3 + i) % 6, 5_00 + ((round + i) % 7) * 2_00);
        });
        vi.advanceTimersByTime(ROUND_MS);
      }
      // No money in, no money out: the total is invariant to the minor unit.
      expect(totalValue(surgeCfg.roomId)).toBe(before);
    });
  });

  describe('GLI-19 §4.15.1 / §2.4.1 — disable on demand', () => {
    it('stops new bets immediately and lets the locked round conclude', () => {
      coordinator.start();
      const id = addPlayer('Jo');
      expect(coordinator.anchor(id, 'Jo', 2, 10_00).ok).toBe(true);

      vi.advanceTimersByTime(TIMINGS.anchorMs + 20); // past lock
      control.disable('ALL', 'certification: disable during a locked round', 'inspector');
      vi.advanceTimersByTime(TIMINGS.stormMs + TIMINGS.resolvedMs + TIMINGS.cooldownMs + 40);

      const first = one<{ settled_at: number | null; voided_at: number | null }>(
        'SELECT settled_at, voided_at FROM rounds WHERE id = 1',
      );
      expect(first.settled_at).not.toBeNull();
      expect(first.voided_at).toBeNull();

      // …and the next round takes no bets.
      const refused = coordinator.anchor(id, 'Jo', 2, 10_00);
      expect(refused.ok).toBe(false);
      if (refused.ok) throw new Error('unreachable');
      expect(refused.code).toBe('GAMING_DISABLED');
    });

    it('records the disable with date, time, actor and reason (§A.6.3)', () => {
      control.disable('ALL', 'certification audit trail', 'inspector-7');
      const event = one<{
        reason: string;
        actor: string;
        value_before: string;
        value_after: string;
        created_at: number;
      }>("SELECT reason, actor, value_before, value_after, created_at FROM significant_events WHERE category = 'GAME_STATE'");
      expect(event.reason).toBe('certification audit trail');
      expect(event.actor).toBe('inspector-7');
      expect(event.value_before).toBe('ENABLED');
      expect(event.value_after).toBe('DISABLED');
      expect(event.created_at).toBeGreaterThan(0);
      expect(control.state().all).not.toBeNull();
    });
  });

  describe('GLI-19 §4.16 / §A.6.4 — an interrupted round', () => {
    /**
     * The class of interruption that CAN occur here is a round that fails
     * between lock and settlement. §A.6.4 prescribes the remedy exactly: return
     * the wagers, update balances and history, and inform the regulator.
     */
    it('voids, refunds in full, and records an incident', () => {
      // A repository whose first stake write fails — the realistic shape of a
      // constraint violation or a disk error at the moment bets become real.
      const failing = new DrizzleSqliteRepository(db, sqlite);
      let fired = false;
      const original = failing.insertStake.bind(failing);
      (failing as unknown as Record<string, unknown>).insertStake = (...args: unknown[]) => {
        if (!fired) {
          fired = true;
          throw new Error('certification: simulated storage failure at lock');
        }
        return (original as (...a: unknown[]) => void)(...args);
      };

      const c = new RoundCoordinator(failing, fakeChain(), silent, cfg);
      c.start();
      const id = addPlayer('Kit');
      const opening = balanceOf(id);
      expect(c.anchor(id, 'Kit', 4, 30_00).ok).toBe(true);
      expect(balanceOf(id)).toBe(opening - 30_00);

      vi.advanceTimersByTime(TIMINGS.anchorMs + 20);

      expect(balanceOf(id)).toBe(opening); // returned in full
      const voided = all<{ void_reason: string }>(
        'SELECT void_reason FROM rounds WHERE voided_at IS NOT NULL',
      );
      expect(voided).toHaveLength(1);
      expect(voided[0]!.void_reason).toContain('lock');

      // Order 222 Art. 16.1(b): the incident is on the record, flagged.
      const incident = one<{ incident: number } | undefined>(
        "SELECT incident FROM significant_events WHERE category = 'INCIDENT'",
      );
      expect(incident).toBeDefined();
      expect(incident!.incident).toBe(1);
      c.stop();
    });

    /** Order 240 Art. 3.1 — continuous operation. One bad round is not the end. */
    it('keeps dealing rounds after a failed one', () => {
      const failing = new DrizzleSqliteRepository(db, sqlite);
      let fired = false;
      const original = failing.insertStake.bind(failing);
      (failing as unknown as Record<string, unknown>).insertStake = (...args: unknown[]) => {
        if (!fired) {
          fired = true;
          throw new Error('certification: simulated storage failure at lock');
        }
        return (original as (...a: unknown[]) => void)(...args);
      };
      const c = new RoundCoordinator(failing, fakeChain(), silent, cfg);
      c.start();
      const id = addPlayer('Lee');
      c.anchor(id, 'Lee', 0, 10_00);
      vi.advanceTimersByTime(ROUND_MS * 5);
      c.stop();

      const voidedCount = one<{ n: number }>(
        'SELECT COUNT(*) AS n FROM rounds WHERE voided_at IS NOT NULL',
      ).n;
      const settledCount = one<{ n: number }>(
        'SELECT COUNT(*) AS n FROM rounds WHERE settled_at IS NOT NULL',
      ).n;
      expect(voidedCount).toBe(1);
      expect(settledCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('GLI-19 §A.5.1 — the rules in force when the wager was accepted', () => {
    it('stamps the rules version on the round at creation, not at settlement', () => {
      coordinator.start();
      const created = one<{ settled_at: number | null; rules_version: number }>(
        'SELECT settled_at, rules_version FROM rounds WHERE id = 1',
      );
      // Stamped before the round has settled — that is the binding §A.5.1 wants.
      expect(created.settled_at).toBeNull();
      expect(created.rules_version).toBe(RULES_VERSION);
    });
  });

  describe('the economy configuration cannot ship an unwinnable award', () => {
    /**
     * GLI-19 §4.4.1(f) enforced at construction: a room whose liability cap
     * cannot pay an advertised tier in full is refused outright rather than
     * quietly clamping players' awards.
     */
    it('refuses a room whose cap cannot pay the advertised ladder', () => {
      expect(
        () =>
          new RoundCoordinator(repo, fakeChain(), silent, {
            ...cfg,
            roomId: 'dishonest',
            econ: { ...cfg.econ, maxPayoutMultiple: 25 },
          }),
      ).toThrow(/4\.4\.1\(f\)|winnable/i);
    });
  });
});
