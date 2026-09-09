/**
 * B1 — signed action receipts, lock-boundary integration test.
 *
 * Drives a real RoundCoordinator (in-memory SQLite, fake timers) across the
 * anchor-lock boundary: an order at T−10ms is ACCEPTED with a signed receipt,
 * the same order at T+10ms is REJECTED with a signed rejection carrying the
 * same fields — and both receipts are persisted and signature-valid.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { chainCommitment, roundSeed } from '@landfall/core';
import { openDb, type Db, type Sqlite } from '../src/db/index.js';
import { actionReceipts, players } from '../src/db/schema.js';
import { DEFAULT_ROOM, RoundCoordinator, type Timings } from '../src/coordinator.js';
import { DrizzleSqliteRepository } from '../src/db/repository.js';
import { ReceiptSigner, ensureReceiptKey } from '../src/receipts.js';
import type { ChainHandle } from '../src/chain.js';

const TERMINAL = 'd'.repeat(64);
const TIMINGS: Timings = { anchorMs: 12_000, stormMs: 1_000, resolvedMs: 500, cooldownMs: 500 };

function fakeChain(): ChainHandle {
  let index = 0;
  return {
    commitment: chainCommitment(TERMINAL, 100),
    length: 100,
    consume() {
      index += 1;
      return {
        chainIndex: index,
        seedHex: roundSeed(TERMINAL, 100, index),
        prevChainValue:
          index === 1 ? chainCommitment(TERMINAL, 100) : roundSeed(TERMINAL, 100, index - 1),
      };
    },
  };
}

const noopEvents = {
  broadcast() {},
  sendToPlayer() {},
  broadcastLandfall() {},
  systemMessage() {},
};

describe('signed action receipts at the lock boundary', () => {
  let db: Db;
  let sqlite: Sqlite;
  let coordinator: RoundCoordinator;
  let playerId: string;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ db, sqlite } = openDb(':memory:'));
    playerId = randomUUID();
    db.insert(players)
      .values({
        id: playerId,
        name: 'Boundary Tester',
        balanceMinor: 100_000,
        isHouse: false,
        createdAt: Date.now(),
      })
      .run();
    const repo = new DrizzleSqliteRepository(db, sqlite);
    coordinator = new RoundCoordinator(repo, fakeChain(), noopEvents, {
      ...DEFAULT_ROOM,
      timings: TIMINGS,
    });
    coordinator.start();
  });

  afterEach(() => {
    coordinator.stop();
    sqlite.close();
    vi.useRealTimers();
  });

  it('accepts at 11.99s with a signed receipt; rejects at 12.01s with a signed rejection', () => {
    // T+11,990ms: 10ms before the 12s lock.
    vi.advanceTimersByTime(11_990);
    const accepted = coordinator.fleetOrder(playerId, 'Boundary Tester', 'FOCUS', 2, null, 2_000);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error('unreachable');
    expect(accepted.receipt.verdict).toBe('ACCEPTED');
    expect(accepted.receipt.msBeforeLock).toBe(10);
    expect(accepted.receipt.seq).toBe(1);

    // T+12,010ms: 10ms after lock — the timer has fired, phase is LOCKED_STORM.
    vi.advanceTimersByTime(20);
    expect(coordinator.phase).toBe('LOCKED_STORM');
    const rejected = coordinator.fleetOrder(playerId, 'Boundary Tester', 'FOCUS', 3, null, 2_000);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('unreachable');
    expect(rejected.code).toBe('ROUND_LOCKED');
    expect(rejected.receipt?.verdict).toBe('REJECTED');
    expect(rejected.receipt?.reason).toBe('ROUND_LOCKED');
    expect(rejected.receipt?.msBeforeLock).toBe(-10);
    expect(rejected.receipt?.seq).toBe(2);

    // Both receipts persisted, and their HMAC signatures verify against the
    // server's stored key (an ops/regulator can settle any dispute from the DB).
    const rows = db.select().from(actionReceipts).all();
    expect(rows).toHaveLength(2);
    const signer = new ReceiptSigner(ensureReceiptKey(db));
    expect(signer.verify(accepted.receipt)).toBe(true);
    expect(signer.verify(rejected.receipt!)).toBe(true);
    // Tampering with a field invalidates the signature.
    expect(signer.verify({ ...accepted.receipt, msBeforeLock: 500 })).toBe(false);
  });

  it('receipts a fog cancel and enforces the one-final-order rule with receipts', () => {
    // Place a fleet early, then move INSIDE Blind Fog (final order), then try again.
    vi.advanceTimersByTime(1_000);
    const first = coordinator.fleetOrder(playerId, 'Boundary Tester', 'FOCUS', 0, null, 1_000);
    expect(first.ok).toBe(true);

    // Blind Fog starts at anchorMs − 3000 = 9s.
    vi.advanceTimersByTime(8_500); // T+9.5s, inside fog
    const fogMove = coordinator.fleetOrder(playerId, 'Boundary Tester', 'FOCUS', 4, null, 1_000);
    expect(fogMove.ok).toBe(true);
    if (!fogMove.ok) throw new Error('unreachable');
    expect(fogMove.finalOrderUsed).toBe(true);

    vi.advanceTimersByTime(200);
    const second = coordinator.cancelOrder(playerId);
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('unreachable');
    expect(second.code).toBe('FINAL_ORDER_USED');
    expect(second.receipt?.verdict).toBe('REJECTED');

    const rows = db.select().from(actionReceipts).all();
    expect(rows.map((r) => r.verdict)).toEqual(['ACCEPTED', 'ACCEPTED', 'REJECTED']);
    // Sequence is monotonic per round.
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
  });
});
