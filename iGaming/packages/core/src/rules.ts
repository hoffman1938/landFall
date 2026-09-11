/**
 * THE RULES OF THE GAME, as a versioned artefact (gaps G45, G9, G41, G12).
 *
 * Two separate obligations meet in this file, and they are the reason it exists
 * rather than the copy living in components:
 *
 *   GLI-19 §A.5.1 — the gaming rules must be complete and unambiguous, A LOG OF
 *   CHANGES MUST BE KEPT, changes must be time and date stamped, and THE RULES
 *   IN PLACE WHEN THE WAGER WAS ACCEPTED are the rules that apply to it.
 *
 *   Law of Georgia Art. 12.1(f), 12.1¹ — the rules of a systemic-electronic game
 *   are submitted to the Revenue Service for consent, it is prohibited to run a
 *   game not covered by them, and any amendment requires PRIOR consent.
 *
 * Both mean the same thing for engineering: the rules are a release artefact
 * with a version, not prose in a modal. `RULES_VERSION` is stamped onto every
 * round at creation, so a dispute about a round settled last March is resolved
 * against the rules that were in force in March — which is precisely what
 * §A.5.1 asks for and what a `git log` cannot answer on its own.
 *
 * The disclosure tables below are also the artwork's ONLY source for the Storm
 * Power odds, the minimum and maximum award, and the payout cap. That is
 * deliberate: G9 is three separate GLI findings (§4.7.3 actual odds, §4.8.6
 * mystery-award min and max, §4.7.4 limitation on awards) and all three failed
 * the same way — the numbers existed in `constants.ts` and in the math model but
 * nothing rendered them. A component that imports the ladder and formats it
 * itself can drift from the certified figure; a component that renders this
 * table cannot.
 */
import {
  RAKE,
  STORM_POWER_LADDER,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  SURGE_PROB,
  ZONE_COUNT,
  capBindsAboveShare,
  type StormPowerTier,
} from './constants.js';
import { displayRtpPercent, theoreticalRtp } from './rtp.js';

/**
 * The version stamped on every round. BUMP THIS whenever anything below, the
 * economy constants, or the settlement rule changes — and add the changelog row.
 *
 * Under Law Art. 24¹.2 a change to the bet, the winnings, the game architecture,
 * the RNG platform or the jackpot payout system is a MATERIAL change requiring
 * prior Revenue Service consent and a fresh authorization certificate before the
 * changed game may be supplied. The `material` flag on each changelog row is the
 * triage record for that: it is what a release manager reads to know whether a
 * build can ship or needs to wait for consent.
 */
export const RULES_VERSION = 2;

export interface RulesChange {
  version: number;
  /** ISO date the version took effect. */
  effective: string;
  summary: string;
  /**
   * True where Law Art. 24¹.2 / Order 239 Art. 8.1 classify this as a MATERIAL
   * change — prior consent and re-authorization required before supply.
   */
  material: boolean;
  /** Which limb of Art. 24¹.2 it touches, for the re-authorization filing. */
  limb?: string;
}

export const RULES_CHANGELOG: readonly RulesChange[] = [
  {
    version: 1,
    effective: '2026-07-11',
    summary:
      'Initial ruleset: six harbors, uniform 1-in-6 draw, pari-mutuel settlement at 12% rake on ' +
      'the struck pool, Storm Power ladder v2 (×1 floor, ×500 nominal top tier) capped at 25× ' +
      'round handle, Storm Surge progressive jackpot at ~1 round in 25.',
    material: true,
    limb: 'Art. 24¹.2(b) architecture, (c) amount of winnings, (f) jackpot payout system',
  },
  {
    version: 2,
    effective: '2026-09-11',
    summary:
      'Storm Power liability cap raised from 25× to 150× round handle so that every advertised ' +
      'tier — including the ×500 Perfect Storm — is payable in full at the reference pool shape ' +
      '(GLI-19 §4.4.1(f)); at 25× the top tier was clamped in essentially every round and could ' +
      'never be paid at its advertised value. Storm Reserve gains a disclosed opening ' +
      'capitalization and can no longer run negative — shortfalls are booked as an explicit ' +
      'house backstop. House-seed profit and loss ring-fenced into a segregated liquidity float ' +
      'that may fund only future seeds, the jackpot or the reserve, never operator revenue ' +
      '(GLI-19 §A.7.1(c)–(d)). Storm Surge gains a ceiling with a diversion pool and a defined ' +
      'reset value (§4.13.3, §4.13.6). Player-facing return corrected from 98% to 99.0%, the ' +
      'figure its own stated derivation produces (§4.7.2).',
    material: true,
    limb: 'Art. 24¹.2(c) amount of winnings, (f) jackpot payout system',
  },
];

/** The rules in force for a round, resolved by the version stamped on it. */
export function rulesAsOf(version: number): RulesChange | undefined {
  return RULES_CHANGELOG.find((r) => r.version === version);
}

// ---------------------------------------------------------------------------
// Storm Power disclosure — GLI §4.7.3, §4.8.6, §4.7.4, §4.4.1(d), §4.4.1(k)
// ---------------------------------------------------------------------------

export interface PaytableRow {
  label: string;
  /** The multiplier as the artwork shows it: "×1.25". */
  multiplier: string;
  /** Exact probability as a fraction of the 2^20 draw space. */
  probability: number;
  /**
   * §4.7.3 — THE ACTUAL ODDS, in the "1 in N" form the clause requires. The
   * highest advertised award must occur at least once in 100,000,000 games
   * UNLESS the artwork prominently displays these odds. Perfect Storm is ~1 in
   * 1,048,576, roughly 95× more frequent than that threshold, so displaying
   * this column is not optional and not a footnote.
   */
  oddsOneIn: number;
  /**
   * §4.7.4 / §4.13.3 — the struck-harbor share above which the round payout cap
   * starts to limit this tier, or null where it can never bind. A player shown
   * "×500" who receives a clamped figure without prior disclosure is exactly the
   * harm those clauses exist to prevent.
   */
  cappedAboveShare: number | null;
}

export function stormPowerPaytable(
  ladder: readonly StormPowerTier[] = STORM_POWER_LADDER,
  rake: number = RAKE,
  maxPayoutMultiple: number = STORM_POWER_MAX_PAYOUT_MULTIPLE,
): PaytableRow[] {
  const space = ladder[ladder.length - 1]?.cumBound ?? 1;
  const rows: PaytableRow[] = [];
  let prev = 0;
  for (const tier of ladder) {
    const count = tier.cumBound - prev;
    prev = tier.cumBound;
    const m = tier.mNum / tier.mDen;
    rows.push({
      label: tier.label,
      multiplier: `×${m % 1 === 0 ? m : m.toFixed(2)}`,
      probability: count / space,
      oddsOneIn: space / count,
      cappedAboveShare: capBindsAboveShare(tier.mNum, tier.mDen, rake, maxPayoutMultiple),
    });
  }
  return rows;
}

/** §4.8.6 — a mystery award's artwork must state the MINIMUM and MAXIMUM winnable. */
export function stormPowerRange(ladder: readonly StormPowerTier[] = STORM_POWER_LADDER): {
  minMultiplier: string;
  maxMultiplier: string;
} {
  const values = ladder.map((t) => t.mNum / t.mDen);
  return {
    minMultiplier: `×${Math.min(...values)}`,
    maxMultiplier: `×${Math.max(...values)}`,
  };
}

/**
 * §4.4.1(k) — "an explicit statement of what the multiplier applies to".
 *
 * The most misread number in the game. ×500 is not 500× a player's bet: it
 * multiplies the SALVAGE SHARE, which at a balanced table is about 17.6% of a
 * bet. The honest translation is the second sentence, and it belongs next to
 * every place the multiplier is shown.
 */
export const STORM_POWER_APPLIES_TO =
  'The storm category multiplies your share of the hit harbour’s pot. It never multiplies your ' +
  'returned bet, and it never reduces anything — the lowest category is ×1, which leaves your ' +
  'share exactly as the pari-mutuel split calculated it.';

/**
 * Order 222 Annex 1 Art. 8.1(b) — this notice must be placed CLEARLY AND
 * LEGIBLY on the game surface. Gap G12. Wording follows the standard's own
 * phrase so there is nothing for a reviewer to interpret.
 */
export const MALFUNCTION_NOTICE = 'MALFUNCTION VOIDS ALL PAYS AND PLAYS';

/**
 * GLI §A.5.2(c)–(e) — the rules must state what happens on an unrecoverable
 * malfunction, on disconnection, and to an undecided wager in an interrupted
 * game. Landfall's position here is unusually strong and worth stating plainly:
 * there are NO player actions after the bets lock, so the entire class of
 * "interrupted mid-decision" games does not exist. What remains is a round
 * interrupted between lock and settlement, and that is a full refund.
 */
export const INTERRUPTION_RULES: readonly { title: string; body: string }[] = [
  {
    title: 'If the round cannot be settled',
    body:
      'A round interrupted between the moment bets lock and the moment it settles is VOIDED. ' +
      'Every bet in it is returned in full, no rake is taken, the jackpot pot is left untouched, ' +
      'and the round is marked void in your history and in the public record.',
  },
  {
    title: 'If you disconnect',
    body:
      'Nothing you can do after bets lock affects the result, so a disconnection cannot cost you ' +
      'a decision. A bet already accepted stays in the round and settles normally whether or not ' +
      'you are connected; reconnecting shows you the result. A bet not yet accepted was never ' +
      'placed and no money left your balance.',
  },
  {
    title: 'If the game malfunctions',
    body:
      MALFUNCTION_NOTICE +
      '. Where a fault is found to have produced an incorrect result, the affected rounds are ' +
      'voided and every bet in them returned. Settlement is checked against a conservation rule ' +
      'on every single round, and a round that fails it is never paid out.',
  },
];

/**
 * GLI §4.11.1(b) / Order 222 Art. 13(b) — table placement must be random, or
 * the rule that replaces it must be disclosed. Gap G43.
 */
export const TABLE_ROUTING_DISCLOSURE =
  'Tables are not assigned at random. A player who has not chosen one is seated at the busiest ' +
  'table whose bet range they can afford. Affordability always wins over population, so you are ' +
  'never seated at a table you cannot play — and you can change table yourself at any time.';

/**
 * GLI §4.11.1(c) / §A.7.1(a) — house money in the pools must be CLEARLY
 * INDICATED to all other players. Gap G8's player-facing limb.
 */
export const HOUSE_SEED_DISCLOSURE =
  'The house places a small identical bet on every harbour to keep a quiet table playable. It is ' +
  'the same amount on all six, so it can never take a side, and it is published in the round ' +
  'header before betting opens. It cannot change which harbour is hit. Anything it wins is ' +
  'ring-fenced into a liquidity fund that can only pay for future house bets, the jackpot or the ' +
  'multiplier reserve — it is never operator revenue.';

/**
 * GLI §4.6.1(a) — a game giving a perception of control that does not exist
 * must disclose it. Landfall's skill layer is real but purely redistributive,
 * and math-model §4 already fixes the honest wording.
 */
export const SKILL_DISCLOSURE =
  'Reading the crowd changes how much you are paid, never whether you are hit. Every harbour has ' +
  'exactly a 1-in-6 chance every round, and no bet, pattern or timing can change it. Skill moves ' +
  'expected value between players; it never moves it away from the house.';

/** §4.4.1(d) — the paytable, for a game that does not have one. Gap G41. */
export function settlementFormulaDisclosure(zones: number = ZONE_COUNT, rake: number = RAKE): string {
  const pct = Math.round((1 - rake) * 100);
  return (
    `There is no fixed paytable: what you win is computed from the round's own bets. The storm ` +
    `hits one of ${zones} harbours. Every bet in it is lost. ${pct}% of that harbour's pot is ` +
    `shared among every surviving bet in proportion to size, and you also get your own bet back. ` +
    `In formula form, a bet S in a surviving harbour returns ` +
    `S + ${(1 - rake).toFixed(2)} × P_hit × S ÷ (T − P_hit), where P_hit is the hit harbour's pot ` +
    `and T is the round's total. The storm category then multiplies the shared part.`
  );
}

/** The two economy figures player-facing copy is allowed to quote, derived once. */
export function economyDisclosure(rake: number = RAKE, zones: number = ZONE_COUNT) {
  const breakdown = theoreticalRtp(rake, undefined, zones);
  return {
    survivorShare: `${Math.round((1 - rake) * 100)}%`,
    longRunReturn: displayRtpPercent(breakdown),
    breakdown,
    /** §4.7.2(a) — how the figure was determined, in one sentence. */
    derivation:
      `Return to player is ${displayRtpPercent(breakdown)} of everything staked, made of ` +
      `${(breakdown.baseReturn * 100).toFixed(2)}% returned by the pari-mutuel split, ` +
      `${(breakdown.surgeReturn * 100).toFixed(2)}% paid back through the jackpot, and ` +
      `${(breakdown.stormPowerReturn * 100).toFixed(2)}% paid back through the storm multiplier. ` +
      `The operator keeps ${(breakdown.operatorHold * 100).toFixed(2)}%.`,
    surgeFrequency: `about 1 round in ${Math.round(1 / SURGE_PROB)}`,
  };
}
