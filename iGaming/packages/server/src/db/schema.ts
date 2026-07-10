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

export const surgeEvents = sqliteTable('surge_events', {
  roundId: integer('round_id').primaryKey(),
  winnerPlayerId: text('winner_player_id'), // null -> pot rolled over
  winnerStakeId: text('winner_stake_id'),
  amountMinor: integer('amount_minor').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerId: text('player_id').notNull(),
  name: text('name').notNull(),
  text: text('text').notNull(),
  createdAt: integer('created_at').notNull(),
});
