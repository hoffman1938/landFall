/**
 * The server package's public surface — what a *host* needs to stand the game
 * up.
 *
 * Deliberately excludes `db/index.ts` (better-sqlite3) and `rooms-file.ts`
 * (filesystem): those are the Node host's own choices, and a runtime that has
 * neither — the Cloudflare Workers build in `packages/edge` — imports this
 * module and supplies its own database and bundled config instead. Node's
 * entry point is `main.ts`, which reaches for those two directly.
 *
 * Everything below is host-neutral by construction, which is the property that
 * keeps one implementation of the game rather than one per runtime.
 */
export { createApp, type AppOps } from './app.js';
export { BotManager, DEFAULT_BOT_COUNT, seatBots } from './bots.js';
export { ensureChain, type ChainHandle } from './chain.js';
export { ChatService } from './chat.js';
export { monotonicMs } from './clock.js';
export {
  DEFAULT_ECONOMY,
  DEFAULT_ROOM,
  RoundCoordinator,
  type CoordinatorEvents,
  type EconomyConfig,
  type RoomConfig,
  type Timings,
} from './coordinator.js';
export type { Db } from './db/database.js';
export { SCHEMA_DDL } from './db/ddl.js';
export {
  DrizzleSqliteRepository,
  type GameRepository,
  type TransactionHost,
} from './db/repository.js';
export * as schema from './db/schema.js';
export { ensureHousePlayer, HOUSE_BANKROLL_MINOR } from './house.js';
export { Hub, type HubConnection, type HubSocket } from './hub.js';
export { LimitsService } from './limits.js';
export { instanceId, log } from './log.js';
export { metrics } from './metrics.js';
export {
  RoomManager,
  isDemoEnv,
  resolveRoomConfig,
  resolveRoomConfigs,
  type RoomConfigJson,
} from './rooms.js';
