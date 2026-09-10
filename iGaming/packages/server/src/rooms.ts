/**
 * Room manager (remediation C1/C2/C5) — N rooms, each an independent
 * RoundCoordinator with its own tier config. Tier configs live in SERVER
 * CONFIG, not code: `config/rooms.json` next to the server package (or the
 * file named by LANDFALL_ROOMS_FILE, or inline LANDFALL_ROOMS_JSON).
 *
 * BOTS POLICY (C5, non-negotiable): `botsAllowed` is hard-false unless the
 * server runs with LANDFALL_ENV=demo. A room config requesting bots outside
 * demo is a STARTUP CRASH, not a warning — bots can never touch a real-money
 * surface by construction. `botCount` and `botBankrollMinor` are tier economics
 * and live beside the stake tiers for the same reason: a bot has to be able to
 * afford the table it sits at, and that number is different in every room.
 */
import { ZONE_COUNT, liquidityLevel, surgeFloorFor, validateRakeConfig } from '@landfall/core';
import { defaultBotBankrollMinor } from './bots.js';
import type { ChainHandle } from './chain.js';
import {
  DEFAULT_ECONOMY,
  DEFAULT_ROOM,
  RoundCoordinator,
  type CoordinatorEvents,
  type RoomConfig,
  type Timings,
} from './coordinator.js';
import type { GameRepository } from './db/repository.js';
import type { LimitsService } from './limits.js';

/** JSON shape of one room in the config file (all fields optional but roomId/name). */
export interface RoomConfigJson {
  roomId: string;
  name: string;
  minStakeMinor?: number;
  maxStakeMinor?: number;
  whaleCapFraction?: number;
  seedMinor?: number;
  /** Adaptive liquidity (core/liquidity.ts): floor and token seed. */
  liquidityFloorMinor?: number;
  minSeedMinor?: number;
  botsAllowed?: boolean;
  /** Practice bots seated here; omitted = the server's global default. */
  botCount?: number;
  /** Balance a practice bot is topped back up to; omitted = derived from the tier. */
  botBankrollMinor?: number;
  surgeProb?: number;
  /**
   * Jackpot floor the house re-seeds after a payout at THIS table. Omitted =
   * derived from the tier (core `surgeFloorFor`), so a table's jackpot is
   * always worth something in that table's own money.
   */
  surgeFloorMinor?: number;
  signalMinStakeMinor?: number;
  rake?: number;
  rakeSplit?: { house: number; surge: number; stormReserve: number };
  maxPayoutMultiple?: number;
  surgeFlatEveryN?: number;
}

export function isDemoEnv(env = process.env.LANDFALL_ENV): boolean {
  return env === 'demo';
}

export function resolveRoomConfig(
  json: RoomConfigJson,
  base: RoomConfig,
  demo: boolean,
): RoomConfig {
  const botsAllowed = json.botsAllowed ?? false;
  if (botsAllowed && !demo) {
    // C5: crash, never warn. A bot in a real-money room is a product-ending defect.
    throw new Error(
      `BOTS POLICY VIOLATION: room "${json.roomId}" sets botsAllowed but LANDFALL_ENV is not "demo". Refusing to start.`,
    );
  }
  const cfg: RoomConfig = {
    ...base,
    roomId: json.roomId,
    name: json.name,
    minStakeMinor: json.minStakeMinor ?? base.minStakeMinor,
    maxStakeMinor: json.maxStakeMinor ?? base.maxStakeMinor,
    whaleCapFraction: json.whaleCapFraction ?? base.whaleCapFraction,
    seedMinor: json.seedMinor ?? base.seedMinor,
    liquidityFloorMinor:
      json.liquidityFloorMinor ?? (json.seedMinor ?? base.seedMinor) * ZONE_COUNT,
    minSeedMinor: json.minSeedMinor ?? json.minStakeMinor ?? base.minSeedMinor,
    botsAllowed,
    botCount: json.botCount ?? base.botCount,
    botBankrollMinor:
      json.botBankrollMinor ?? defaultBotBankrollMinor(json.maxStakeMinor ?? base.maxStakeMinor),
    surgeProb: json.surgeProb ?? base.surgeProb,
    surgeFloorMinor:
      json.surgeFloorMinor ?? surgeFloorFor(json.minStakeMinor ?? base.minStakeMinor),
    signalMinStakeMinor: json.signalMinStakeMinor ?? base.signalMinStakeMinor,
    econ: {
      rake: json.rake ?? base.econ.rake,
      rakeSplit: json.rakeSplit ?? base.econ.rakeSplit,
      maxPayoutMultiple: json.maxPayoutMultiple ?? base.econ.maxPayoutMultiple,
      surgeFlatEveryN: json.surgeFlatEveryN ?? base.econ.surgeFlatEveryN,
    },
  };
  validateRakeConfig(cfg.econ.rake, cfg.econ.rakeSplit);
  if (cfg.minStakeMinor > cfg.maxStakeMinor) {
    throw new Error(`room "${cfg.roomId}": minStake > maxStake`);
  }
  if (cfg.minSeedMinor > cfg.seedMinor) {
    throw new Error(
      `room "${cfg.roomId}": minSeedMinor (${cfg.minSeedMinor}) exceeds the seed ceiling (${cfg.seedMinor})`,
    );
  }
  if (!Number.isInteger(cfg.surgeFloorMinor) || cfg.surgeFloorMinor < 0) {
    throw new Error(
      `room "${cfg.roomId}": surgeFloorMinor must be a non-negative whole number of minor units`,
    );
  }
  if (cfg.liquidityFloorMinor < 0) {
    throw new Error(`room "${cfg.roomId}": liquidityFloorMinor must not be negative`);
  }
  /*
   * The round-share cap on a dead table is (w / (1 - w)) x the guaranteed
   * liquidity. If that is below the table's own minimum stake, the first bettor
   * of every round is rejected and the room is unplayable until someone else
   * bets — which nobody can. The shipped tiers all satisfy this; the check is
   * here so a future config cannot quietly break it.
   */
  const deadTableCapMinor = Math.floor(
    (cfg.whaleCapFraction / (1 - cfg.whaleCapFraction)) * cfg.liquidityFloorMinor,
  );
  if (cfg.whaleCapFraction < 1 && deadTableCapMinor < cfg.minStakeMinor) {
    throw new Error(
      `room "${cfg.roomId}": the ${Math.round(cfg.whaleCapFraction * 100)}% round-share cap on a quiet table allows only ${deadTableCapMinor} minor units, below the table minimum of ${cfg.minStakeMinor}. Raise liquidityFloorMinor to at least ${Math.ceil((cfg.minStakeMinor * (1 - cfg.whaleCapFraction)) / cfg.whaleCapFraction)}.`,
    );
  }
  if (cfg.botCount !== null && (!Number.isInteger(cfg.botCount) || cfg.botCount < 0)) {
    throw new Error(`room "${cfg.roomId}": botCount must be a non-negative integer`);
  }
  // A bot that cannot cover one table-maximum stake would be topped up mid-round
  // forever and never show up in the pools at the size the tier advertises.
  if (!Number.isInteger(cfg.botBankrollMinor) || cfg.botBankrollMinor < cfg.maxStakeMinor) {
    throw new Error(
      `room "${cfg.roomId}": botBankrollMinor (${cfg.botBankrollMinor}) must be a whole number of minor units and at least the tier maximum stake (${cfg.maxStakeMinor})`,
    );
  }
  return cfg;
}

/**
 * Resolve an already-parsed rooms document. Split from `loadRoomConfigs` so a
 * host with no filesystem (Cloudflare Workers, where the config is bundled)
 * gets the identical validation — including the C5 bots policy — instead of a
 * second, laxer code path.
 */
export function resolveRoomConfigs(
  parsed: { rooms: RoomConfigJson[] },
  demo: boolean,
  timings: Timings,
  surgeProb: number,
  baseEcon = DEFAULT_ECONOMY,
): RoomConfig[] {
  if (!Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
    throw new Error('rooms config must contain at least one room');
  }
  const base: RoomConfig = {
    ...DEFAULT_ROOM,
    econ: { ...baseEcon },
    timings,
    surgeProb,
  };
  const ids = new Set<string>();
  return parsed.rooms.map((r) => {
    if (ids.has(r.roomId)) throw new Error(`duplicate roomId "${r.roomId}"`);
    ids.add(r.roomId);
    return resolveRoomConfig(r, base, demo);
  });
}

export class RoomManager {
  readonly rooms = new Map<string, RoundCoordinator>();

  constructor(
    repo: GameRepository,
    chain: ChainHandle,
    configs: RoomConfig[],
    makeEvents: (roomId: string) => CoordinatorEvents,
    /** F1/F2: one shared service — limits follow the player across rooms. */
    limits?: LimitsService,
  ) {
    for (const cfg of configs) {
      this.rooms.set(
        cfg.roomId,
        new RoundCoordinator(repo, chain, makeEvents(cfg.roomId), cfg, limits),
      );
    }
  }

  get(roomId: string): RoundCoordinator | undefined {
    return this.rooms.get(roomId);
  }

  get defaultRoomId(): string {
    return this.rooms.keys().next().value as string;
  }

  /**
   * Where to seat a player who has no room preference.
   *
   * Liquidity is the product's existential risk: the strategy layer only exists
   * when pools differ, and pools only differ when people are in the same room.
   * Splitting a small population evenly across the tier ladder is the worst
   * thing this server can do to itself — and the ladder got longer when the
   * high-roller rooms were added, so it matters more now, not less. An unrouted
   * player therefore goes to the BUSIEST room they are eligible for, and only
   * falls back to configuration order when every room is equally empty. Stake
   * eligibility still wins — nobody is seated at a table they cannot afford.
   */
  bestRoomFor(humansPerRoom: ReadonlyMap<string, number>, balanceMinor?: number): string {
    const order = [...this.rooms.keys()];
    let bestId = this.defaultRoomId;
    let bestScore = -1;
    for (const [index, roomId] of order.entries()) {
      const room = this.rooms.get(roomId);
      if (!room) continue;
      if (balanceMinor !== undefined && balanceMinor < room.cfg.minStakeMinor) continue;
      // Population first; configuration order breaks ties (earlier = cheaper).
      const score = (humansPerRoom.get(roomId) ?? 0) * 1000 + (order.length - index);
      if (score > bestScore) {
        bestScore = score;
        bestId = roomId;
      }
    }
    return bestId;
  }

  /** Lobby hint per room — display and routing only, never odds (C2). */
  liquidityFor(roomId: string, humanCount: number) {
    return this.rooms.has(roomId) ? liquidityLevel(humanCount) : 'quiet';
  }

  start(): void {
    for (const room of this.rooms.values()) room.start();
  }

  /** Idle parking preserves accepted bets until their current round settles. */
  park(): void {
    for (const room of this.rooms.values()) room.park();
  }

  stop(): void {
    for (const room of this.rooms.values()) room.stop();
  }
}
