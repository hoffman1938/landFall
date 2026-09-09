/**
 * The house player.
 *
 * A real `players` row rather than an implicit account, so that seed stakes and
 * rake have somewhere to live and conservation is auditable straight out of the
 * database — every credit in the game belongs to some row, including the
 * house's. Shared by both hosts because a host that forgot to create it would
 * fail deep inside settlement instead of at boot.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from './db/database.js';
import { players } from './db/schema.js';

/** The house's opening bankroll, in minor units. */
export const HOUSE_BANKROLL_MINOR = 10_000_000_00;

export function ensureHousePlayer(db: Db): void {
  const existing = db.select().from(players).where(eq(players.isHouse, true)).get();
  if (existing) return;
  db.insert(players)
    .values({
      id: randomUUID(),
      name: 'HOUSE',
      balanceMinor: HOUSE_BANKROLL_MINOR,
      isHouse: true,
      isBot: false,
      lastRoomId: null,
      createdAt: Date.now(),
    })
    .run();
}
