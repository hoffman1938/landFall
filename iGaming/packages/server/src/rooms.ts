/**
 * Room manager (remediation C1/C2/C5) — N rooms, each an independent
 * RoundCoordinator with its own tier config. Tier configs live in SERVER
 * CONFIG, not code: `config/rooms.json` next to the server package (or the
 * file named by LANDFALL_ROOMS_FILE, or inline LANDFALL_ROOMS_JSON).
 *
 * BOTS POLICY (C5, non-negotiable): `botsAllowed` is hard-false unless the
 * server runs with LANDFALL_ENV=demo. A room config requesting bots outside
 * demo is a STARTUP CRASH, not a warning — bots can never touch a real-money
 * surface by construction.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateRakeConfig } from '@landfall/core';
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

/** JSON shape of one room in the config file (all fields optional but roomId/name). */
export interface RoomConfigJson {
  roomId: string;
  name: string;
  minStakeMinor?: number;
  maxStakeMinor?: number;
  whaleCapFraction?: number;
  seedMinor?: number;
  botsAllowed?: boolean;
  surgeProb?: number;
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
    botsAllowed,
    surgeProb: json.surgeProb ?? base.surgeProb,
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
  return cfg;
}

export function loadRoomConfigs(
  demo: boolean,
  timings: Timings,
  surgeProb: number,
  baseEcon = DEFAULT_ECONOMY,
): RoomConfig[] {
  let raw: string;
  if (process.env.LANDFALL_ROOMS_JSON) {
    raw = process.env.LANDFALL_ROOMS_JSON;
  } else {
    const file =
      process.env.LANDFALL_ROOMS_FILE ??
      fileURLToPath(new URL('../config/rooms.json', import.meta.url));
    raw = readFileSync(file, 'utf8');
  }
  const parsed = JSON.parse(raw) as { rooms: RoomConfigJson[] };
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
  ) {
    for (const cfg of configs) {
      this.rooms.set(cfg.roomId, new RoundCoordinator(repo, chain, makeEvents(cfg.roomId), cfg));
    }
  }

  get(roomId: string): RoundCoordinator | undefined {
    return this.rooms.get(roomId);
  }

  get defaultRoomId(): string {
    return this.rooms.keys().next().value as string;
  }

  start(): void {
    for (const room of this.rooms.values()) room.start();
  }

  stop(): void {
    for (const room of this.rooms.values()) room.stop();
  }
}
