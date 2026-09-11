/**
 * PLAYER-FACING DISCLOSURE — GLI-19 §4.4.1, §4.6.1, §4.7.3, §4.7.4, §4.8.6,
 * §4.11.1, §A.5.1, §A.5.2; Order 222 Annex 1 Art. 8.1(b), 13.
 *
 * Every clause in that list has the same shape: a fact about the game must be
 * available to the player, in the artwork, before they commit a wager. The
 * failure mode is equally consistent — the fact exists in the code and nothing
 * renders it.
 *
 * So this file checks the DERIVED disclosure objects rather than the rendered
 * pixels. That is the right boundary: the client renders these objects and only
 * these objects, and a number that is retyped in a component can drift from the
 * certified figure while a number that is rendered from here cannot. The
 * rendering itself is covered by the product's own web suites.
 */
import { describe, expect, it } from 'vitest';
import {
  HOUSE_SEED_DISCLOSURE,
  INTERRUPTION_RULES,
  MALFUNCTION_NOTICE,
  RULES_CHANGELOG,
  RULES_VERSION,
  SKILL_DISCLOSURE,
  STORM_POWER_APPLIES_TO,
  STORM_POWER_LADDER,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  TABLE_ROUTING_DISCLOSURE,
  ZONE_COUNT,
  RAKE,
  capBindsAboveShare,
  economyDisclosure,
  rulesAsOf,
  settlementFormulaDisclosure,
  stormPowerPaytable,
  stormPowerRange,
  unwinnableTiers,
} from '@landfall/core';

describe('GLI-19 §4.7.3 — the actual odds of the highest advertised award', () => {
  /**
   * The clause: the top award must occur at least once in 100,000,000 games
   * UNLESS the artwork prominently displays the actual odds. Perfect Storm is
   * about 1 in 1,048,576 — roughly 95× more frequent than the threshold — so
   * displaying the odds is mandatory, not optional.
   */
  it('the top award is far more frequent than 1 in 100,000,000, so the odds must be shown', () => {
    const rows = stormPowerPaytable();
    const top = rows[rows.length - 1]!;
    expect(top.label).toBe('PERFECT STORM');
    expect(top.oddsOneIn).toBeLessThan(100_000_000);
    expect(top.oddsOneIn).toBeCloseTo(2 ** 20, 0);
  });

  it('every tier publishes a probability and an odds figure that agree', () => {
    const rows = stormPowerPaytable();
    expect(rows).toHaveLength(STORM_POWER_LADDER.length);
    let total = 0;
    for (const row of rows) {
      expect(row.probability).toBeGreaterThan(0);
      expect(row.oddsOneIn).toBeCloseTo(1 / row.probability, 6);
      expect(row.multiplier).toMatch(/^×/);
      total += row.probability;
    }
    expect(total).toBeCloseTo(1, 12);
  });
});

describe('GLI-19 §4.8.6 — a mystery award states its minimum and maximum', () => {
  it('publishes the floor and the ceiling of the multiplier', () => {
    const range = stormPowerRange();
    expect(range.minMultiplier).toBe('×1');
    expect(range.maxMultiplier).toBe('×500');
    // …and they are the real extremes of the shipped ladder.
    const ms = STORM_POWER_LADDER.map((t) => t.mNum / t.mDen);
    expect(range.minMultiplier).toBe(`×${Math.min(...ms)}`);
    expect(range.maxMultiplier).toBe(`×${Math.max(...ms)}`);
  });
});

describe('GLI-19 §4.4.1(f) — an advertised award must be winnable in full', () => {
  /**
   * THE FINDING THIS GUARDS. The liability cap is denominated in round handle
   * while the multiplier applies to the distributable pool, so the cap bites as
   * a function of pool shape. At the original 25× cap the advertised ×500 was
   * clamped in essentially every round it could land in — an award that could
   * never be paid at its advertised value.
   *
   * The cap is now derived from the ladder rather than chosen, and the assertion
   * below is the executable form of that derivation. `RoundCoordinator` runs the
   * same check at construction, so a room config cannot ship a dishonest
   * paytable even by accident.
   */
  it('no advertised tier is unpayable at the reference pool shape', () => {
    expect(unwinnableTiers(RAKE, STORM_POWER_MAX_PAYOUT_MULTIPLE)).toEqual([]);
  });

  it('the old 25× cap would have failed this check — the guard has teeth', () => {
    const broken = unwinnableTiers(RAKE, 25);
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.map((t) => t.label)).toContain('PERFECT STORM');
  });

  /**
   * §4.7.4 — "limitations on the award amounts … shall be clearly explained to
   * the player". Where the cap CAN still bind, the share of handle at which it
   * starts to do so is published next to the tier's odds.
   */
  it('publishes the pool share above which each tier starts to be clamped', () => {
    for (const row of stormPowerPaytable()) {
      // null means the tier can never be clamped, which is its own disclosure.
      if (row.cappedAboveShare !== null) {
        expect(row.cappedAboveShare).toBeGreaterThan(0);
        expect(row.cappedAboveShare).toBeLessThan(1);
      }
    }
    // The top tier is payable in full up to twice a harbour's uniform share.
    const top = capBindsAboveShare(500, 1);
    expect(top).not.toBeNull();
    expect(top!).toBeGreaterThan(2 / ZONE_COUNT);
  });
});

describe('GLI-19 §4.4.1(d),(k) — the paytable, for a game that has none', () => {
  it('states the settlement formula and the two quantities in it', () => {
    const text = settlementFormulaDisclosure(ZONE_COUNT, RAKE);
    expect(text).toContain('P_hit');
    expect(text).toContain(`${Math.round((1 - RAKE) * 100)}%`);
    expect(text).toContain(`${ZONE_COUNT} harbours`);
    // §4.4.1(d) wants "all possible winning outcomes"; for a pari-mutuel game
    // that is a formula, and it has to say so rather than implying a table.
    expect(text.toLowerCase()).toContain('no fixed paytable');
  });

  /**
   * §4.4.1(k) — "where multiplier instructions are displayed, it shall be clear
   * what the multiplier does and does not apply to". This is the most misread
   * number in the game: ×500 multiplies the SALVAGE SHARE, not the bet.
   */
  it('states what the multiplier applies to, and what it does not', () => {
    expect(STORM_POWER_APPLIES_TO).toMatch(/never multiplies your returned bet/i);
    expect(STORM_POWER_APPLIES_TO).toMatch(/never reduces/i);
    expect(STORM_POWER_APPLIES_TO).toMatch(/×1/);
  });
});

describe('GLI-19 §4.6.1(a) — a skill layer that does not move the odds', () => {
  it('says plainly that reading the crowd changes payout, not probability', () => {
    expect(SKILL_DISCLOSURE).toMatch(/1-in-6/);
    expect(SKILL_DISCLOSURE).toMatch(/never|no bet, pattern or timing/i);
  });
});

describe('GLI-19 §4.11.1 — peer-to-peer disclosures', () => {
  /** §4.11.1(c) — house money in the pools must be indicated to all players. */
  it('discloses the house seed, its uniformity, and where its profit goes', () => {
    expect(HOUSE_SEED_DISCLOSURE).toMatch(/every harbour/i);
    expect(HOUSE_SEED_DISCLOSURE).toMatch(/same amount on all six/i);
    expect(HOUSE_SEED_DISCLOSURE).toMatch(/cannot change which harbour is hit/i);
    // §A.7.1(c)–(d): the seed's winnings are ring-fenced, not operator revenue.
    expect(HOUSE_SEED_DISCLOSURE).toMatch(/never operator revenue/i);
  });

  /**
   * §4.11.1(b) — players must be able to join a session where placement is
   * random, or the rule that replaces it must be disclosed.
   *
   * Landfall does both, and the second half was added late: Order 243 Annex 1
   * Art. 13(b) requires the POSSIBILITY of random placement to exist, which a
   * disclosure of the default rule does not satisfy. The option is tested in
   * `suites/compliance/georgian-p2p.test.ts`; this asserts the disclosure names
   * the default rule, the reason for it, and the option itself — a player who
   * cannot find the option does not have it.
   */
  it('discloses the routing rule, the reason for it, and the random option', () => {
    expect(TABLE_ROUTING_DISCLOSURE).toMatch(/busiest table/i);
    expect(TABLE_ROUTING_DISCLOSURE).toMatch(/liquidity/i);
    expect(TABLE_ROUTING_DISCLOSURE).toMatch(/change table at any time/i);
    expect(TABLE_ROUTING_DISCLOSURE).toMatch(/random/i);
    // §4.11.1(b) is a player-protection clause, so affordability has to survive
    // the randomisation and the disclosure has to say so.
    expect(TABLE_ROUTING_DISCLOSURE).toMatch(/afford/i);
  });
});

describe('Order 222 Art. 8.1(b) / GLI-19 §A.5.2 — malfunction and interruption', () => {
  it('carries the malfunction notice verbatim', () => {
    expect(MALFUNCTION_NOTICE).toBe('MALFUNCTION VOIDS ALL PAYS AND PLAYS');
  });

  /**
   * §A.5.2(c)–(e) — the rules must state what happens on an unrecoverable
   * malfunction, on disconnection, and to an undecided wager. Landfall's
   * position is unusually strong and the disclosure says so: there are no player
   * actions after the bets lock, so the "interrupted mid-decision" class cannot
   * occur at all.
   */
  it('covers settlement failure, disconnection and malfunction', () => {
    const titles = INTERRUPTION_RULES.map((r) => r.title.toLowerCase());
    expect(titles.some((t) => t.includes('cannot be settled'))).toBe(true);
    expect(titles.some((t) => t.includes('disconnect'))).toBe(true);
    expect(titles.some((t) => t.includes('malfunction'))).toBe(true);

    const bodies = INTERRUPTION_RULES.map((r) => r.body).join(' ');
    expect(bodies).toMatch(/returned in full/i);
    expect(bodies).toMatch(/no rake is taken/i);
    expect(bodies).toContain(MALFUNCTION_NOTICE);
  });
});

describe('GLI-19 §A.5.1 / Law Art. 12.1(f) — the rules are a versioned artefact', () => {
  it('every version in the changelog is present, ordered, and dated', () => {
    expect(RULES_CHANGELOG.length).toBeGreaterThan(0);
    RULES_CHANGELOG.forEach((row, i) => {
      expect(row.version).toBe(i + 1);
      expect(row.summary.length).toBeGreaterThan(40);
      expect(row.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(row.effective))).toBe(false);
    });
  });

  it('the current version resolves, and is the newest one', () => {
    const current = rulesAsOf(RULES_VERSION);
    expect(current).toBeDefined();
    expect(RULES_VERSION).toBe(RULES_CHANGELOG[RULES_CHANGELOG.length - 1]!.version);
    // A round stamped with a superseded version still resolves to the rules
    // that were in force when its wager was accepted — the whole point of §A.5.1.
    expect(rulesAsOf(1)).toBeDefined();
    expect(rulesAsOf(1)!.version).toBe(1);
    expect(rulesAsOf(999)).toBeUndefined();
  });

  /**
   * Law Art. 24¹.2 makes a change to the bet, the winnings, the architecture,
   * the RNG platform or the jackpot payout system a MATERIAL change requiring
   * prior consent and re-authorization. Every such row has to carry the limb it
   * touches, or the filing cannot be prepared from the changelog.
   */
  it('every material change names the limb of Art. 24¹.2 it engages', () => {
    for (const row of RULES_CHANGELOG) {
      if (!row.material) continue;
      expect(row.limb, `version ${row.version}`).toBeTruthy();
      expect(row.limb!).toMatch(/Art\. 24/);
    }
  });

  /** The economy changed in this pass, so the version must have moved with it. */
  it('the shipped rules version reflects the current economy', () => {
    const current = rulesAsOf(RULES_VERSION)!;
    expect(current.material).toBe(true);
    expect(current.summary).toMatch(/return to player|RTP/i);
  });
});

describe('GLI-19 §4.7.2 — the displayed return explains how it was determined', () => {
  it('quotes one figure, derived once, with every term named', () => {
    const d = economyDisclosure();
    expect(d.longRunReturn).toMatch(/^\d{2}\.\d%$/);
    expect(d.survivorShare).toBe(`${Math.round((1 - RAKE) * 100)}%`);
    expect(d.surgeFrequency).toMatch(/1 round in \d+/);
    expect(d.derivation.length).toBeGreaterThan(120);
    // The breakdown object and the sentence must agree — they are the same
    // numbers rendered two ways, and drift between them is the §4.7.2 failure.
    expect(d.derivation).toContain(`${(d.breakdown.totalRtp * 100).toFixed(1)}%`);
  });

  it('the same figure appears wherever the rake is the same', () => {
    expect(economyDisclosure(RAKE, ZONE_COUNT).longRunReturn).toBe(
      economyDisclosure(RAKE, ZONE_COUNT).longRunReturn,
    );
    // A different economy must produce a different figure rather than a cached
    // constant — the number is derived, not typed.
    expect(economyDisclosure(0.2, ZONE_COUNT).longRunReturn).not.toBe(
      economyDisclosure(0.06, ZONE_COUNT).longRunReturn,
    );
  });
});
