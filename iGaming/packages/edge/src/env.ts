/**
 * The Worker's bindings and configuration.
 *
 * The variable names deliberately match the Node host's environment variables
 * so a room tier, a rake split or a bot head-count is configured the same way
 * on both hosts (`main.ts` reads these from `process.env`).
 */
import type { LandfallGame } from './game.js';

export interface Env {
  /** The built web client (`packages/web/dist`), served for every non-API path. */
  ASSETS: Fetcher;
  /** The game itself — one instance, addressed by name. */
  LANDFALL_GAME: DurableObjectNamespace<LandfallGame>;

  /** `demo` enables practice bots (C5); anything else refuses to seat them. */
  LANDFALL_ENV?: string;
  /** Override the per-room bot head-count; `0` disables bots entirely. */
  LANDFALL_BOTS?: string;
  LANDFALL_RAKE?: string;
  LANDFALL_RAKE_SPLIT?: string;
  LANDFALL_MAX_PAYOUT_MULTIPLE?: string;
  LANDFALL_SURGE_FLAT_EVERY?: string;
  LANDFALL_SURGE_PROB?: string;
  /**
   * Bearer token for the §2.4.1 operator disable/enable endpoints. Unset means
   * those routes refuse to act — never that they act without authentication.
   */
  LANDFALL_OPS_TOKEN?: string;
}
