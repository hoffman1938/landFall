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

export const surgeState = sqliteTable('surge_state', {
  id: integer('id').primaryKey(),
  potMinor: integer('pot_minor').notNull(),
});

/**
 * Storm Reserve ledger (A3) — one row per settled round, auditable:
 * inflow = rake × RAKE_SPLIT.stormReserve, outflow = the Storm Power draw
 * (salvageTotal − distributable, cap applied), balance = running balance.
 */
export const stormReserveLedger = sqliteTable('storm_reserve_ledger', {
  roundId: integer('round_id').primaryKey(),
  inflowMinor: integer('inflow_minor').notNull(),
  outflowMinor: integer('outflow_minor').notNull(),
  balanceMinor: integer('balance_minor').notNull(),
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

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerId: text('player_id').notNull(),
  name: text('name').notNull(),
  text: text('text').notNull(),
  createdAt: integer('created_at').notNull(),
});
