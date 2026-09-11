/**
 * THE ROUND LOOP UNDER FAULT — the two ways the game used to stop dealing.
 *
 * Both were invisible in normal running and both cost players money, which is
 * the combination that makes them worth a test file of their own rather than a
 * line in an existing one.
 *
 *   1. SEED-CHAIN EXHAUSTION. A season is `SEED_CHAIN_LENGTH` rounds — about 55
 *      hours at the shipped 20-second heartbeat. `consume()` threw at the end of
 *      it, from inside a `setTimeout` callback, so the loop simply stopped. It
 *      never showed up in testing because `ensureChain` mints a fresh season at
 *      BOOT, so a restart always looked healthy. Order 240 Art. 3.1 requires
 *      continuous 24-hour operation.
 *
 *   2. AN EXCEPTION IN A PHASE TRANSITION. A player's balance is debited when
 *      their order is ACCEPTED, seconds before `lock()` persists the stakes. A
 *      throw in `lock()` therefore left the money gone, no stake rows written,
 *      no settlement coming, and — because the throw escaped a timer callback —
 *      no further rounds either. GLI-19 §4.16.2 requires wagers in an
 *      interrupted game to be held and the account to reflect them; §A.6.4
 *      requires them returned when the game cannot be completed.
 *
 * The tests below drive both faults for real rather than asserting on the shape
 * of the code: the chain is given a short season and consumed past its end, and
 * the repository is wrapped so one specific write throws once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { chainCommitment, roundSeed, verifyChainLink } from '@landfall/core';
import { openDb, type Db, type Sqlite } from '../src/db/index.js';
import { players, rounds, significantEvents } from '../src/db/schema.js';
import { ensureChain } from '../src/chain.js';
import { DEFAULT_ROOM, RoundCoordinator, type RoomConfig, type Timings } from '../src/coordinator.js';
import { DrizzleSqliteRepository } from '../src/db/repository.js';

const TIMINGS: Timings = { anchorMs: 1_000, stormMs: 500, resolvedMs: 200, cooldownMs: 200 };
const ROUND_MS = TIMINGS.anchorMs + TIMINGS.stormMs + TIMINGS.resolvedMs + TIMINGS.cooldownMs + 20;

const noopEvents = {
  broadcast() {},
  sendToPlayer() {},
  broadcastLandfall() {},
  systemMessage() {},
};

const cfg: RoomConfig = {
  ...DEFAULT_ROOM,
  roomId: 'resilience',
  name: 'Resilience',
  timings: TIMINGS,
  seedMinor: 25_00,
  liquidityFloorMinor: 90_00,
  minSeedMinor: 1_00,
  minStakeMinor: 1_00,
  maxStakeMinor: 500_00,
};

describe('round-loop resilience', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;

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
  });

  afterEach(() => {
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

  // -------------------------------------------------------------------------
  // 1. Seed-chain season rollover
  // -------------------------------------------------------------------------

  describe('seed-chain exhaustion (Order 240 Art. 3.1)', () => {
    /**
     * A short season, consumed one past its end. Before the fix that last call
     * threw; now it mints the next season, publishes its commitment first, and
     * hands back a seed that verifies against it.
     */
    it('rolls the season over instead of throwing, and the new chain verifies', () => {
      // A short season: the rollover logic is length-independent, and the
      // shipped 10,000 would cost ~50 million chained hashes to walk twice.
      const SEASON = 24;
      const chain = ensureChain(db, SEASON);
      const seen: string[] = [];
      chain.onRollover((c) => seen.push(c));

      const first = chain.commitment;
      const consumed: { seedHex: string; prevChainValue: string; chainIndex: number }[] = [];
      // Burn the whole season plus one.
      for (let i = 0; i < SEASON + 1; i++) consumed.push(chain.consume());

      expect(seen).toHaveLength(1);
      expect(chain.commitment).toBe(seen[0]);
      expect(chain.commitment).not.toBe(first);

      // The last draw belongs to the NEW season and is its first link, so it
      // must hash to the commitment that was published before it was drawn.
      const rolled = consumed.at(-1)!;
      expect(rolled.chainIndex).toBe(1);
      expect(rolled.prevChainValue).toBe(chain.commitment);
      expect(verifyChainLink(rolled.seedHex, rolled.prevChainValue)).toBe(true);

      // …and every link of the OLD season still verifies, which is the property
      // that makes a rollover safe rather than merely convenient.
      for (let i = 1; i < SEASON; i++) {
        expect(verifyChainLink(consumed[i]!.seedHex, consumed[i - 1]!.seedHex)).toBe(true);
      }
      expect(verifyChainLink(consumed[0]!.seedHex, first)).toBe(true);
    });

    it('keeps dealing rounds across the boundary', () => {
      // A season of exactly two rounds, so the loop crosses the boundary fast.
      const terminal = 'a'.repeat(64);
      const LENGTH = 2;
      let index = 0;
      let commitment = chainCommitment(terminal, LENGTH);
      const chain = {
        get commitment() {
          return commitment;
        },
        length: LENGTH,
        onRollover() {},
        consume() {
          if (index >= LENGTH) {
            // Exactly what the real implementation does at exhaustion.
            index = 0;
            commitment = chainCommitment(`${'b'.repeat(63)}${index}`, LENGTH);
          }
          index += 1;
          return {
            chainIndex: index,
            seedHex: roundSeed(terminal, LENGTH, index),
            prevChainValue: index === 1 ? commitment : roundSeed(terminal, LENGTH, index - 1),
          };
        },
      };

      const coordinator = new RoundCoordinator(repo, chain, noopEvents, cfg);
      coordinator.start();
      for (let i = 0; i < 5; i++) vi.advanceTimersByTime(ROUND_MS);
      coordinator.stop();

      // Five rounds across two-and-a-half seasons: every one of them settled.
      const settled = db
        .select()
        .from(rounds)
        .all()
        .filter((r) => r.settledAt !== null);
      expect(settled.length).toBeGreaterThanOrEqual(4);
      expect(db.select().from(rounds).all().every((r) => r.voidedAt === null)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. A phase transition that throws
  // -------------------------------------------------------------------------

  describe('a failing phase transition (GLI-19 §4.16.2, §A.6.4)', () => {
    /**
     * A repository whose `insertStake` throws the first time it is called.
     * `lock()` persists stakes inside a transaction, so this is the realistic
     * shape of the fault: a constraint violation or a disk error at exactly the
     * moment the bets become real.
     */
    function repoFailingOnce(method: 'insertStake'): DrizzleSqliteRepository {
      const wrapped = new DrizzleSqliteRepository(db, sqlite);
      let fired = false;
      const original = wrapped[method].bind(wrapped);
      (wrapped as any)[method] = (...args: unknown[]) => {
        if (!fired) {
          fired = true;
          throw new Error('simulated storage failure');
        }
        return (original as any)(...args);
      };
      return wrapped;
    }

    it('refunds every accepted bet rather than stranding it', () => {
      const failing = repoFailingOnce('insertStake');
      const chain = ensureChain(db);
      const coordinator = new RoundCoordinator(failing, chain, noopEvents, cfg);
      coordinator.start();

      const playerId = addPlayer('Mira');
      const opening = balanceOf(playerId);
      const accepted = coordinator.anchor(playerId, 'Mira', 2, 20_00);
      expect(accepted.ok).toBe(true);
      // The debit happens at accept time — this is the money that used to vanish.
      expect(balanceOf(playerId)).toBe(opening - 20_00);

      // Drive through the lock that will throw.
      vi.advanceTimersByTime(TIMINGS.anchorMs + 20);

      expect(balanceOf(playerId)).toBe(opening);
      const voided = db
        .select()
        .from(rounds)
        .all()
        .filter((r) => r.voidedAt !== null);
      expect(voided).toHaveLength(1);
      expect(voided[0]!.voidReason).toContain('lock');

      // §A.6.4's "inform the regulatory body" limb: the incident is on record.
      const incidents = db
        .select()
        .from(significantEvents)
        .all()
        .filter((e) => e.incident);
      expect(incidents.some((e) => e.category === 'INCIDENT')).toBe(true);

      coordinator.stop();
    });

    it('keeps dealing after the failure — one bad round does not end the game', () => {
      const failing = repoFailingOnce('insertStake');
      const chain = ensureChain(db);
      const coordinator = new RoundCoordinator(failing, chain, noopEvents, cfg);
      coordinator.start();

      const playerId = addPlayer('Nils');
      coordinator.anchor(playerId, 'Nils', 1, 20_00);
      vi.advanceTimersByTime(ROUND_MS * 4);
      coordinator.stop();

      const all = db.select().from(rounds).all();
      expect(all.filter((r) => r.voidedAt !== null)).toHaveLength(1);
      // …and the rounds after it settled normally.
      expect(all.filter((r) => r.settledAt !== null).length).toBeGreaterThanOrEqual(2);
    });

    it('never refunds the same round twice', () => {
      const chain = ensureChain(db);
      const coordinator = new RoundCoordinator(repo, chain, noopEvents, cfg);
      coordinator.start();
      const playerId = addPlayer('Osk');
      const opening = balanceOf(playerId);
      coordinator.anchor(playerId, 'Osk', 0, 20_00);

      // Reach into the void path twice, which is what a second fault in the
      // same round would do. A void does not set `settled_at`, so the DB guard
      // alone would not have caught this.
      const asAny = coordinator as any;
      asAny.voidRound('first');
      asAny.voidRound('second');

      expect(balanceOf(playerId)).toBe(opening);
      coordinator.stop();
    });
  });
});
