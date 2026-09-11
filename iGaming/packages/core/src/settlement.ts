/**
 * Pari-mutuel settlement — implements docs/03-math/mathematical-model.md §2
 * with the integer rounding policy from docs/03-math/simulation-methodology.md §4:
 * all amounts in integer minor units; floor each survivor share, then distribute
 * the remaining units by largest fractional remainder (tie-break by stake id).
 * Conservation (payouts + rake === struck pool) is asserted on every call.
 */

export interface StakeEntry {
  /** Unique, stable id (deterministic rounding tie-break). */
  id: string;
  zone: number;
  amountMinor: number;
  /** True for the house's liquidity seed stakes. */
  isHouseSeed: boolean;
  /**
   * True for demo practice bots (C5). Published in the lock snapshot so the
   * Golden Anchor exclusion below is recomputable by anyone; bots settle
   * pari-mutuel like players but can never win the Surge pot — demo odds match
   * production semantics, where bots don't exist at all.
   */
  isBot?: boolean;
}

export interface SettlementLine {
  id: string;
  zone: number;
  amountMinor: number;
  isHouseSeed: boolean;
  outcome: 'SAFE' | 'WRECKED';
  /** Salvage share (excl. returned stake) for SAFE; 0 for WRECKED. */
  salvageMinor: number;
  /** Total credited back: stake + salvage for SAFE; 0 for WRECKED. */
  payoutMinor: number;
}

export interface SettlementResult {
  struckZone: number;
  struckPoolMinor: number;
  rakeMinor: number;
  /** Base distributable pool (pre-Storm-Power): struck pool minus rake. */
  distributedMinor: number;
  /** Actually distributed salvage after the Storm Power multiplier (and cap, if hit). */
  salvageTotalMinor: number;
  /**
   * Storm Reserve draw this round: salvageTotal − distributable (≥ 0 with the
   * ×1-floor ladder; negative only if a sub-1 multiplier is ever passed in).
   */
  houseDeltaMinor: number;
  /** True when maxSalvageMinor clamped the Storm Power payout (published, never silent). */
  powerCapped: boolean;
  /**
   * True when NO harbour survived, so there was nobody to pay the struck pool to
   * and every stake was returned in full. See the degenerate branch below.
   */
  allStakesRefunded: boolean;
  survivorPoolMinor: number;
  lines: SettlementLine[];
}

/** Storm Power multiplier as an exact rational (integer money math). ×1 when omitted. */
export interface SalvagePower {
  mNum: number;
  mDen: number;
}

export function settleRound(
  stakes: readonly StakeEntry[],
  struckZone: number,
  rake: number,
  power: SalvagePower = { mNum: 1, mDen: 1 },
  /**
   * Per-round liability cap (A3): total salvage never exceeds this. The clamp
   * never cuts below the pari-mutuel base (distributable), so a survivor's
   * salvage is never reduced below the ×1 identity.
   */
  maxSalvageMinor?: number,
): SettlementResult {
  const struck = stakes.filter((s) => s.zone === struckZone);
  const survivors = stakes.filter((s) => s.zone !== struckZone);
  const struckPoolMinor = struck.reduce((a, s) => a + s.amountMinor, 0);
  const survivorPoolMinor = survivors.reduce((a, s) => a + s.amountMinor, 0);

  const rakeMinor = Math.floor(struckPoolMinor * rake);
  const distributable = struckPoolMinor - rakeMinor;
  // Storm Power: total salvage = distributable × M (exact rational, floored once),
  // then clamped to the operator's liability cap (clamp published via powerCapped).
  const salvageUncapped = Math.floor((distributable * power.mNum) / power.mDen);
  const cap = maxSalvageMinor === undefined ? salvageUncapped : Math.max(maxSalvageMinor, distributable);
  const salvageTotal = Math.min(salvageUncapped, cap);
  const powerCapped = salvageTotal < salvageUncapped;

  const lines: SettlementLine[] = struck.map((s) => ({
    ...s,
    outcome: 'WRECKED' as const,
    salvageMinor: 0,
    payoutMinor: 0,
  }));

  if (survivorPoolMinor === 0) {
    /*
     * NOBODY SURVIVED — every stake in the round sat on the harbour the storm
     * hit. There is no survivor pool, so there is nothing to redistribute the
     * struck pool TO, and the pari-mutuel rule has nothing to say.
     *
     * THE ROUND IS THEREFORE A NO-OP AND EVERY BET IS RETURNED IN FULL.
     *
     * This used to book the ENTIRE struck pool as rake — a 100% hold on that
     * round. It was defended as unreachable, because the house seeds a stake on
     * every harbour and five of the six always survive. That defence does not
     * hold: `resolveRoomConfig` accepts a room with `seedMinor: 0`, and a room
     * with no seeds whose players all crowd one harbour reaches exactly this
     * branch. "Unreachable, and if reached the operator takes everything" is not
     * a position to put in front of a test laboratory — GLI-19 §4.7.1 sets a 75%
     * floor for ANY wagering configuration, and this configuration returned zero.
     *
     * Refunding is also the only arithmetic that is not arbitrary: destroying
     * 88% of the pool and banking 12% of it expresses no rule at all, and it
     * matches what `INTERRUPTION_RULES` already promises for a round that cannot
     * be settled.
     */
    const refunded: SettlementLine[] = struck.map((s) => ({
      ...s,
      // The outcome field records what happened to the MONEY, and the money came
      // back. `allStakesRefunded` is what tells a caller why.
      outcome: 'SAFE' as const,
      salvageMinor: 0,
      payoutMinor: s.amountMinor,
    }));
    const result: SettlementResult = {
      struckZone,
      struckPoolMinor,
      rakeMinor: 0,
      distributedMinor: 0,
      salvageTotalMinor: 0,
      houseDeltaMinor: 0,
      powerCapped: false,
      allStakesRefunded: true,
      survivorPoolMinor,
      lines: refunded,
    };
    assertConservation(result);
    return result;
  }

  // Floor shares, track remainders, distribute leftover units by largest remainder.
  const shares = survivors.map((s) => {
    const exact = (salvageTotal * s.amountMinor) / survivorPoolMinor;
    const floor = Math.floor(exact);
    return { stake: s, floor, remainder: exact - floor };
  });
  let leftover = salvageTotal - shares.reduce((a, x) => a + x.floor, 0);
  const byRemainder = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.stake.id.localeCompare(b.stake.id),
  );
  for (const s of byRemainder) {
    if (leftover <= 0) break;
    s.floor += 1;
    leftover -= 1;
  }

  for (const s of shares) {
    lines.push({
      ...s.stake,
      outcome: 'SAFE',
      salvageMinor: s.floor,
      payoutMinor: s.stake.amountMinor + s.floor,
    });
  }

  const result: SettlementResult = {
    struckZone,
    struckPoolMinor,
    rakeMinor,
    distributedMinor: distributable,
    salvageTotalMinor: salvageTotal,
    houseDeltaMinor: salvageTotal - distributable,
    powerCapped,
    allStakesRefunded: false,
    survivorPoolMinor,
    lines,
  };
  assertConservation(result);
  return result;
}

/**
 * Golden Anchor — Storm Surge winner selection. Picks ONE surviving *player*
 * stake (house seeds excluded), with probability proportional to stake size,
 * deterministically from the round's uWinner roll and the public lock snapshot
 * (sorted by stake id) — so anyone can recompute the winner after the reveal.
 * Returns null when no player stake survived (the pot rolls over).
 */
export function pickGoldenAnchor(
  stakes: readonly StakeEntry[],
  struckZone: number,
  uWinner: number,
): StakeEntry | null {
  const eligible = stakes
    .filter((s) => !s.isHouseSeed && !s.isBot && s.zone !== struckZone && s.amountMinor > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const total = eligible.reduce((a, s) => a + s.amountMinor, 0);
  if (total === 0) return null;
  let target = Math.floor(uWinner * total); // in [0, total)
  for (const s of eligible) {
    if (target < s.amountMinor) return s;
    target -= s.amountMinor;
  }
  return eligible[eligible.length - 1] ?? null; // unreachable guard for float edge
}

/**
 * Flat-odds Golden Anchor (A4, flag-gated): every surviving player stake entry
 * has an EQUAL chance, regardless of size — so small stakes visibly win pots.
 * Same eligibility and determinism rules as pickGoldenAnchor; only the weighting
 * differs. The mode is announced in the round header before anchoring, and the
 * winner recomputes from the public lock snapshot like everything else.
 */
export function pickGoldenAnchorFlat(
  stakes: readonly StakeEntry[],
  struckZone: number,
  uWinner: number,
): StakeEntry | null {
  const eligible = stakes
    .filter((s) => !s.isHouseSeed && !s.isBot && s.zone !== struckZone && s.amountMinor > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (eligible.length === 0) return null;
  const idx = Math.min(eligible.length - 1, Math.floor(uWinner * eligible.length));
  return eligible[idx]!;
}

/**
 * Runtime conservation assert (docs/05-security/security-review.md §1.20), Storm
 * Power aware: survivor payouts + rake === handle + houseDelta. With M=1 the
 * delta is zero and this reduces to the original pari-mutuel identity; with
 * M>1 the delta is exactly the Storm Reserve draw funding the extra salvage
 * (cap included — the identity stays exact when the clamp fires).
 */
export function assertConservation(r: SettlementResult): void {
  const handle = r.struckPoolMinor + r.survivorPoolMinor;
  const paidOut = r.lines.reduce((a, l) => a + l.payoutMinor, 0);
  if (paidOut + r.rakeMinor !== handle + r.houseDeltaMinor) {
    throw new Error(
      `CONSERVATION VIOLATION: handle=${handle} paidOut=${paidOut} rake=${r.rakeMinor} houseDelta=${r.houseDeltaMinor}`,
    );
  }
}
