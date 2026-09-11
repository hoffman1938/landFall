/**
 * Software identification (gap G34; GLI-19 §2.6.2).
 *
 * "Player software shall contain sufficient information to identify the software
 * and its version." One line of a laboratory checklist, and the client had no
 * version surface at all — which also makes a support or dispute conversation
 * needlessly hard, because nobody can say which build a player was on.
 *
 * `BUILD_ID` is injected at build time by Vite (see vite.config.ts). It falls
 * back to 'dev' rather than throwing: a missing build stamp should never be the
 * reason a player cannot open the game.
 */
declare const __LANDFALL_BUILD_ID__: string | undefined;

export const BUILD_VERSION = '0.1.0';

export const BUILD_ID: string =
  typeof __LANDFALL_BUILD_ID__ === 'string' ? __LANDFALL_BUILD_ID__ : 'dev';
