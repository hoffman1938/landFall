/**
 * Season seed-chain management — docs/04-architecture/rng-provably-fair-spec.md §1.1, §3.
 * The terminal secret lives only in the local DB (the server's secret store);
 * it is never logged and never sent anywhere. Seeds are recomputed on demand
 * (SHA256^n is sub-millisecond at n<=10k) and consumed strictly in order.
 *
 * SEASON ROLLOVER — why `consume()` can no longer throw.
 *
 * A season is exactly SEED_CHAIN_LENGTH rounds; at the shipped 20-second
 * heartbeat that is about 55 hours of continuous play. `consume()` used to
 * throw `seed chain exhausted` at the end of it, from inside the round loop's
 * `setTimeout` callback — so a deployment that ran for two and a half days
 * stopped dealing rounds permanently and could only be recovered by restarting
 * the process (`ensureChain` mints a fresh season at boot, which is why this
 * was never seen in testing). Order 240 Art. 3.1 requires continuous 24-hour
 * operation, and a game that halts on a calendar boundary does not provide it.
 *
 * The fix is the obvious one and it costs nothing in fairness: at exhaustion the
 * server mints the NEXT season — a new terminal secret, a new commitment — and
 * publishes it before the first round that uses it, exactly as it does at boot.
 * Nothing about an already-settled round changes: every round row stores the
 * `prevChainValue` it was drawn against, so historical verification is per-round
 * and is untouched by a rollover. What a client needs is the CURRENT commitment,
 * which is why `commitment` is a getter and why the round header now carries it.
 */
import { eq } from 'drizzle-orm';
import { chainCommitment, roundSeed, SEED_CHAIN_LENGTH } from '@landfall/core';
import type { Db } from './db/index.js';
import { chainState } from './db/schema.js';
import { log } from './log.js';
import { randomHex } from './random.js';

export interface ChainHandle {
  /** The commitment of the season currently being consumed. Changes on rollover. */
  readonly commitment: string;
  readonly length: number;
  /** Consume the next chain index; returns everything a round needs. */
  consume(): { chainIndex: number; seedHex: string; prevChainValue: string };
  /**
   * Called after a season rollover, with the new commitment. The server uses it
   * to record the significant event and tell connected clients; keeping it a
   * callback is what lets this module stay free of the hub and the repository.
   */
  onRollover(fn: (commitment: string) => void): void;
}

interface ChainSeason {
  terminalHex: string;
  length: number;
  commitment: string;
  nextIndex: number;
}

/**
 * @param length Season length. Defaults to the shipped `SEED_CHAIN_LENGTH`;
 *   overridable so the rollover path can be exercised in a test without
 *   computing ten thousand chained hashes ten thousand times.
 */
export function ensureChain(db: Db, length: number = SEED_CHAIN_LENGTH): ChainHandle {
  function mint(): ChainSeason {
    const terminalHex = randomHex(32);
    const commitment = chainCommitment(terminalHex, length);
    const fresh = { id: 1, terminalHex, length, commitment, nextIndex: 1 };
    db.insert(chainState)
      .values(fresh)
      .onConflictDoUpdate({ target: chainState.id, set: fresh })
      .run();
    return fresh;
  }

  const row = db.select().from(chainState).where(eq(chainState.id, 1)).get();
  let state: ChainSeason;
  if (!row || row.nextIndex > row.length) {
    state = mint();
    log.info('new season chain committed', { commitment: state.commitment });
  } else {
    state = {
      terminalHex: row.terminalHex,
      length: row.length,
      commitment: row.commitment,
      nextIndex: row.nextIndex,
    };
  }

  const listeners: ((commitment: string) => void)[] = [];

  return {
    get commitment() {
      return state.commitment;
    },
    get length() {
      return state.length;
    },
    onRollover(fn) {
      listeners.push(fn);
    },
    consume() {
      if (state.nextIndex > state.length) {
        // Season exhausted. Mint the next one and publish its commitment BEFORE
        // any round is drawn against it — the commitment has to precede the
        // draw for the chain to prove anything at all.
        const previous = state.commitment;
        state = mint();
        log.info('season chain rolled over', {
          previousCommitment: previous,
          commitment: state.commitment,
          length: state.length,
        });
        for (const fn of listeners) fn(state.commitment);
      }
      const chainIndex = state.nextIndex;
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
