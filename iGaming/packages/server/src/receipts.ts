/**
 * Signed action receipts (remediation B1) — the server's non-repudiable record
 * of what it accepted or rejected at the fog/lock boundary, and when.
 *
 * The receipt key is a server secret (separate from the fairness seed chain —
 * receipts are an ops/dispute artifact, not part of the provably-fair surface).
 * HMAC is symmetric: players cannot verify signatures themselves, but the
 * signature binds the operator — any receipt a client stored can be validated
 * by ops/regulator against the persisted key, so "the server never got my
 * order" / "the server backdated my order" disputes are decidable.
 */
import { createHash, createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { ActionReceipt } from '@landfall/core';
import type { Db } from './db/index.js';
import { serverSecrets } from './db/schema.js';
import { randomHex } from './random.js';

/** Canonical string the signature covers — order matters, documented here once. */
function canonical(r: Omit<ActionReceipt, 'sigHex'>): string {
  return [
    'landfall-receipt-v1',
    r.roundId,
    r.seq,
    r.playerId,
    r.action,
    r.actionHash,
    r.ts,
    r.msBeforeLock,
    r.verdict,
    r.reason ?? '',
  ].join('|');
}

export class ReceiptSigner {
  constructor(private keyHex: string) {}

  sign(fields: Omit<ActionReceipt, 'sigHex'>): ActionReceipt {
    const sigHex = createHmac('sha256', Buffer.from(this.keyHex, 'hex'))
      .update(canonical(fields))
      .digest('hex');
    return { ...fields, sigHex };
  }

  verify(receipt: ActionReceipt): boolean {
    const { sigHex, ...fields } = receipt;
    return this.sign(fields).sigHex === sigHex;
  }
}

/** SHA-256 hex of the canonical action payload (what the player asked for). */
export function hashActionPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Load (or create once) the server's receipt-signing key. */
export function ensureReceiptKey(db: Db): string {
  const row = db.select().from(serverSecrets).where(eq(serverSecrets.id, 1)).get();
  if (row) return row.receiptKeyHex;
  const keyHex = randomHex(32);
  db.insert(serverSecrets).values({ id: 1, receiptKeyHex: keyHex }).run();
  return keyHex;
}
