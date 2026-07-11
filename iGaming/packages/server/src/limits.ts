/**
 * Responsible-gambling service (remediation F1/F2) — shared across all rooms
 * so limits follow the PLAYER, not the room. Server-enforced, never client
 * cosmetics: the coordinator consults checkOrder() on every anchor accept.
 *
 * Semantics (demo-grade, per the program mandate — no real-money integration):
 *  - limits default OFF; setting or tightening one applies immediately;
 *  - LOOSENING (raising or clearing) queues behind LIMIT_RAISE_COOLDOWN_MS;
 *  - self-exclusion (F2) is a lockout timestamp that only ever extends;
 *  - "session" = this connection span (in-memory net, reset when the player's
 *    last socket closes); "daily" = UTC day, persisted in player_day_loss
 *    inside the settlement transaction;
 *  - rejection copy is supportive and non-shaming (reviewed under G-copy).
 */
import { LIMIT_RAISE_COOLDOWN_MS, type LimitsPending, type LimitsState } from '@landfall/core';
import type { GameRepository, PlayerLimitsRow } from './db/repository.js';

export type LimitField =
  | 'sessionLossLimitMinor'
  | 'dailyLossLimitMinor'
  | 'stakePerRoundCapMinor';

const LIMIT_FIELDS: LimitField[] = [
  'sessionLossLimitMinor',
  'dailyLossLimitMinor',
  'stakePerRoundCapMinor',
];

/** UTC day key for the daily loss ledger, e.g. "2026-07-11". */
export function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

interface PendingMap {
  [field: string]: { value: number | null; effectiveAt: number };
}

function emptyRow(playerId: string): PlayerLimitsRow {
  return {
    playerId,
    sessionLossLimitMinor: null,
    dailyLossLimitMinor: null,
    stakePerRoundCapMinor: null,
    realityCheckMinutes: null,
    pendingJson: null,
    excludedUntil: null,
  };
}

export interface LimitsCheck {
  ok: boolean;
  code?: string;
  message?: string;
}

export class LimitsService {
  /** Signed net loss this session per player (positive = down). */
  private sessionNetLoss = new Map<string, number>();

  constructor(private repo: GameRepository) {}

  /** Called by the hub when a player's first live socket appears. */
  beginSession(playerId: string): void {
    if (!this.sessionNetLoss.has(playerId)) this.sessionNetLoss.set(playerId, 0);
  }

  /** Called by the hub when a player's LAST live socket closes. */
  endSession(playerId: string): void {
    this.sessionNetLoss.delete(playerId);
  }

  /** Net position this session (positive = up) — shown by reality checks. */
  sessionNet(playerId: string): number {
    return -(this.sessionNetLoss.get(playerId) ?? 0);
  }

  /** Coordinator hook, called AFTER the settlement txn commits. */
  noteSessionNet(playerId: string, netMinor: number): void {
    if (!this.sessionNetLoss.has(playerId)) return; // not a live session (e.g. bots)
    this.sessionNetLoss.set(playerId, (this.sessionNetLoss.get(playerId) ?? 0) - netMinor);
  }

  /** Effective row with matured pendings applied (persisted lazily). */
  private effectiveRow(playerId: string, now = Date.now()): PlayerLimitsRow {
    const row = this.repo.getPlayerLimits(playerId) ?? emptyRow(playerId);
    const pending = (row.pendingJson ? JSON.parse(row.pendingJson) : {}) as PendingMap;
    let changed = false;
    for (const field of LIMIT_FIELDS) {
      const p = pending[field];
      if (p && now >= p.effectiveAt) {
        row[field] = p.value;
        delete pending[field];
        changed = true;
      }
    }
    if (changed) {
      row.pendingJson = Object.keys(pending).length > 0 ? JSON.stringify(pending) : null;
      this.repo.upsertPlayerLimits(row);
    }
    return row;
  }

  getState(playerId: string, now = Date.now()): LimitsState {
    const row = this.effectiveRow(playerId, now);
    const pendingMap = (row.pendingJson ? JSON.parse(row.pendingJson) : {}) as PendingMap;
    const pending: LimitsPending[] = LIMIT_FIELDS.filter((f) => pendingMap[f]).map((f) => ({
      field: f,
      value: pendingMap[f]!.value,
      effectiveAt: pendingMap[f]!.effectiveAt,
    }));
    return {
      sessionLossLimitMinor: row.sessionLossLimitMinor,
      dailyLossLimitMinor: row.dailyLossLimitMinor,
      stakePerRoundCapMinor: row.stakePerRoundCapMinor,
      realityCheckMinutes: row.realityCheckMinutes,
      excludedUntil: row.excludedUntil !== null && row.excludedUntil > now ? row.excludedUntil : null,
      pending,
    };
  }

  /**
   * Apply a SET_LIMITS patch. Tighten (set where unset, or lower) = immediate;
   * loosen (raise or clear) = queued behind the 24h cooldown. Reality-check
   * cadence is informational, not a limit — changes apply immediately.
   */
  setLimits(
    playerId: string,
    patch: { [K in LimitField]?: number | null | undefined } & {
      realityCheckMinutes?: number | null | undefined;
    },
    now = Date.now(),
  ): LimitsState {
    const row = this.effectiveRow(playerId, now);
    const pending = (row.pendingJson ? JSON.parse(row.pendingJson) : {}) as PendingMap;
    for (const field of LIMIT_FIELDS) {
      if (!(field in patch)) continue;
      const next = patch[field] ?? null;
      const current = row[field];
      const tightens = next !== null && (current === null || next < current);
      if (tightens || (next === null && current === null)) {
        row[field] = next;
        delete pending[field]; // a tighter value supersedes any queued loosening
      } else {
        pending[field] = { value: next, effectiveAt: now + LIMIT_RAISE_COOLDOWN_MS };
      }
    }
    if ('realityCheckMinutes' in patch) {
      row.realityCheckMinutes = patch.realityCheckMinutes ?? null;
    }
    row.pendingJson = Object.keys(pending).length > 0 ? JSON.stringify(pending) : null;
    this.repo.upsertPlayerLimits(row);
    return this.getState(playerId, now);
  }

  /** F2: self-exclusion only ever extends — a shorter request is a no-op. */
  setExclusion(playerId: string, minutes: number, now = Date.now()): LimitsState {
    const row = this.effectiveRow(playerId, now);
    const until = now + minutes * 60_000;
    if (row.excludedUntil === null || until > row.excludedUntil) {
      row.excludedUntil = until;
      this.repo.upsertPlayerLimits(row);
    }
    return this.getState(playerId, now);
  }

  /**
   * Accept-path check (F1/F2) for a fleet order of `stakeMinor` (the player's
   * whole committed stake this round, replacing `existingStakeMinor`).
   * Committed stake counts against remaining loss headroom, so a player can
   * never wager past the limit they set. Copy stays supportive — the player
   * asked us to hold this line.
   */
  checkOrder(playerId: string, stakeMinor: number, now = Date.now()): LimitsCheck {
    const row = this.effectiveRow(playerId, now);
    if (row.excludedUntil !== null && row.excludedUntil > now) {
      const until = new Date(row.excludedUntil);
      return {
        ok: false,
        code: 'EXCLUDED',
        message: `You asked for a break until ${until.toLocaleString()}. The harbor will be here when you're back.`,
      };
    }
    if (row.stakePerRoundCapMinor !== null && stakeMinor > row.stakePerRoundCapMinor) {
      return {
        ok: false,
        code: 'LIMIT_STAKE',
        message: `That's above the ${(row.stakePerRoundCapMinor / 100).toFixed(2)}-per-round cap you set for yourself.`,
      };
    }
    if (row.sessionLossLimitMinor !== null) {
      const sessionLoss = this.sessionNetLoss.get(playerId) ?? 0;
      if (sessionLoss + stakeMinor > row.sessionLossLimitMinor) {
        return {
          ok: false,
          code: 'LIMIT_LOSS',
          message:
            'This stake could pass the session loss limit you set. It resets next session — thanks for playing your plan.',
        };
      }
    }
    if (row.dailyLossLimitMinor !== null) {
      const dayLoss = this.repo.getDayLoss(playerId, utcDayKey(now));
      if (dayLoss + stakeMinor > row.dailyLossLimitMinor) {
        return {
          ok: false,
          code: 'LIMIT_LOSS',
          message:
            'This stake could pass the daily loss limit you set. It resets at midnight UTC — thanks for playing your plan.',
        };
      }
    }
    return { ok: true };
  }
}
