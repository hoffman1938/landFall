/**
 * Schema bootstrap DDL — the single source of truth for both SQLite hosts.
 *
 * `better-sqlite3` (Node) and Durable Object SQLite (Cloudflare Workers) run
 * the exact same statements, so a column added for one host can never go
 * missing on the other. Temporary stand-in for drizzle-kit migrations (tracked
 * for a later pass); kept in lockstep with schema.ts.
 *
 * Everything here is `IF NOT EXISTS`, so applying it to an already-bootstrapped
 * database is a no-op — that is what makes it safe to run on every boot.
 */
export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  balance_minor INTEGER NOT NULL,
  is_house INTEGER NOT NULL DEFAULT 0,
  is_bot INTEGER NOT NULL DEFAULT 0,
  last_room_id TEXT,
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
  room_id TEXT,
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
CREATE TABLE IF NOT EXISTS surge_pots (
  room_id TEXT PRIMARY KEY,
  pot_minor INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS storm_reserve_ledger (
  round_id INTEGER PRIMARY KEY,
  room_id TEXT,
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
  room_id TEXT,
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS action_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  round_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  action TEXT NOT NULL,
  ms_into_phase INTEGER NOT NULL,
  zone INTEGER,
  stake_minor INTEGER,
  in_fog INTEGER NOT NULL,
  is_min_stake INTEGER NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_player ON action_telemetry(player_id, round_id);
CREATE TABLE IF NOT EXISTS skipper_records (
  player_id TEXT PRIMARY KEY,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  bluffs_called INTEGER NOT NULL DEFAULT 0,
  biggest_salvage_minor INTEGER NOT NULL DEFAULT 0,
  rounds_sailed INTEGER NOT NULL DEFAULT 0,
  surge_wins INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS player_limits (
  player_id TEXT PRIMARY KEY,
  session_loss_limit_minor INTEGER,
  daily_loss_limit_minor INTEGER,
  stake_per_round_cap_minor INTEGER,
  reality_check_minutes INTEGER,
  pending_json TEXT,
  excluded_until INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS player_day_loss (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  net_loss_minor INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_day_loss ON player_day_loss(player_id, day_key);
`;
