/**
 * PRACTICE CREDITS — the demo build's only way to put value on a table.
 *
 * THE DEFECT THIS CLOSES. A player starts with `STARTING_BALANCE_MINOR` and
 * nothing in the system ever adds to it. Practice bots top themselves back up
 * when their bankroll runs down (`bots.ts`); players did not. A demo player who
 * lost their balance was therefore finished permanently: every order rejected
 * with INSUFFICIENT, and — because room routing skips any table whose minimum
 * they cannot afford — seated at the cheapest table still unable to bet on it.
 * That is a broken product in the only mode this build actually ships, and it
 * is also a certification problem in its own right: GLI-19 §4.9.1(a) requires a
 * no-wager mode to "accurately represent the normal operation of a paid game",
 * and a paid game does not lock a player out of its own rules.
 *
 * WHAT THIS IS AND IS NOT.
 *
 * It is a top-up of VIRTUAL CREDITS WITH NO CASH VALUE, available only when the
 * server runs with `LANDFALL_ENV=demo`. It is not a deposit, not a bonus, not an
 * incentive award and not a loyalty program: no money enters or leaves, there is
 * no payment instrument anywhere in this codebase, and the credits cannot be
 * withdrawn because there is nothing to withdraw to. GLI-19 §2.5.6 (financial
 * transactions) is therefore not engaged; §4.9.1 is the clause that governs, and
 * its requirements are met by construction — the demo track is prominently and
 * permanently labelled on the game surface ("DEMO · VIRTUAL CREDITS") and in the
 * game-information dialog.
 *
 * THE RULES IT DOES FOLLOW, and why each one is here rather than being tuning:
 *
 *   1. IT IS NOT A REWARD FOR LOSING. The top-up only ever brings a balance back
 *      UP TO the standard practice float, and only when the player cannot afford
 *      a single minimum bet at the cheapest table. It can never take a balance
 *      above its starting value, so it cannot be farmed and cannot be mistaken
 *      for winnings.
 *   2. IT IS RATE-LIMITED. `DEMO_TOPUP_COOLDOWN_MS` between grants per player.
 *      Without it, a player who insisted on betting their whole float on every
 *      round would be refilled every twenty seconds, which teaches exactly the
 *      behaviour a responsible-gambling posture exists to discourage — and the
 *      demo's job is to represent the real game, chase included.
 *   3. IT IS LEDGERED. Every grant is a significant event with the balance
 *      before and after (GLI-19 §2.9.5, Order 222 Art. 16.2), so the credits in
 *      play at any moment reconcile against something, and a reviewer can see
 *      the whole of the money supply rather than inferring it.
 *   4. IT IS NOT THE HOUSE'S MONEY. The grant is minted, not transferred from
 *      the house player — a house debit would put practice credits into the
 *      operator revenue reconciliation, which `reconcileOperatorRevenue` would
 *      correctly flag as leakage. Demo credit supply is its own quantity and is
 *      reported as its own quantity.
 *
 * In a real-money deployment `isDemoEnv()` is false, `grantPracticeCredits`
 * refuses, and the player's balance comes from the operator's cashier through
 * the platform integration — which is Route A's division of responsibility.
 */
import { STARTING_BALANCE_MINOR } from '@landfall/core';
import type { GameRepository } from './db/repository.js';
import { log } from './log.js';
import { metrics } from './metrics.js';

/** The practice float a demo player is restored to. */
export const DEMO_PRACTICE_FLOAT_MINOR = STARTING_BALANCE_MINOR;

/**
 * Minimum gap between grants for one player. Deliberately long enough to be
 * felt: a demo that refills instantly is a slot machine with no downside, which
 * misrepresents the game it is demonstrating.
 */
export const DEMO_TOPUP_COOLDOWN_MS = 60_000;

export interface PracticeGrant {
  granted: boolean;
  balanceMinor: number;
  amountMinor: number;
  /** Why a grant was refused, for the client to show and for the log. */
  reason?: 'NOT_DEMO' | 'NOT_NEEDED' | 'COOLDOWN' | 'NO_PLAYER';
  /** When the player may ask again, epoch ms. Only set on COOLDOWN. */
  retryAt?: number;
}

export class PracticeCredits {
  private lastGrantAt = new Map<string, number>();

  constructor(
    private repo: GameRepository,
    private demo: boolean,
    private floatMinor = DEMO_PRACTICE_FLOAT_MINOR,
    private cooldownMs = DEMO_TOPUP_COOLDOWN_MS,
  ) {}

  /**
   * Whether the player is actually stuck: they cannot cover the smallest bet the
   * cheapest table takes. Passing the threshold in keeps this module free of
   * room configuration — the caller knows the tier ladder, this does not.
   */
  needsTopUp(balanceMinor: number, cheapestMinStakeMinor: number): boolean {
    return balanceMinor < cheapestMinStakeMinor;
  }

  grant(playerId: string, cheapestMinStakeMinor: number, now = Date.now()): PracticeGrant {
    const player = this.repo.getPlayer(playerId);
    if (!player) return { granted: false, balanceMinor: 0, amountMinor: 0, reason: 'NO_PLAYER' };
    if (!this.demo) {
      return {
        granted: false,
        balanceMinor: player.balanceMinor,
        amountMinor: 0,
        reason: 'NOT_DEMO',
      };
    }
    if (!this.needsTopUp(player.balanceMinor, cheapestMinStakeMinor)) {
      return {
        granted: false,
        balanceMinor: player.balanceMinor,
        amountMinor: 0,
        reason: 'NOT_NEEDED',
      };
    }
    const last = this.lastGrantAt.get(playerId);
    if (last !== undefined && now - last < this.cooldownMs) {
      return {
        granted: false,
        balanceMinor: player.balanceMinor,
        amountMinor: 0,
        reason: 'COOLDOWN',
        retryAt: last + this.cooldownMs,
      };
    }

    // Restore TO the float, never by it: a top-up can never leave a player
    // richer than they started, so it is not a prize and cannot be farmed.
    const amount = this.floatMinor - player.balanceMinor;
    if (amount <= 0) {
      return {
        granted: false,
        balanceMinor: player.balanceMinor,
        amountMinor: 0,
        reason: 'NOT_NEEDED',
      };
    }

    const before = player.balanceMinor;
    this.repo.inTransaction(() => {
      this.repo.creditPlayer(playerId, amount);
      this.repo.insertSignificantEvent({
        category: 'DEMO_CREDITS',
        component: `player.${playerId}`,
        actor: 'system',
        reason:
          'demo practice credits restored: the player could not cover the smallest bet at the ' +
          'cheapest table. Virtual credits, no cash value, demo build only.',
        valueBefore: String(before),
        valueAfter: String(before + amount),
      });
    });
    this.lastGrantAt.set(playerId, now);
    metrics.counter(
      'landfall_demo_credits_granted_total',
      'Practice-credit top-ups granted. Demo builds only; virtual credits with no cash value.',
    );
    metrics.counter(
      'landfall_demo_credits_minor_total',
      'Practice credits minted, minor units. Demo builds only.',
      {},
      amount,
    );
    log.info('practice credits granted', { playerId, amountMinor: amount, balanceMinor: before + amount });
    return { granted: true, balanceMinor: before + amount, amountMinor: amount };
  }

  /** Drop a departed player's cooldown record so the map cannot grow forever. */
  forget(playerId: string): void {
    this.lastGrantAt.delete(playerId);
  }
}
