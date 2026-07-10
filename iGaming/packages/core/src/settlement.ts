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
  /** Actually distributed salvage after the Storm Power multiplier. */
  salvageTotalMinor: number;
  /** House's extra liability this round: salvageTotal − distributable (negative = house keeps the difference). */
  houseDeltaMinor: number;
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
): SettlementResult {
  const struck = stakes.filter((s) => s.zone === struckZone);
  const survivors = stakes.filter((s) => s.zone !== struckZone);
  const struckPoolMinor = struck.reduce((a, s) => a + s.amountMinor, 0);
  const survivorPoolMinor = survivors.reduce((a, s) => a + s.amountMinor, 0);

  const rakeMinor = Math.floor(struckPoolMinor * rake);
  const distributable = struckPoolMinor - rakeMinor;
  // Storm Power: total salvage = distributable × M (exact rational, floored once).
  const salvageTotal = Math.floor((distributable * power.mNum) / power.mDen);

  const lines: SettlementLine[] = struck.map((s) => ({
    ...s,
    outcome: 'WRECKED' as const,
    salvageMinor: 0,
    payoutMinor: 0,
  }));

  if (survivorPoolMinor === 0) {
    // Degenerate: nobody survived to receive salvage (cannot occur with house seeds on).
    // With no survivors the struck stakes are consumed by rake in full to keep
    // conservation explicit; Storm Power has nothing to multiply.
    const result: SettlementResult = {
      struckZone,
      struckPoolMinor,
      rakeMinor: struckPoolMinor,
      distributedMinor: 0,
      salvageTotalMinor: 0,
      houseDeltaMinor: 0,
      survivorPoolMinor,
      lines,
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
    .filter((s) => !s.isHouseSeed && s.zone !== struckZone && s.amountMinor > 0)
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
 * Runtime conservation assert (docs/05-security/security-review.md §1.20), Storm
 * Power aware: survivor payouts + rake === handle + houseDelta. With M=1 the
 * delta is zero and this reduces to the original pari-mutuel identity; with
 * M≠1 the delta is exactly what the house pays in (M>1) or keeps (M<1).
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
