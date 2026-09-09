/**
 * The database surface the game sees.
 *
 * Deliberately the *driver-agnostic* Drizzle base type rather than
 * `BetterSQLite3Database`: the same repository has to run on `better-sqlite3`
 * (Node) and on Durable Object SQLite (Cloudflare Workers), and both drivers
 * are synchronous SQLite with an identical query-builder API — only the
 * `.run()` result type differs, which nothing reads (`insertRound` uses
 * RETURNING for exactly that reason). Widening the run result to `unknown` is
 * what lets one repository serve both hosts without a cast
 * (software-architecture.md §4, steps 4-6).
 *
 * This lives apart from `index.ts` because that module is the *Node* host — it
 * imports better-sqlite3 and `node:fs`, neither of which a Workers build can
 * resolve. Only the type is shared.
 */
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema.js';

export type Db = BaseSQLiteDatabase<'sync', unknown, typeof schema>;
