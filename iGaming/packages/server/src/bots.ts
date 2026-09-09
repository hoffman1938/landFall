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
 *
 * Head-count and bankroll are per-tier, from the rooms config: a bot must be
 * able to afford the table it sits at, so a Leviathan bot carries far more than
 * a Skiff one and the high-roller rooms are not deserted. LANDFALL_BOTS
 * overrides the head-count for every room; LANDFALL_BOTS=0 disables bots.
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

/** Bots per room when neither the room config nor LANDFALL_BOTS says otherwise. */
export const DEFAULT_BOT_COUNT = 14;

/**
 * A bot's bankroll as a multiple of its table's maximum stake, used when the
 * room config does not name one. The tier ceiling is what a bot may be asked
 * to cover; 25× of it survives a long unlucky streak without the top-up
 * kicking in every round and making the table's balances look synthetic.
 */
export const BOT_BANKROLL_STAKE_MULTIPLE = 25;

/**
 * Default demo bankroll for a bot at a table whose ceiling is `maxStakeMinor`.
 * Never below the human starting balance, so the cheap tiers keep the exact
 * bankroll they have always had.
 */
export function defaultBotBankrollMinor(maxStakeMinor: number): number {
  return Math.max(STARTING_BALANCE_MINOR, maxStakeMinor * BOT_BANKROLL_STAKE_MULTIPLE);
}

export class BotManager {
  private bots: Bot[] = [];
  private poll: ReturnType<typeof setInterval> | null = null;
  private pending: ReturnType<typeof setTimeout>[] = [];
  private lastRound = 0;
  /** Per-tier stake ladder (D3/C2): multiples of the room's min stake, clamped
   *  to the tier ceiling — a min-stake human is always visible in the pools, and
   *  the ×1 rung guarantees the ladder always holds one bet the whale cap on a
   *  dead table will accept. `pickStake` chooses from it. */
  private stakesMinor: number[];
  /** Per-tier demo bankroll — see `defaultBotBankrollMinor`. */
  private bankrollMinor: number;

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
    this.stakesMinor = [1, 2, 5, 5, 10, 25, 50, 100].map((m) =>
      Math.max(minStakeMinor, Math.min(maxStakeMinor, m * minStakeMinor)),
    );
    this.bankrollMinor = coordinator.cfg.botBankrollMinor;
  }

  start(): void {
    for (let i = 0; i < this.count; i++) this.bots.push(this.ensureBot(i));
    this.poll = setInterval(() => this.tick(), 200);
    log.info('practice bots active', {
      room: this.coordinator.cfg.roomId,
      count: this.bots.length,
      bankrollMinor: this.bankrollMinor,
      names: this.bots.map((b) => b.name),
    });
  }

  stop(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    for (const t of this.pending) clearTimeout(t);
    this.pending = [];
    // Cleared so a later start() re-seats rather than doubling the table. The
    // Node host stops only at shutdown, but the Workers host parks the room
    // whenever the last player leaves and restarts it when one returns.
    this.bots = [];
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
        balanceMinor: this.bankrollMinor,
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
      const stake = this.pickStake(round.surgeRound ? 2 : 1);

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

  /**
   * The whale cap (B5) a bot can be CERTAIN of, from public information only.
   * The server evaluates the cap against `max(liquidityFloor, K·seed + other
   * fleets)`; the other fleets are hidden during anchoring, and the published
   * house seed is not. Dropping the hidden term makes this a lower bound on the
   * real cap, which is what we want twice over: a bot that stays under it is
   * never rejected, and it reads nothing a human's client cannot read off the
   * round header (the client pre-checks the same cap — see ControlDeck).
   */
  private publicWhaleCapMinor(): number {
    const { whaleCapFraction, liquidityFloorMinor } = this.coordinator.cfg;
    if (whaleCapFraction >= 1) return Number.POSITIVE_INFINITY;
    const othersMinor = Math.max(
      liquidityFloorMinor,
      ZONE_COUNT * this.coordinator.roundHeader().houseSeedMinor,
    );
    return Math.floor((whaleCapFraction / (1 - whaleCapFraction)) * othersMinor);
  }

  /**
   * A stake this bot can actually place: a random rung of the tier ladder that
   * still fits under the cap above.
   *
   * Without the filter a bot at a high-roller table drew from a ladder spanning
   * the whole tier while B5 held it near the seed total, so most of its anchors
   * were rejected and the expensive rooms — the ones with the fewest real
   * players to begin with — looked deserted. Filtering rather than truncating
   * to the cap matters: clamping every bot to the same number would make the
   * six pools identical, which is the exact failure liquidity.ts exists to
   * prevent.
   */
  private pickStake(surgeBoost: number): number {
    const { minStakeMinor, maxStakeMinor } = this.coordinator.cfg;
    const capMinor = this.publicWhaleCapMinor();
    const boosted = (rung: number) => Math.min(maxStakeMinor, rung * surgeBoost);
    const fits = this.stakesMinor.filter((rung) => boosted(rung) <= capMinor);
    // Nothing fits: bet the table minimum anyway. It is the only honest try, and
    // a room configured so tightly that it rejects its own minimum is a config
    // bug the rooms loader is meant to catch, not something to paper over here.
    if (fits.length === 0) return minStakeMinor;
    return boosted(fits[Math.floor(Math.random() * fits.length)]!);
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

  /** Practice bots reset to the room's bankroll when low so they never run dry
   *  and stay near the table's headline balance (their PnL is not meaningful).
   *  An existing bot row from a cheaper config is topped up too, so raising a
   *  room's tier does not leave its bots permanently unable to anchor. */
  private topUp(bot: Bot): void {
    const row = this.db.select().from(players).where(eq(players.id, bot.id)).get();
    if (row && row.balanceMinor < this.bankrollMinor / 2) {
      this.db
        .update(players)
        .set({ balanceMinor: this.bankrollMinor })
        .where(eq(players.id, bot.id))
        .run();
    }
  }
}

/**
 * Seat practice bots across every room whose config allows them.
 *
 * Shared by both hosts because this is where the C5 bots policy meets the
 * per-tier head-counts: rooms that forbid bots are skipped, `override`
 * (LANDFALL_BOTS) replaces every room's count, and 0 disables bots outright.
 * The rooms loader has already refused `botsAllowed` outside demo, so anything
 * reaching here is permitted by construction.
 */
export function seatBots(
  db: Db,
  rooms: Iterable<RoundCoordinator>,
  override: number | null,
): { managers: BotManager[]; seating: { roomId: string; count: number }[] } {
  const managers: BotManager[] = [];
  const seating: { roomId: string; count: number }[] = [];
  if (override === 0) return { managers, seating };
  for (const room of rooms) {
    if (!room.cfg.botsAllowed) continue;
    const count = override ?? room.cfg.botCount ?? DEFAULT_BOT_COUNT;
    if (count <= 0) continue;
    const manager = new BotManager(db, room, count);
    manager.start();
    managers.push(manager);
    seating.push({ roomId: room.cfg.roomId, count });
  }
  return { managers, seating };
}
