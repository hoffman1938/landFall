/**
 * Player-facing vocabulary (UX Simplification v3 — "Plain Words, One Button",
 * docs/07-ux/ux-simplification-v3.md §4). One term per concept, everywhere —
 * including aria-labels — so the string table is the single place to change a
 * word or drop in a Russian/Georgian locale later.
 *
 * Rules enforced by using this module instead of inline copy:
 *   - the bet unit is always "Zone N" (never Cove/Harbor/proper names — those
 *     stay as internal code names in @landfall/core, unseen by players);
 *   - the theme keeps exactly two words in the main UI: "storm" and "safe";
 *   - the action word is the money word: "Place Bet", not "Drop Anchor".
 */

/** The bet unit. `HARBOR_NAMES` stays in core as a code name; players see this. */
export function zoneName(zone: number): string {
  return `Zone ${zone + 1}`;
}

/** The one-sentence explanation (v3 §5) — reused verbatim wherever the rule is stated. */
export const ONE_LINER = 'Pick a zone. One of six is hit — everyone else splits its money.';

export const STR = {
  // Primary action / deck (v3 §12)
  pickZone: 'PICK A ZONE',
  pickZoneSub: 'Tap a zone to start',
  placeBet: 'PLACE BET',
  betPlaced: 'BET PLACED',
  betAgain: 'BET AGAIN',
  updateBet: 'Update bet',
  cancelBet: 'Cancel bet',
  move: 'Move',
  keepZone: 'KEEP',
  lastMoveSet: 'LAST MOVE SET',
  locked: 'LOCKED',
  lockedSub: 'The storm is choosing a zone',
  result: 'RESULT',
  resultSub: 'Settling…',
  nextRoundSoon: 'NEXT ROUND SOON',
  sending: 'SENDING…',
  connecting: 'CONNECTING…',
  reconnecting: 'RECONNECTING…',

  // Bet modes (v3 §4) — Focus/Split become self-labeling
  oneZone: '1 Zone',
  twoZones: '2 Zones',
  oneZoneHint: 'Whole bet on one zone',
  twoZonesHint: '70% on one zone, 30% on another',

  // Phase / status line (Storm Clock, v3 §8/§10)
  phaseBetting: 'BETTING',
  phaseHidden: 'BETS HIDDEN',
  phaseStorm: 'STORM',
  phaseResult: 'RESULT',
  phaseNext: 'NEXT',

  // Round-state hints (Storm Clock instruction line)
  hintPickZone: 'Pick a zone',
  hintPickTwoZones: 'Pick two zones',
  hintCanMove: 'You can still move',
  hintOneLastMove: 'One last move',
  hintLastMoveSet: 'Last move locked in',
  hintLocked: 'Bets locked',
  hintResult: 'Result…',
  hintNext: 'Next round soon',

  // Crowd meter (was Tide Report bands, v3 §4)
  crowdLabel: 'Crowd',
  crowdSeed: 'Empty',
  crowdLight: 'Low',
  crowdMedium: 'Medium',
  crowdHeavy: 'High',
  crowdPacked: 'Full',

  // Payout estimate (v3 §9/§12) — money, never a bare percentage
  ifSafe: 'If safe',
  estimateNote:
    'Estimate. The final amount depends on which zone is hit and how many players share it.',
  paused: 'Paused',

  // Secondary surfaces
  history: 'HISTORY',
  fairness: 'Fairness',
  playerStats: 'Player stats',

  // Signals (v3 §4) — verbs a non-gambler parses instantly
  signal: 'Signal',
  signalJoin: 'Join me',
  signalAvoid: 'Avoid',
  signalStay: 'Staying',
} as const;

/** Crowd level from a tide band (v3 §4). */
export function crowdLabel(
  band: 'seed' | 'light' | 'medium' | 'heavy' | 'packed',
): string {
  switch (band) {
    case 'seed':
      return STR.crowdSeed;
    case 'light':
      return STR.crowdLight;
    case 'medium':
      return STR.crowdMedium;
    case 'heavy':
      return STR.crowdHeavy;
    case 'packed':
      return STR.crowdPacked;
  }
}
