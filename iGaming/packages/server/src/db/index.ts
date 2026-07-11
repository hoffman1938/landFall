import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.js';

export function openDb(file: string) {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  bootstrap(sqlite);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

/**
 * Schema bootstrap. Temporary stand-in for drizzle-kit migrations (tracked for a
 * later pass); DDL kept in lockstep with schema.ts.
 */
function bootstrap(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      balance_minor INTEGER NOT NULL,
      is_house INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chain_state (
      id INTEGER PRIMARY KEY,
      terminal_hex TEXT NOT NULL,
      length INTEGER NOT NULL,
      commitment TEXT NOT NULL,
      next_index INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chain_index INTEGER NOT NULL,
      prev_chain_value TEXT NOT NULL,
      seed_hex TEXT,
      struck_zone INTEGER,
      lock_snapshot_json TEXT,
      rake_minor INTEGER,
      rake_bp INTEGER,
      max_payout_multiple INTEGER,
      power_capped INTEGER,
      settled_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stakes (
      id TEXT PRIMARY KEY,
      round_id INTEGER NOT NULL,
      player_id TEXT NOT NULL,
      zone INTEGER NOT NULL,
      amount_minor INTEGER NOT NULL,
      is_house_seed INTEGER NOT NULL DEFAULT 0,
      outcome TEXT,
      payout_minor INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stakes_round ON stakes(round_id);
    CREATE TABLE IF NOT EXISTS surge_state (
      id INTEGER PRIMARY KEY,
      pot_minor INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS storm_reserve_ledger (
      round_id INTEGER PRIMARY KEY,
      inflow_minor INTEGER NOT NULL,
      outflow_minor INTEGER NOT NULL,
      balance_minor INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS surge_events (
      round_id INTEGER PRIMARY KEY,
      winner_player_id TEXT,
      winner_stake_id TEXT,
      amount_minor INTEGER NOT NULL,
      flat_odds INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS server_secrets (
      id INTEGER PRIMARY KEY,
      receipt_key_hex TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS action_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      player_id TEXT NOT NULL,
      action TEXT NOT NULL,
      action_hash TEXT NOT NULL,
      ts INTEGER NOT NULL,
      ms_before_lock INTEGER NOT NULL,
      verdict TEXT NOT NULL,
      reason TEXT,
      sig_hex TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_receipts_round ON action_receipts(round_id, player_id);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  // Additive column migrations for pre-existing dev DBs (CREATE TABLE IF NOT
  // EXISTS skips them). Idempotent: checked against pragma table_info.
  addColumnIfMissing(sqlite, 'rounds', 'rake_bp', 'INTEGER');
  addColumnIfMissing(sqlite, 'rounds', 'max_payout_multiple', 'INTEGER');
  addColumnIfMissing(sqlite, 'rounds', 'power_capped', 'INTEGER');
  addColumnIfMissing(sqlite, 'surge_events', 'flat_odds', 'INTEGER NOT NULL DEFAULT 0');
}

function addColumnIfMissing(
  sqlite: Database.Database,
  table: string,
  column: string,
  type: string,
) {
  const cols = sqlite.pragma(`table_info(${table})`) as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export type Db = ReturnType<typeof openDb>['db'];
export type Sqlite = Database.Database;
export { schema };
