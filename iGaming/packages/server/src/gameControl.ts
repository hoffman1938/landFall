/**
 * DISABLE ON DEMAND (gap G32; GLI-19 §2.4.1, §4.15.1, §4.15.2, §A.6.3).
 *
 * §2.4.1 requires the ability to disable, on demand: all gaming activity;
 * individual game themes or versions; and individual player logins. §4.15.1 adds
 * that players must be able to CONCLUDE A GAME IN PROGRESS when a disable lands,
 * and that the game is inaccessible thereafter. §A.6.3 requires an audit-log
 * entry carrying the date, the time and the REASON.
 *
 * The shape that matters is the "conclude in progress" rule, and it is the
 * reason this is a soft gate rather than a kill switch: a disable that stopped a
 * locked round mid-flight would strand every bet in it, turning a routine
 * operational action into the interrupted-game incident that §4.16 exists to
 * handle. So a disable stops NEW bets immediately and lets the round already on
 * the table settle normally.
 *
 * Player-login disable (§2.4.1(c)) is an OPERATOR obligation on Route A — the
 * operator owns the account — but the eligibility gate has to be honoured here,
 * so the same service carries a per-player block that the operator's platform
 * would drive.
 */
import type { GameRepository } from './db/repository.js';
import { log } from './log.js';
import { metrics } from './metrics.js';

export type DisableScope = 'ALL' | 'ROOM' | 'PLAYER';

export interface DisableState {
  scope: DisableScope;
  /** Room id for ROOM scope, player id for PLAYER scope. */
  target?: string | undefined;
  reason: string;
  actor: string;
  at: number;
}

export class GameControl {
  private all: DisableState | null = null;
  private rooms = new Map<string, DisableState>();
  private players = new Map<string, DisableState>();

  constructor(private repo: GameRepository) {}

  /**
   * §A.6.3 — every disable and enable is an audit-log entry with date, time and
   * reason, recorded as a significant event with the value before and after so
   * it also satisfies §2.9.5.
   */
  disable(scope: DisableScope, reason: string, actor: string, target?: string): DisableState {
    const state: DisableState = { scope, target, reason, actor, at: Date.now() };
    const before = this.describe(scope, target);
    if (scope === 'ALL') this.all = state;
    else if (scope === 'ROOM' && target) this.rooms.set(target, state);
    else if (scope === 'PLAYER' && target) this.players.set(target, state);

    this.repo.insertSignificantEvent({
      category: 'GAME_STATE',
      component: target ? `${scope.toLowerCase()}.${target}` : 'all-gaming',
      actor,
      reason,
      valueBefore: before,
      valueAfter: 'DISABLED',
      incident: scope === 'ALL',
    });
    log.warn('gaming disabled', { scope, target, reason, actor });
    this.sample();
    return state;
  }

  enable(scope: DisableScope, actor: string, target?: string): void {
    const before = this.describe(scope, target);
    if (scope === 'ALL') this.all = null;
    else if (scope === 'ROOM' && target) this.rooms.delete(target);
    else if (scope === 'PLAYER' && target) this.players.delete(target);

    this.repo.insertSignificantEvent({
      category: 'GAME_STATE',
      component: target ? `${scope.toLowerCase()}.${target}` : 'all-gaming',
      actor,
      reason: 'gaming re-enabled',
      valueBefore: before,
      valueAfter: 'ENABLED',
    });
    log.warn('gaming enabled', { scope, target, actor });
    this.sample();
  }

  private describe(scope: DisableScope, target?: string): string {
    if (scope === 'ALL') return this.all ? 'DISABLED' : 'ENABLED';
    if (scope === 'ROOM') return target && this.rooms.has(target) ? 'DISABLED' : 'ENABLED';
    return target && this.players.has(target) ? 'DISABLED' : 'ENABLED';
  }

  /**
   * Whether a NEW bet may be accepted. A round already locked always settles —
   * see the file header for why that is the safe reading of §4.15.1.
   */
  betsAllowed(roomId: string, playerId: string): { allowed: boolean; reason?: string } {
    const block = this.all ?? this.rooms.get(roomId) ?? this.players.get(playerId);
    return block ? { allowed: false, reason: block.reason } : { allowed: true };
  }

  /** Everything currently disabled, for the operator surface and the report. */
  state(): { all: DisableState | null; rooms: DisableState[]; players: DisableState[] } {
    return {
      all: this.all,
      rooms: [...this.rooms.values()],
      players: [...this.players.values()],
    };
  }

  private sample(): void {
    metrics.gauge(
      'landfall_gaming_disabled',
      'Gaming disabled: 1 = all gaming activity is disabled on demand.',
      this.all ? 1 : 0,
    );
  }
}
