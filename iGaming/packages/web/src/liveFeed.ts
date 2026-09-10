/**
 * The live results feed — who just won what, round after round.
 *
 * Seeing other people settle is the difference between a table and a form, and
 * it is the one social signal an instant game can honestly give. Two rules keep
 * it from becoming the dishonest version of itself:
 *
 *  1. LOSSES ARE IN THE FEED. A winners-only ticker is a highlight reel, and a
 *     highlight reel of a 1-in-6 game teaches the wrong base rate. Every fleet
 *     that settled is eligible, and the round header carries the plain count of
 *     how many won and how many lost.
 *  2. PRACTICE FLEETS ARE LABELLED. Demo rooms are seated with bots that share
 *     the player name generator, so an unlabelled feed would read as a room
 *     full of humans winning. `bot` comes straight from the server (C5) and is
 *     never inferred, guessed, or dropped.
 *
 * Nothing here is generated: every row is a settled result the server already
 * broadcast to everyone at this table.
 */
export interface FeedRow {
  key: string;
  name: string;
  netMinor: number;
  outcome: 'SAFE' | 'WRECKED' | 'SPLIT';
  bot: boolean;
  you: boolean;
  /** This player took the Storm Surge pot this round. */
  jackpot: boolean;
}

export interface FeedRound {
  roundId: number;
  struckZone: number;
  /** Storm Power share multiplier for the round; 1 when there was no bonus. */
  multiplier: number;
  wonCount: number;
  lostCount: number;
  /** Highest positive net this round, across every fleet. */
  topWinMinor: number;
  rows: FeedRow[];
  /** True when rows were trimmed; the UI says so instead of implying a full list. */
  truncated: boolean;
  at: number;
}

/** Rows kept per round. Enough to feel like a table, short enough to scan. */
export const FEED_ROWS_PER_ROUND = 7;
/** Rounds kept in the panel. */
export const FEED_ROUNDS = 12;

export interface FeedSource {
  roundId: number;
  struckZone: number;
  results: readonly {
    name: string;
    outcome: 'SAFE' | 'WRECKED' | 'SPLIT';
    netMinor: number;
    bot?: boolean;
  }[];
  stormPower?: { mNum: number; mDen: number } | undefined;
  surge?: { winnerName: string | null } | undefined;
}

/** Build one round's block. `yourName` is highlighted and never trimmed away. */
export function roundFeed(source: FeedSource, yourName: string | null, at: number): FeedRound {
  const multiplier =
    source.stormPower && source.stormPower.mDen > 0
      ? source.stormPower.mNum / source.stormPower.mDen
      : 1;
  const jackpotName = source.surge?.winnerName ?? null;
  const all: FeedRow[] = source.results.map((r, i) => ({
    key: `${source.roundId}:${i}:${r.name}`,
    name: r.name,
    netMinor: r.netMinor,
    outcome: r.outcome,
    bot: r.bot === true,
    you: yourName !== null && r.name === yourName,
    jackpot: jackpotName !== null && r.name === jackpotName,
  }));

  const wonCount = all.filter((r) => r.netMinor > 0).length;
  const lostCount = all.filter((r) => r.netMinor < 0).length;
  const topWinMinor = all.reduce((best, r) => Math.max(best, r.netMinor), 0);

  // Your own row first — the feed is worth reading because you are in it —
  // then the largest movements, wins before losses of the same size.
  const ranked = [...all].sort((a, b) => {
    if (a.you !== b.you) return a.you ? -1 : 1;
    if (a.netMinor !== b.netMinor) return b.netMinor - a.netMinor;
    return a.name.localeCompare(b.name);
  });
  const rows = ranked.slice(0, FEED_ROWS_PER_ROUND);

  return {
    roundId: source.roundId,
    struckZone: source.struckZone,
    multiplier,
    wonCount,
    lostCount,
    topWinMinor,
    rows,
    truncated: ranked.length > rows.length,
    at,
  };
}

/** Newest round first, oldest dropped; a re-broadcast round replaces itself. */
export function pushRound(feed: readonly FeedRound[], round: FeedRound): FeedRound[] {
  return [round, ...feed.filter((r) => r.roundId !== round.roundId)].slice(0, FEED_ROUNDS);
}
