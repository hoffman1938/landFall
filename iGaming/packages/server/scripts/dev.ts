/**
 * Local development entrypoint.
 *
 * The shipped `config/rooms.json` seats practice bots in every room, and the
 * C5 bots policy makes that a STARTUP CRASH unless the process declares itself
 * a demo (`LANDFALL_ENV=demo`) — which is exactly right for a real deployment
 * and exactly wrong for `pnpm dev`, where it stopped the server from booting at
 * all. This file is the one place that opts local development into demo mode.
 *
 * Why a file and not `LANDFALL_ENV=demo tsx src/main.ts` in the npm script: that
 * form is POSIX shell syntax and fails on Windows `cmd`, which is what pnpm
 * spawns there. This works on every platform without adding a dependency.
 *
 * It deliberately does NOT weaken the policy: `pnpm start` still runs
 * `src/main.ts` directly with no demo default, so a production-shaped launch
 * with a bots room still crashes, and CI's bots-policy job still passes. An
 * explicit LANDFALL_ENV in the environment always wins over this default.
 */
export {}; // makes this a module, so the top-level await below is legal

process.env.LANDFALL_ENV ??= 'demo';

// Dynamic, not a static import: static imports are hoisted above the assignment
// above, and main.ts reads LANDFALL_ENV while it is being evaluated.
await import('../src/main.js');
