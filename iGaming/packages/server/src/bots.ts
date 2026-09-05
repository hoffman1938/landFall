/**
 * Local practice bots — simulated players so a solo player can see and feel the
 * pari-mutuel crowd dynamics. Bots go through the exact same server-side
 * anchor path (balance checks, phase gating, rate limits) as humans, and are
 * settled identically; they have no access to outcomes (the draw doesn't exist
 * until lock, and is a pure function of the pre-committed seed either way).
 *
 * Behavior: each bot joins most rounds at a random moment of the anchor
 * window, with a varied stake, mildly preferring less-crowded harbors; some
 * re-anchor in the final seconds using only the public Tide Report — reproducing
 * the Blind Fog mind game without giving practice bots exact hidden pools.
 * Disable with LANDFALL_BOTS=0.
 */
import { eq } from 'drizzle-orm';
import { STARTING_BALANCE_MINOR, ZONE_COUNT, type TideBand } from '@landfall/core';
import type { RoundCoordinator } from './coordinator.js';
import type { Db } from './db/index.js';
import { players } from './db/schema.js';
import { log } from './log.js';
import { randomName } from './names.js';

interface Bot {
  id: string;
  name: string;
}

export class BotManager {
  private bots: Bot[] = [];
  private poll: NodeJS.Timeout | null = null;
  private pending: NodeJS.Timeout[] = [];
  private lastRound = 0;
  /** Per-tier stake table (D3/C2): multiples of the room's min stake, clamped
   *  to the tier ceiling — a min-stake human is always visible in the pools. */
  private stakesMinor: number[];

  constructor(
    private db: Db,
    private coordinator: RoundCoordinator,
    private count: number,
  ) {
    // C5: constructing a BotManager for a room that does not allow bots is a
    // programming error, and it crashes rather than warns.
    if (!coordinator.cfg.botsAllowed) {
      throw new Error(
        `BOTS POLICY VIOLATION: BotManager constructed for room "${coordinator.cfg.roomId}" with botsAllowed=false`,
      );
    }
    const { minStakeMinor, maxStakeMinor } = coordinator.cfg;
    this.stakesMinor = [2, 5, 5, 10, 25, 50, 100].map((m) =>
      Math.max(minStakeMinor, Math.min(maxStakeMinor, m * minStakeMinor)),
    );
  }

  start(): void {
    for (let i = 0; i < this.count; i++) this.bots.push(this.ensureBot(i));
    this.poll = setInterval(() => this.tick(), 200);
    log.info('practice bots active', {
      room: this.coordinator.cfg.roomId,
      count: this.bots.length,
      names: this.bots.map((b) => b.name),
    });
  }

  stop(): void {
    if (this.poll) clearInterval(this.poll);
    for (const t of this.pending) clearTimeout(t);
  }

  /** Bots have stable per-room ids so they persist across server restarts,
   *  and are marked is_bot in the DB (C5: excluded from Golden Anchor). */
  private ensureBot(i: number): Bot {
    const id = `bot-${this.coordinator.cfg.roomId}-${i}`;
    const existing = this.db.select().from(players).where(eq(players.id, id)).get();
    if (existing) return { id: existing.id, name: existing.name };
    let name = randomName();
    while (this.db.select().from(players).where(eq(players.name, name)).get()) {
      name = `${randomName()}${Math.floor(Math.random() * 90 + 10)}`;
    }
    this.db
      .insert(players)
      .values({
        id,
        name,
        balanceMinor: STARTING_BALANCE_MINOR,
        isHouse: false,
        isBot: true,
        lastRoomId: this.coordinator.cfg.roomId,
        createdAt: Date.now(),
      })
      .run();
    return { id, name };
  }

  private tick(): void {
    const phase = this.coordinator.phaseInfo();
    const round = this.coordinator.roundHeader();
    if (phase.phase !== 'ANCHOR_OPEN' || round.roundId === this.lastRound) return;
    this.lastRound = round.roundId;

    const windowMs = phase.endsAt - Date.now();
    for (const bot of this.bots) {
      if (Math.random() < 0.15) continue; // sits this round out
      this.topUp(bot);
      // Bots chase surge rounds like humans do — bigger stakes when the pot pays.
      const surgeBoost = round.surgeRound ? 2 : 1;
      const base = this.stakesMinor[Math.floor(Math.random() * this.stakesMinor.length)]!;
      const stake = Math.min(this.coordinator.cfg.maxStakeMinor, base * surgeBoost);

      // Initial anchor at a random moment in the first ~70% of the window.
      const t1 = 300 + Math.random() * Math.max(500, windowMs * 0.7 - 300);
      this.pending.push(setTimeout(() => this.placeFleet(bot, stake), t1));

      // ~40% re-anchor in the final 2s toward a less-crowded harbor (the scramble).
      if (Math.random() < 0.4 && windowMs > 2_500) {
        const t2 = windowMs - (400 + Math.random() * 1_400);
        this.pending.push(setTimeout(() => this.placeFleet(bot, stake, true), t2));
      }
    }
    this.pending = this.pending.filter((t) => t.hasRef?.() ?? true);
  }

  private placeFleet(bot: Bot, stake: number, sharp = false): void {
    const primary = this.pickZone(sharp);
    if (Math.random() < 0.28) {
      let secondary = this.pickZone(true);
      if (secondary === primary) secondary = (primary + 3) % ZONE_COUNT;
      this.coordinator.fleetOrder(bot.id, bot.name, 'SPLIT', primary, secondary, stake);
      return;
    }
    this.coordinator.anchor(bot.id, bot.name, primary, stake);
  }

  /** Mildly anti-crowd: prefer lower public tide bands, with noise so bots don't stack. */
  private pickZone(sharp = false): number {
    const report = this.coordinator.tideReportState();
    const bandScore: Record<TideBand, number> = {
      seed: 0,
      light: 1,
      medium: 2,
      heavy: 3,
      packed: 4,
    };
    if (Math.random() < (sharp ? 0.75 : 0.5)) {
      const order = report.entries
        .map((entry) => ({
          score:
            bandScore[entry.band] +
            (entry.trend === 'rising' ? 0.25 : entry.trend === 'falling' ? -0.25 : 0),
          zone: entry.zone,
        }))
        .sort((a, b) => a.score - b.score);
      return order[Math.floor(Math.random() * 2)]!.zone; // one of the two emptiest
    }
    return Math.floor(Math.random() * ZONE_COUNT);
  }

  /** Practice bots reset to the starting balance when low so they never run dry
   *  and stay near the table's headline balance (their PnL is not meaningful). */
  private topUp(bot: Bot): void {
    const row = this.db.select().from(players).where(eq(players.id, bot.id)).get();
    if (row && row.balanceMinor < STARTING_BALANCE_MINOR / 2) {
      this.db
        .update(players)
        .set({ balanceMinor: STARTING_BALANCE_MINOR })
        .where(eq(players.id, bot.id))
        .run();
    }
  }
}
