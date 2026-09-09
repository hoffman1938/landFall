/**
 * Cloudflare Worker entry point.
 *
 * Two jobs, and deliberately nothing else: hand the game's traffic to the
 * Durable Object that owns the rounds, and let the static asset server answer
 * everything else. All the game logic lives in `@landfall/server` and runs
 * inside the Durable Object.
 */
import { LandfallGame } from './game.js';
import type { Env } from './env.js';

/**
 * One game instance for the whole deployment.
 *
 * Named rather than random because the point of a pari-mutuel table is that
 * everyone stands at the same one: a per-request id would give every player a
 * private game with nobody else's money in the pools. Stake tiers already
 * separate players into rooms *inside* this instance (C1/C2), which is the
 * separation the product actually wants.
 */
const GAME_INSTANCE = 'landfall-global';

/** Paths the game owns; everything else is the web client. */
function isGamePath(pathname: string): boolean {
  return pathname === '/ws' || pathname.startsWith('/api/');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (isGamePath(url.pathname)) {
      const id = env.LANDFALL_GAME.idFromName(GAME_INSTANCE);
      return env.LANDFALL_GAME.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export { LandfallGame };
