/**
 * Drizzle schema — SQLite now, Cloudflare D1 later via driver swap
 * (docs/04-architecture/software-architecture.md §4, step 5).
 * All money columns are integer minor units.
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  balanceMinor: integer('balance_minor').notNull(),
  isHouse: integer('is_house', { mode: 'boolean' }).notNull().default(false),
  /** Demo practice bots (C5) — marked in DB, excluded from Golden Anchor. */
  isBot: integer('is_bot', { mode: 'boolean' }).notNull().default(false),
  /** Reconnect restores the player to their room (C1). */
  lastRoomId: text('last_room_id'),
  createdAt: integer('created_at').notNull(),
});

export const chainState = sqliteTable('chain_state', {
  id: integer('id').primaryKey(),
  terminalHex: text('terminal_hex').notNull(), // server secret (local build: DB is the secret store)
  length: integer('length').notNull(),
  commitment: text('commitment').notNull(),
  nextIndex: integer('next_index').notNull(), // next unconsumed chain index (1-based)
});

export const rounds = sqliteTable('rounds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Room the round ran in (C1). Round ids stay globally unique. */
  roomId: text('room_id'),
  chainIndex: integer('chain_index').notNull(),
  prevChainValue: text('prev_chain_value').notNull(),
  seedHex: text('seed_hex'), // null until reveal
  struckZone: integer('struck_zone'), // null until resolved
  lockSnapshotJson: text('lock_snapshot_json'), // canonical pools at lock (public record)
  rakeMinor: integer('rake_minor'),
  /** Economy config in force at settlement, for verification of historic rounds. */
  rakeBp: integer('rake_bp'), // rake as integer basis points (0.12 -> 1200)
  maxPayoutMultiple: integer('max_payout_multiple'), // Storm Power liability cap (× handle)
  powerCapped: integer('power_capped', { mode: 'boolean' }),
  /**
   * Rules version in force when this round's bets were accepted (G45).
   * GLI-19 §A.5.1 requires the rules in place when the wager was accepted to be
   * the rules applied to it, so the version is stamped at round CREATION, not
   * at settlement — a rules change mid-round binds the next round, never this one.
   */
  rulesVersion: integer('rules_version'),
  /**
   * Set when a round was voided instead of settled (G27, GLI §4.16/§A.6.4).
   * Every bet in a voided round is refunded in full and no rake is taken.
   */
  voidedAt: integer('voided_at'),
  voidReason: text('void_reason'),
  settledAt: integer('settled_at'),
  createdAt: integer('created_at').notNull(),
});

export const stakes = sqliteTable('stakes', {
  id: text('id').primaryKey(),
  roundId: integer('round_id').notNull(),
  playerId: text('player_id').notNull(),
  zone: integer('zone').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  isHouseSeed: integer('is_house_seed', { mode: 'boolean' }).notNull().default(false),
  outcome: text('outcome'), // SAFE | WRECKED, null until settled
  payoutMinor: integer('payout_minor'),
  createdAt: integer('created_at').notNull(),
});

/** Per-room Storm Surge pots (C1 replaced the single global surge_state row). */
export const surgePots = sqliteTable('surge_pots', {
  roomId: text('room_id').primaryKey(),
  potMinor: integer('pot_minor').notNull(),
  /**
   * GLI-19 §4.13.3 diversion pool — contributions received while the pot stood
   * at its ceiling. They are never lost (§4.13.6): they fund the reset value
   * after the next win. See packages/core/src/jackpot.ts.
   */
  diversionMinor: integer('diversion_minor').notNull().default(0),
});

/**
 * Storm Reserve ledger (A3) — one row per settled round, auditable:
 * inflow = rake × RAKE_SPLIT.stormReserve, outflow = the Storm Power draw
 * (salvageTotal − distributable, cap applied), balance = running balance.
 */
export const stormReserveLedger = sqliteTable('storm_reserve_ledger', {
  roundId: integer('round_id').primaryKey(),
  /** Reserve balances are per room (C1). */
  roomId: text('room_id'),
  inflowMinor: integer('inflow_minor').notNull(),
  outflowMinor: integer('outflow_minor').notNull(),
  balanceMinor: integer('balance_minor').notNull(),
  /**
   * House capital injected this round because the draw exceeded the fund (G11).
   * The balance can no longer go negative: a shortfall is recorded here as an
   * explicit, reportable obligation instead of as a minus sign on the balance.
   */
  backstopMinor: integer('backstop_minor').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const surgeEvents = sqliteTable('surge_events', {
  roundId: integer('round_id').primaryKey(),
  winnerPlayerId: text('winner_player_id'), // null -> pot rolled over
  winnerStakeId: text('winner_stake_id'),
  amountMinor: integer('amount_minor').notNull(),
  /** Flat-odds Golden Anchor round (A4, flag-gated). */
  flatOdds: integer('flat_odds', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

/** Server-local secrets (receipt signing key). NOT the fairness chain terminal. */
export const serverSecrets = sqliteTable('server_secrets', {
  id: integer('id').primaryKey(),
  receiptKeyHex: text('receipt_key_hex').notNull(),
});

/**
 * Signed action receipts (B1) — every accepted/rejected anchor, fleet order and
 * cancel, with the server timestamp, per-round sequence and HMAC signature.
 */
export const actionReceipts = sqliteTable('action_receipts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roundId: integer('round_id').notNull(),
  seq: integer('seq').notNull(),
  playerId: text('player_id').notNull(),
  action: text('action').notNull(),
  actionHash: text('action_hash').notNull(),
  ts: integer('ts').notNull(),
  msBeforeLock: integer('ms_before_lock').notNull(),
  verdict: text('verdict').notNull(), // ACCEPTED | REJECTED
  reason: text('reason'),
  sigHex: text('sig_hex').notNull(),
});

/**
 * Per-action behavioral telemetry (B3) — accepted round actions only, for the
 * offline collusion scan (scripts/collusion-scan.ts). Distinct from receipts:
 * receipts are the player-facing audit trail; telemetry is the ops-facing
 * behavioral record (zone, stake, phase timing, fog membership).
 */
export const actionTelemetry = sqliteTable('action_telemetry', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: text('room_id').notNull(),
  roundId: integer('round_id').notNull(),
  playerId: text('player_id').notNull(),
  action: text('action').notNull(), // FLEET_ORDER | CANCEL_ORDER | SIGNAL
  msIntoPhase: integer('ms_into_phase').notNull(),
  zone: integer('zone'), // primary/flagged zone; null for cancels
  stakeMinor: integer('stake_minor'), // null for signals
  inFog: integer('in_fog', { mode: 'boolean' }).notNull(),
  /** Stake equals the room minimum — the probing detector's raw signal. */
  isMinStake: integer('is_min_stake', { mode: 'boolean' }).notNull(),
  /** FOCUS/SPLIT for orders, the SignalKind for flags. */
  detail: text('detail'),
  createdAt: integer('created_at').notNull(),
});

/**
 * Skipper Record (E1) — per-player cosmetic reputation. Read for display only;
 * NEVER an input to gameplay, odds, or settlement. Bots get records too so
 * demo profile cards work; the house never sails.
 */
export const skipperRecords = sqliteTable('skipper_records', {
  playerId: text('player_id').primaryKey(),
  currentStreak: integer('current_streak').notNull().default(0),
  bestStreak: integer('best_streak').notNull().default(0),
  /** Flags revealed dishonest at reveal (flag zone ≠ fleet reality at lock). */
  bluffsCalled: integer('bluffs_called').notNull().default(0),
  biggestSalvageMinor: integer('biggest_salvage_minor').notNull().default(0),
  roundsSailed: integer('rounds_sailed').notNull().default(0),
  surgeWins: integer('surge_wins').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Responsible-gambling limits (F1) + demo-grade self-exclusion (F2).
 * Tightening applies immediately; loosenings wait in pending_json
 * ({field: {value, effectiveAt}}) behind the 24h cooldown.
 */
export const playerLimits = sqliteTable('player_limits', {
  playerId: text('player_id').primaryKey(),
  sessionLossLimitMinor: integer('session_loss_limit_minor'),
  dailyLossLimitMinor: integer('daily_loss_limit_minor'),
  stakePerRoundCapMinor: integer('stake_per_round_cap_minor'),
  realityCheckMinutes: integer('reality_check_minutes'),
  pendingJson: text('pending_json'),
  excludedUntil: integer('excluded_until'),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Per-player daily net loss (F1) — one row per player per UTC day, written
 * inside the settlement transaction. Positive = down, negative = up; the
 * daily loss limit compares against max(0, net).
 */
export const playerDayLoss = sqliteTable('player_day_loss', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerId: text('player_id').notNull(),
  dayKey: text('day_key').notNull(), // 'YYYY-MM-DD', UTC
  netLossMinor: integer('net_loss_minor').notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Chat is scoped per room (C1). */
  roomId: text('room_id'),
  playerId: text('player_id').notNull(),
  name: text('name').notNull(),
  text: text('text').notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * SEGREGATED LIQUIDITY FLOAT LEDGER (G8; GLI-19 §A.7.1(c)–(d), §A.6.5(a)).
 *
 * One row per settled round. House-seed stakes and their settlements move
 * against this ledger, never against operator revenue — which after this change
 * is the rake alone. The float may fund only future seeds, the Storm Surge pot
 * or the Storm Reserve, and `reconcileOperatorRevenue` in
 * packages/core/src/houseFloat.ts is the audit that proves nothing leaked.
 */
export const houseFloatLedger = sqliteTable('house_float_ledger', {
  roundId: integer('round_id').primaryKey(),
  roomId: text('room_id'),
  /** House seed placed into the pools this round. */
  stakedMinor: integer('staked_minor').notNull(),
  /** Credited back to the seeds at settlement (0 on a wrecked seed). */
  returnedMinor: integer('returned_minor').notNull(),
  /** returned − staked. The float's profit and loss for the round. */
  netMinor: integer('net_minor').notNull(),
  /** Operator capital added because the float could not fund the seed. */
  topUpMinor: integer('top_up_minor').notNull().default(0),
  balanceMinor: integer('balance_minor').notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * SIGNIFICANT EVENTS AND ALTERATIONS (G37; GLI-19 §2.9.5, Order 222 Art. 16.2).
 *
 * §2.9.5 wants date and time, the component, the responsible user, the reason,
 * and THE VALUE BEFORE AND AFTER. Order 222 Art. 16.2 additionally requires
 * every change to the remote gaming server to be stored — expressly including
 * the content delivery network — because this log is the evidence that the
 * material-change regime (Law Art. 24¹.2) is being honoured.
 *
 * `decisions-log.md` plus git history is a strong substrate and should be
 * presented as such, but it is not a controlled record: it has no retention
 * guarantee, no before/after values, and no CDN coverage.
 */
export const significantEvents = sqliteTable('significant_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** CONFIG | GAME_STATE | JACKPOT | RESERVE | INTEGRITY | INCIDENT | CDN */
  category: text('category').notNull(),
  /** Dotted path of what changed, e.g. 'economy.maxPayoutMultiple'. */
  component: text('component').notNull(),
  /** Who or what made the change. 'system' for automated events. */
  actor: text('actor').notNull(),
  reason: text('reason'),
  valueBefore: text('value_before'),
  valueAfter: text('value_after'),
  /** Raised as an incident to the operator / Revenue Service (Art. 16.1(b)). */
  incident: integer('incident', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

/**
 * CONTROL PROGRAM SELF-VERIFICATION (G17; GLI-19 §2.3.2, §2.3.3, §2.6.3).
 *
 * §2.3.2 requires verification at least every 24 hours AND on demand, using a
 * digest of at least 128 bits, over executables, libraries, GAMING AND SYSTEM
 * CONFIGURATION, OS files, reporting components and database elements, with an
 * indication on failure.
 *
 * The configuration limb is the one that bites here: `rooms.json`, the rake, the
 * rake split and the Storm Power ladder are all runtime-configurable and all
 * material-change surfaces under Law Art. 24¹.2, so a config change that skipped
 * re-authorization would otherwise leave no trace in the artefact digest.
 */
export const controlVerifications = sqliteTable('control_verifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** SCHEDULED (24h) | STARTUP | ON_DEMAND */
  trigger: text('trigger').notNull(),
  /** SHA-256 over the manifest — 256 bits, well past the 128-bit floor. */
  digestHex: text('digest_hex').notNull(),
  /** The digest recorded at the first verification; a mismatch is a failure. */
  baselineHex: text('baseline_hex').notNull(),
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  /** Per-component digests, so a failure names the file that moved. */
  manifestJson: text('manifest_json').notNull(),
  createdAt: integer('created_at').notNull(),
});
