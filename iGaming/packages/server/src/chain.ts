/**
 * Season seed-chain management — docs/04-architecture/rng-provably-fair-spec.md §1.1, §3.
 * The terminal secret lives only in the local DB (the server's secret store);
 * it is never logged and never sent anywhere. Seeds are recomputed on demand
 * (SHA256^n is sub-millisecond at n<=10k) and consumed strictly in order.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { chainCommitment, roundSeed, SEED_CHAIN_LENGTH } from '@landfall/core';
import type { Db } from './db/index.js';
import { chainState } from './db/schema.js';
import { log } from './log.js';

export interface ChainHandle {
  commitment: string;
  length: number;
  /** Consume the next chain index; returns everything a round needs. */
  consume(): { chainIndex: number; seedHex: string; prevChainValue: string };
}

export function ensureChain(db: Db): ChainHandle {
  let row = db.select().from(chainState).where(eq(chainState.id, 1)).get();
  if (!row || row.nextIndex > row.length) {
    const terminalHex = randomBytes(32).toString('hex');
    const commitment = chainCommitment(terminalHex, SEED_CHAIN_LENGTH);
    const fresh = { id: 1, terminalHex, length: SEED_CHAIN_LENGTH, commitment, nextIndex: 1 };
    db.insert(chainState)
      .values(fresh)
      .onConflictDoUpdate({ target: chainState.id, set: fresh })
      .run();
    row = fresh;
    log.info('new season chain committed', { commitment });
  }

  const state = { ...row };
  return {
    commitment: state.commitment,
    length: state.length,
    consume() {
      const chainIndex = state.nextIndex;
      if (chainIndex > state.length) throw new Error('seed chain exhausted');
      const seedHex = roundSeed(state.terminalHex, state.length, chainIndex);
      const prevChainValue =
        chainIndex === 1
          ? state.commitment
          : roundSeed(state.terminalHex, state.length, chainIndex - 1);
      state.nextIndex += 1;
      db.update(chainState).set({ nextIndex: state.nextIndex }).where(eq(chainState.id, 1)).run();
      return { chainIndex, seedHex, prevChainValue };
    },
  };
}
