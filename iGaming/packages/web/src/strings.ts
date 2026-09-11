/**
 * Player-facing vocabulary (UX Simplification v3 — "Plain Words, One Button",
 * docs/07-ux/ux-simplification-v3.md §4). One term per concept, everywhere —
 * including aria-labels — so the string table is the single place to change a
 * word or drop in a Russian/Georgian locale later.
 *
 * Rules enforced by using this module instead of inline copy:
 *   - the bet unit is always "Harbor N".
 *
 *     v3 chose "Zone" here, to end a three-way split between Harbor, Cove and
 *     six proper names. That fixed the split; it also spent the game's own
 *     identity to do it, and left a product called LANDFALL whose six harbors
 *     were labelled like map sectors. v4 keeps v3's actual law — ONE term per
 *     concept, everywhere, including aria-labels — and spends it on the word
 *     the game is named for. Cove and the proper names stay where v3 put them:
 *     internal code names in @landfall/core, never shown;
 *   - the theme keeps exactly two words in the main UI: "storm" and "safe";
 *   - the action word is the money word: "Place Bet", not "Drop Anchor".
 */

/** The bet unit. `HARBOR_NAMES` stays in core as a code name; players see this. */
export function zoneName(zone: number): string {
  return `Harbor ${zone + 1}`;
}

/** The one-sentence explanation (v3 §5) — reused verbatim wherever the rule is stated. */
export const ONE_LINER =
  'Pick a harbor. The storm hits one of six — everyone else splits its money.';

export const STR = {
  // Primary action / deck (v3 §12)
  pickZone: 'PICK A HARBOR',
  pickZoneSub: 'Tap a harbor to start',
  placeBet: 'PLACE BET',
  betPlaced: 'BET PLACED',
  betAgain: 'BET AGAIN',
  updateBet: 'Update bet',
  cancelBet: 'Cancel bet',
  move: 'Move',
  keepZone: 'KEEP',
  lastMoveSet: 'LAST MOVE SET',
  locked: 'LOCKED',
  lockedSub: 'The storm is choosing a harbor',
  result: 'RESULT',
  resultSub: 'Settling…',
  nextRoundSoon: 'NEXT ROUND SOON',
  sending: 'SENDING…',
  connecting: 'CONNECTING…',
  reconnecting: 'RECONNECTING…',

  // Bet modes (v3 §4) — Focus/Split become self-labeling
  oneZone: '1 Harbor',
  twoZones: '2 Harbors',
  oneZoneHint: 'Whole bet on one harbor',
  twoZonesHint: '70% on one harbor, 30% on another',

  // Phase / status line (Storm Clock, v3 §8/§10)
  phaseBetting: 'BETTING',
  phaseHidden: 'BETS HIDDEN',
  phaseStorm: 'STORM',
  phaseResult: 'RESULT',
  phaseNext: 'NEXT',

  // Round-state hints (Storm Clock instruction line)
  hintPickZone: 'Pick a harbor',
  hintPickTwoZones: 'Pick two harbors',
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

  // Entry gate (welcome + table choice)
  welcomeTitle: 'How Landfall works',
  welcomeRulesToggle: 'How it works',
  welcomeChooseTable: 'Choose your table',
  welcomePlayAt: 'Play at',
  welcomeTableHint:
    'The range is your own bet per round. On a quiet table the live limit is lower — payouts come out of the hit harbor’s pot, so a bigger bet would have little to win. The deck always shows the live number as “Max now”, and each table has its own jackpot. You can switch tables any time from Settings.',
  welcomeDisclaimer: 'Virtual credits — no real money. Every round is verifiable.',
} as const;

/**
 * The entry pitch: four lines, in the order a newcomer needs them. Written to
 * be MOTIVATING BY BEING TRUE — "5 of 6 survive" is the genuinely attractive
 * fact about this game and it is exact, and the loss is named in the same
 * breath rather than buried. No new economy figures appear here: A5 fixes the
 * player-facing set at "survivors receive 88% of the wrecked pool" and
 * "long-run return ≈ 99.0%", and both live in the Rules sheet. Neither is
 * retyped: `economyDisclosure()` in @landfall/core derives both.
 */
export const WELCOME_POINTS: readonly { title: string; body: string }[] = [
  {
    title: 'Pick 1 of 6 harbors',
    body: 'Put your bet on the harbor you think the storm will miss.',
  },
  {
    title: '5 of the 6 survive',
    body: 'The storm hits exactly one harbor. Every other harbor is safe.',
  },
  {
    title: 'Safe players split the wreck',
    body: "You keep your bet and take a share of the hit harbor's pot. The more crowded that harbor was, the bigger the share.",
  },
  {
    title: 'One click proves it was fair',
    body: 'The result is drawn from a seed committed before the round — recheck any round yourself.',
  },
];

/**
 * Why a bet above the live limit is refused — and what changes it.
 *
 * The mechanism is "no player may hold more than 25% of a round's handle". That
 * is the rule, not the reason, and quoting a percentage at someone who just
 * wanted to bet the number printed on the table is why this felt arbitrary.
 *
 * The reason is worth more: payouts come out of the struck harbor's pot, so on a
 * quiet table there is nothing for a bigger bet to win. The cap is the game
 * refusing to let you risk 5,000 to win 12. Said that way it stops being a
 * refusal and becomes information — and it names the thing that lifts it.
 */
export function liveMaxNotice(capMinor: number): string {
  return `Most you can bet right now is ${(capMinor / 100).toFixed(2)} — the pot is small while the table is quiet, and there would be little to win. It rises as players join.`;
}

/** Short form for the deck's inline limit readout. */
export const LIVE_MAX_HINT =
  'The most this round can pay you back is capped by the pot, so your bet is capped with it. It rises as players join and resets each round.';

/** Crowd level from a tide band (v3 §4). */
export function crowdLabel(band: 'seed' | 'light' | 'medium' | 'heavy' | 'packed'): string {
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
