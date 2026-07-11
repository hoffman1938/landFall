/**
 * ChatService — docs/02-game-design/game-design-document.md §5.1,
 * docs/05-security/security-review.md §1.13-1.15.
 * Token-bucket rate limit (separate budget from gameplay), word-list filter
 * (reject-not-mask), escalating cooldown on repeat violations.
 */
import { CHAT_BURST, CHAT_MAX_LEN, CHAT_MIN_INTERVAL_MS, type ChatEntry } from '@landfall/core';
import type { Db } from './db/index.js';
import { chatMessages } from './db/schema.js';

// Small starter word list; maintained, not exhaustive. Rejects the message outright.
const BLOCKED = [/\bfuck/i, /\bshit\b/i, /\bcunt/i, /\bnigg/i, /\bfag/i, /https?:\/\//i, /\bwww\./i];

interface Bucket {
  tokens: number;
  lastRefill: number;
  violations: number;
  cooldownUntil: number;
}

export type ChatResult =
  | { ok: true; entry: ChatEntry }
  | { ok: false; code: 'RATE_LIMITED' | 'BLOCKED_CONTENT' | 'TOO_LONG'; message: string };

export class ChatService {
  private buckets = new Map<string, Bucket>();

  constructor(private db: Db) {}

  submit(
    playerId: string,
    name: string,
    text: string,
    roomId: string | null = null,
    now = Date.now(),
  ): ChatResult {
    if (text.length > CHAT_MAX_LEN) {
      return { ok: false, code: 'TOO_LONG', message: 'Message too long.' };
    }
    const b = this.bucket(playerId, now);
    if (now < b.cooldownUntil) {
      return { ok: false, code: 'RATE_LIMITED', message: 'Chat cooldown active — slow down.' };
    }
    // refill
    const refill = Math.floor((now - b.lastRefill) / CHAT_MIN_INTERVAL_MS);
    if (refill > 0) {
      b.tokens = Math.min(CHAT_BURST, b.tokens + refill);
      b.lastRefill += refill * CHAT_MIN_INTERVAL_MS;
    }
    if (b.tokens <= 0) {
      b.violations += 1;
      if (b.violations >= 5) {
        b.cooldownUntil = now + 30_000;
        b.violations = 0;
      }
      return { ok: false, code: 'RATE_LIMITED', message: 'Sending too fast — message not sent.' };
    }
    if (BLOCKED.some((re) => re.test(text))) {
      return { ok: false, code: 'BLOCKED_CONTENT', message: 'Message not sent (blocked content).' };
    }
    b.tokens -= 1;

    const entry: ChatEntry = { name, text, at: now };
    this.db.insert(chatMessages).values({ roomId, playerId, name, text, createdAt: now }).run();
    return { ok: true, entry };
  }

  private bucket(playerId: string, now: number): Bucket {
    let b = this.buckets.get(playerId);
    if (!b) {
      b = { tokens: CHAT_BURST, lastRefill: now, violations: 0, cooldownUntil: 0 };
      this.buckets.set(playerId, b);
    }
    return b;
  }
}
