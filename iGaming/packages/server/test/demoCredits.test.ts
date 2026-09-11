/**
 * PRACTICE CREDITS — the demo build's dead end, and the rules of the way out.
 *
 * THE DEFECT. A player starts with `STARTING_BALANCE_MINOR` and nothing in the
 * system ever added to it. Bots topped themselves up; players did not. A demo
 * player who lost their float was finished: every order refused as INSUFFICIENT,
 * seated at the cheapest table and still unable to bet on it, with no path
 * forward anywhere in the product. In a build whose only mode is demo, that is
 * the product not working — and GLI-19 §4.9.1(a) asks a no-wager mode to
 * "accurately represent the normal operation of a paid game", which a permanent
 * lockout does not.
 *
 * What matters in the fix is the set of limits around it, because a top-up is
 * the one place a gaming system creates value out of nothing. These tests pin
 * each limit to the reason it exists rather than to its current number.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { openDb, type Db, type Sqlite } from '../src/db/index.js';
import { players, significantEvents } from '../src/db/schema.js';
import { DEMO_PRACTICE_FLOAT_MINOR, PracticeCredits } from '../src/demoCredits.js';
import { DrizzleSqliteRepository } from '../src/db/repository.js';

const CHEAPEST_MIN_STAKE = 1_00; // Skiff Harbor's minimum bet
const COOLDOWN_MS = 60_000;

describe('demo practice credits', () => {
  let db: Db;
  let sqlite: Sqlite;
  let repo: DrizzleSqliteRepository;

  beforeEach(() => {
    ({ db, sqlite } = openDb(':memory:'));
    repo = new DrizzleSqliteRepository(db, sqlite);
  });

  afterEach(() => sqlite.close());

  function addPlayer(balance: number): string {
    const id = randomUUID();
    db.insert(players)
      .values({ id, name: `P${id.slice(0, 6)}`, balanceMinor: balance, isHouse: false, createdAt: Date.now() })
      .run();
    return id;
  }

  const balanceOf = (id: string): number =>
    db.select().from(players).where(eq(players.id, id)).get()!.balanceMinor;

  const demo = () => new PracticeCredits(repo, true, DEMO_PRACTICE_FLOAT_MINOR, COOLDOWN_MS);

  it('restores a stranded player to the practice float — the defect this closes', () => {
    const credits = demo();
    const playerId = addPlayer(0);

    const grant = credits.grant(playerId, CHEAPEST_MIN_STAKE);
    expect(grant.granted).toBe(true);
    expect(grant.amountMinor).toBe(DEMO_PRACTICE_FLOAT_MINOR);
    expect(balanceOf(playerId)).toBe(DEMO_PRACTICE_FLOAT_MINOR);
  });

  it('refuses outright in a build that is not a demo', () => {
    const credits = new PracticeCredits(repo, false, DEMO_PRACTICE_FLOAT_MINOR, COOLDOWN_MS);
    const playerId = addPlayer(0);
    const grant = credits.grant(playerId, CHEAPEST_MIN_STAKE);
    expect(grant.granted).toBe(false);
    expect(grant.reason).toBe('NOT_DEMO');
    expect(balanceOf(playerId)).toBe(0);
  });

  /**
   * The anti-farming rule. A top-up restores TO the float, never BY it, so it
   * can never leave a player better off than they started and is therefore not
   * a reward for losing.
   */
  it('can never take a balance above the starting float', () => {
    const credits = demo();
    const playerId = addPlayer(DEMO_PRACTICE_FLOAT_MINOR * 3);
    const grant = credits.grant(playerId, CHEAPEST_MIN_STAKE);
    expect(grant.granted).toBe(false);
    expect(grant.reason).toBe('NOT_NEEDED');
    expect(balanceOf(playerId)).toBe(DEMO_PRACTICE_FLOAT_MINOR * 3);
  });

  it('refuses while the player can still afford a bet somewhere', () => {
    const credits = demo();
    // Exactly the cheapest minimum: they can play, so they are not stranded.
    const playerId = addPlayer(CHEAPEST_MIN_STAKE);
    expect(credits.grant(playerId, CHEAPEST_MIN_STAKE).reason).toBe('NOT_NEEDED');
    expect(balanceOf(playerId)).toBe(CHEAPEST_MIN_STAKE);
  });

  it('rate-limits: no instant refill after losing the float again', () => {
    const credits = demo();
    const playerId = addPlayer(0);
    const t0 = 1_000_000;

    expect(credits.grant(playerId, CHEAPEST_MIN_STAKE, t0).granted).toBe(true);
    // Lose it all again a second later.
    repo.creditPlayer(playerId, -DEMO_PRACTICE_FLOAT_MINOR);
    const second = credits.grant(playerId, CHEAPEST_MIN_STAKE, t0 + 1_000);
    expect(second.granted).toBe(false);
    expect(second.reason).toBe('COOLDOWN');
    expect(second.retryAt).toBe(t0 + COOLDOWN_MS);
    expect(balanceOf(playerId)).toBe(0);

    // …and it comes back once the cooldown has passed.
    const third = credits.grant(playerId, CHEAPEST_MIN_STAKE, t0 + COOLDOWN_MS);
    expect(third.granted).toBe(true);
    expect(balanceOf(playerId)).toBe(DEMO_PRACTICE_FLOAT_MINOR);
  });

  /**
   * §2.9.5 / Order 222 Art. 16.2 — the only place in the system that creates
   * value must leave a record with the value before and after, or the credits in
   * play reconcile against nothing.
   */
  it('ledgers every grant with the balance before and after', () => {
    const credits = demo();
    // Below the cheapest minimum bet: genuinely stranded, and not at zero, so
    // the recorded 'before' is a number that could only come from the ledger.
    const playerId = addPlayer(37);
    credits.grant(playerId, CHEAPEST_MIN_STAKE);

    const events = db
      .select()
      .from(significantEvents)
      .all()
      .filter((e) => e.category === 'DEMO_CREDITS');
    expect(events).toHaveLength(1);
    expect(events[0]!.valueBefore).toBe('37');
    expect(events[0]!.valueAfter).toBe(String(DEMO_PRACTICE_FLOAT_MINOR));
    expect(events[0]!.component).toBe(`player.${playerId}`);
    expect(events[0]!.reason).toContain('no cash value');
    expect(events[0]!.createdAt).toBeGreaterThan(0);
  });

  /**
   * The grant is MINTED, not moved from the house. A house debit would put
   * practice credits inside the operator-revenue reconciliation, where
   * `reconcileOperatorRevenue` would correctly report it as leakage.
   */
  it('does not take the credits from the house account', () => {
    const houseId = randomUUID();
    db.insert(players)
      .values({ id: houseId, name: 'HOUSE', balanceMinor: 5_000_00, isHouse: true, createdAt: Date.now() })
      .run();
    const credits = demo();
    const playerId = addPlayer(0);
    credits.grant(playerId, CHEAPEST_MIN_STAKE);
    expect(balanceOf(houseId)).toBe(5_000_00);
  });

  it('handles an unknown player without throwing', () => {
    expect(demo().grant('nobody', CHEAPEST_MIN_STAKE).reason).toBe('NO_PLAYER');
  });

  it('forgets a departed player rather than growing a map forever', () => {
    const credits = demo();
    const playerId = addPlayer(0);
    const t0 = 1_000_000;
    credits.grant(playerId, CHEAPEST_MIN_STAKE, t0);
    repo.creditPlayer(playerId, -DEMO_PRACTICE_FLOAT_MINOR);
    credits.forget(playerId);
    // A reconnecting player starts a fresh cooldown; the alternative is an
    // unbounded map keyed by every player who ever connected.
    expect(credits.grant(playerId, CHEAPEST_MIN_STAKE, t0 + 1_000).granted).toBe(true);
  });
});
