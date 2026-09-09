/**
 * Durable Object SQLite host for the game's repository.
 *
 * A Durable Object's SQLite storage is a real, synchronous SQLite — the same
 * shape `better-sqlite3` gives the Node host — so the repository, the round
 * coordinator and the settlement transaction all run here unmodified. The only
 * things that differ are the driver and the transaction primitive, and both are
 * absorbed below (software-architecture.md §4, steps 5-6).
 */
import { drizzle } from 'drizzle-orm/durable-sqlite';
import { SCHEMA_DDL, schema, type Db, type TransactionHost } from '@landfall/server';

/**
 * Open (and bootstrap) the game database on a Durable Object's storage.
 *
 * The DDL is the same string the Node host executes, split per statement so a
 * failure names the statement that failed rather than the whole schema. Every
 * statement is `IF NOT EXISTS`, so running this on each boot is a no-op once
 * the object has been initialised.
 */
export function openDurableDb(storage: DurableObjectStorage): Db {
  for (const statement of SCHEMA_DDL.split(';')) {
    const trimmed = statement.trim();
    if (trimmed.length > 0) storage.sql.exec(trimmed);
  }
  return drizzle(storage, { schema });
}

/**
 * The storage object doubles as the repository's transaction host:
 * `transactionSync` runs the callback atomically and rolls back on a throw,
 * which is precisely the repository's ATOMICITY CONTRACT — so the conservation
 * assert inside settlement still unwinds every write it guards.
 */
export function durableTransactionHost(storage: DurableObjectStorage): TransactionHost {
  return { transactionSync: (fn) => storage.transactionSync(fn) };
}
