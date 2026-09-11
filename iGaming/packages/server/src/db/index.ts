import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA_DDL } from './ddl.js';
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
  sqlite.exec(SCHEMA_DDL);
  // Additive column migrations for pre-existing dev DBs (CREATE TABLE IF NOT
  // EXISTS skips them). Idempotent: checked against pragma table_info.
  addColumnIfMissing(sqlite, 'rounds', 'rake_bp', 'INTEGER');
  addColumnIfMissing(sqlite, 'rounds', 'max_payout_multiple', 'INTEGER');
  addColumnIfMissing(sqlite, 'rounds', 'power_capped', 'INTEGER');
  addColumnIfMissing(sqlite, 'rounds', 'room_id', 'TEXT');
  addColumnIfMissing(sqlite, 'surge_events', 'flat_odds', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(sqlite, 'players', 'is_bot', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(sqlite, 'players', 'last_room_id', 'TEXT');
  addColumnIfMissing(sqlite, 'storm_reserve_ledger', 'room_id', 'TEXT');
  addColumnIfMissing(sqlite, 'chat_messages', 'room_id', 'TEXT');
  // Compliance pass (rules v2): G45 rules versioning, G27 voided rounds,
  // G11 reserve backstop, G10 jackpot diversion pool.
  addColumnIfMissing(sqlite, 'rounds', 'rules_version', 'INTEGER');
  addColumnIfMissing(sqlite, 'rounds', 'voided_at', 'INTEGER');
  addColumnIfMissing(sqlite, 'rounds', 'void_reason', 'TEXT');
  addColumnIfMissing(sqlite, 'storm_reserve_ledger', 'backstop_minor', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(sqlite, 'surge_pots', 'diversion_minor', 'INTEGER NOT NULL DEFAULT 0');
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

export type { Db } from './database.js';
export type Sqlite = Database.Database;
export { schema };
