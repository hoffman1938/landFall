import { describe, expect, it } from 'vitest';
import {
  FEED_ROUNDS,
  FEED_ROWS_PER_ROUND,
  pushRound,
  roundFeed,
  type FeedSource,
} from '../src/liveFeed';

const source = (over: Partial<FeedSource> = {}): FeedSource => ({
  roundId: 10,
  struckZone: 2,
  results: [
    { name: 'Ada', outcome: 'SAFE', netMinor: 120 },
    { name: 'SaltyJib', outcome: 'SAFE', netMinor: 400, bot: true },
    { name: 'Bo', outcome: 'WRECKED', netMinor: -500 },
  ],
  ...over,
});

describe('live results feed', () => {
  it('keeps losses in the feed and counts both sides of the round', () => {
    const round = roundFeed(source(), 'Ada', 1_000);
    expect(round.wonCount).toBe(2);
    expect(round.lostCount).toBe(1);
    expect(round.rows.some((r) => r.netMinor < 0)).toBe(true);
    expect(round.topWinMinor).toBe(400);
  });

  it('carries the server bot marker through instead of inferring it', () => {
    const round = roundFeed(source(), 'Ada', 1_000);
    expect(round.rows.find((r) => r.name === 'SaltyJib')!.bot).toBe(true);
    expect(round.rows.find((r) => r.name === 'Bo')!.bot).toBe(false);
  });

  it('puts you first, then ranks by size', () => {
    const round = roundFeed(source(), 'Ada', 1_000);
    expect(round.rows[0]!.name).toBe('Ada');
    expect(round.rows[0]!.you).toBe(true);
    expect(round.rows.slice(1).map((r) => r.name)).toEqual(['SaltyJib', 'Bo']);
  });

  it('never trims your own row away', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `P${i}`,
      outcome: 'SAFE' as const,
      netMinor: 1_000 - i,
    }));
    const round = roundFeed(
      source({ results: [...many, { name: 'Me', outcome: 'WRECKED', netMinor: -900 }] }),
      'Me',
      1_000,
    );
    expect(round.rows).toHaveLength(FEED_ROWS_PER_ROUND);
    expect(round.rows[0]!.name).toBe('Me');
    expect(round.truncated).toBe(true);
  });

  it('reads the multiplier and the jackpot winner from the round', () => {
    const round = roundFeed(
      source({ stormPower: { mNum: 5, mDen: 4 }, surge: { winnerName: 'Ada' } }),
      'Ada',
      1_000,
    );
    expect(round.multiplier).toBe(1.25);
    expect(round.rows.find((r) => r.name === 'Ada')!.jackpot).toBe(true);
    expect(roundFeed(source(), null, 1_000).multiplier).toBe(1);
  });

  it('marks nobody as you when the name is unknown', () => {
    expect(roundFeed(source(), null, 1_000).rows.every((r) => !r.you)).toBe(true);
  });

  it('keeps newest first, caps the history and replaces a re-sent round', () => {
    let feed = pushRound([], roundFeed(source({ roundId: 1 }), null, 1));
    feed = pushRound(feed, roundFeed(source({ roundId: 2 }), null, 2));
    expect(feed.map((r) => r.roundId)).toEqual([2, 1]);

    feed = pushRound(feed, roundFeed(source({ roundId: 2, struckZone: 5 }), null, 3));
    expect(feed.map((r) => r.roundId)).toEqual([2, 1]);
    expect(feed[0]!.struckZone).toBe(5);

    for (let id = 3; id < 3 + FEED_ROUNDS + 4; id++) {
      feed = pushRound(feed, roundFeed(source({ roundId: id }), null, id));
    }
    expect(feed).toHaveLength(FEED_ROUNDS);
    expect(feed[0]!.roundId).toBeGreaterThan(feed[1]!.roundId);
  });
});
