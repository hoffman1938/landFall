/**
 * Filesystem-backed rooms config loader — the Node host's entry to the room
 * tier definitions in `config/rooms.json`.
 *
 * Kept out of `rooms.ts` on purpose: that module is imported by the Cloudflare
 * Workers build, which has no filesystem and bundles the same JSON directly.
 * Both hosts converge on `resolveRoomConfigs`, so validation and the C5 bots
 * policy are shared rather than reimplemented per host.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ECONOMY, type RoomConfig, type Timings } from './coordinator.js';
import { resolveRoomConfigs, type RoomConfigJson } from './rooms.js';

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
  return resolveRoomConfigs(parsed, demo, timings, surgeProb, baseEcon);
}
