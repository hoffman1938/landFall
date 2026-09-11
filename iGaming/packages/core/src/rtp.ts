/**
 * RETURN TO PLAYER — the definition, not just the number (gap G24).
 *
 * Order 240 Art. 2.2(a.e) makes RTP a REPORTED figure in the state electronic
 * control system, and GLI-19 §4.7.2 says that if RTP is displayed at all, the
 * artwork must explain how it was determined and break out the jackpot and
 * bonus contributions. Landfall quoted "≈ 98%" in player copy with neither.
 *
 * The difficulty is real rather than clerical: a pari-mutuel game has no
 * paytable to sum. Theoretical return is a function of HANDLE, and it is built
 * from three flows that are each exactly computable from the economy config:
 *
 *   1. BASE PARI-MUTUEL. Every credit staked is returned to players except the
 *      rake, and the rake is only ever taken from the struck pool. Because the
 *      draw is uniform and independent of the pools, E[P_struck] = T/K exactly,
 *      so the expected deduction is (r/K)·T whatever shape the crowd takes.
 *          base = 1 − r/K
 *
 *   2. STORM POWER. Survivors' salvage is multiplied by M ≥ 1, and the
 *      overpayment E[M−1] is paid out of the Storm Reserve on top of the base.
 *          power = E[M−1] · (1−r) / K
 *
 *   3. STORM SURGE. The surge share of the rake feeds a progressive pot which
 *      is paid to players in full — rollover defers a payout, it never cancels
 *      one (Order 222 Art. 17.3), so over any horizon the whole contribution
 *      returns.
 *          surge = split.surge · r / K
 *
 * AND THE NUMBER THIS PRODUCES IS NOT 98%. At production constants the three
 * flows give 98.00% + 0.50% + 0.50% = 99.00%. "98%" is the BASE term alone —
 * correct for a game with no ladder and no jackpot, and stale for this one, even
 * though the sentence quoting it in the docs goes on to list both return flows.
 * Under §4.7.2 a displayed figure has to match its own stated derivation, so the
 * player-facing number moves to ≈ 99% and carries the breakdown below with it.
 *
 * The operator's hold is the complement: the house share of the rake, 1.00% of
 * handle, which is exactly what the economy documentation always claimed.
 */
import { RAKE, RAKE_SPLIT, STORM_POWER_LADDER, ZONE_COUNT, type RakeSplit, type StormPowerTier } from './constants.js';

/** Exact E[M−1] for a ladder, as a float. Integer-exact form is in the tests. */
export function expectedOverpayment(ladder: readonly StormPowerTier[] = STORM_POWER_LADDER): number {
  const space = ladder[ladder.length - 1]?.cumBound ?? 0;
  if (space === 0) return 0;
  let total = 0;
  let prev = 0;
  for (const tier of ladder) {
    const count = tier.cumBound - prev;
    total += count * (tier.mNum / tier.mDen - 1);
    prev = tier.cumBound;
  }
  return total / space;
}

export interface RtpBreakdown {
  /** 1 − r/K — the pari-mutuel pass-through. */
  baseReturn: number;
  /** E[M−1]·(1−r)/K — the Storm Power ladder, funded by the Storm Reserve. */
  stormPowerReturn: number;
  /** split.surge·r/K — the Storm Surge progressive pot. */
  surgeReturn: number;
  /** The sum: theoretical return to player, as a fraction of handle. */
  totalRtp: number;
  /** 1 − totalRtp — the operator's theoretical hold, the house share of the rake. */
  operatorHold: number;
  /** (r/K) — gross deduction before the two return flows. */
  grossDeduction: number;
}

/**
 * Theoretical RTP for a given economy configuration. Pure function of config —
 * no handle argument, because every term is a fraction of handle and the
 * pari-mutuel identity makes them invariant to crowd shape (math-model §3).
 */
export function theoreticalRtp(
  rake: number = RAKE,
  split: RakeSplit = RAKE_SPLIT,
  zones: number = ZONE_COUNT,
  ladder: readonly StormPowerTier[] = STORM_POWER_LADDER,
): RtpBreakdown {
  const grossDeduction = rake / zones;
  const baseReturn = 1 - grossDeduction;
  const stormPowerReturn = (expectedOverpayment(ladder) * (1 - rake)) / zones;
  const surgeReturn = split.surge * grossDeduction;
  const totalRtp = baseReturn + stormPowerReturn + surgeReturn;
  return {
    baseReturn,
    stormPowerReturn,
    surgeReturn,
    totalRtp,
    operatorHold: 1 - totalRtp,
    grossDeduction,
  };
}

/**
 * The figure quoted in player-facing copy, to one decimal place. Single source
 * so the artwork, the rules sheet and the regulatory submission can never drift
 * apart — which is half of what §4.7.2 is protecting against.
 */
export function displayRtpPercent(breakdown: RtpBreakdown = theoreticalRtp()): string {
  return `${(breakdown.totalRtp * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Actual RTP — GLI §A.6.1/§A.6.2 theoretical-versus-actual monitoring
// ---------------------------------------------------------------------------

export interface ActualRtpInput {
  /** Every credit staked in the period, house seeds INCLUDED. */
  handleMinor: number;
  /** Every credit staked by real players — house seeds excluded. */
  playerHandleMinor: number;
  /** Every credit returned to players: stakes back, salvage, jackpots. */
  playerReturnedMinor: number;
  /** Rake booked to operator revenue in the period. */
  rakeMinor: number;
}

export interface ActualRtp {
  /** Returned ÷ player handle — the figure that matters to a player. */
  playerRtp: number;
  /** Order 240 Art. 2.2(a.d): GGR = bets received − winnings paid, IN−OUT. */
  ggrMinor: number;
  /** GGR as a fraction of player handle. */
  ggrRate: number;
}

/**
 * Actual RTP and GGR from the ledgers.
 *
 * Two handle figures are carried deliberately. The THEORETICAL figure above is
 * defined on total handle, because the house seed faces the identical −r/K edge
 * and including it keeps the algebra exact. The REPORTED figure has to be on
 * player handle, because Resolution 455 Art. 2(d) defines GGR as bets received
 * minus winnings paid and house seed money is not a bet received. Reporting one
 * while computing the other is exactly the kind of mismatch a variance
 * investigation would spend a week chasing, so both are returned.
 */
export function actualRtp(input: ActualRtpInput): ActualRtp {
  const ggr = input.playerHandleMinor - input.playerReturnedMinor;
  return {
    playerRtp: input.playerHandleMinor === 0 ? 0 : input.playerReturnedMinor / input.playerHandleMinor,
    ggrMinor: ggr,
    ggrRate: input.playerHandleMinor === 0 ? 0 : ggr / input.playerHandleMinor,
  };
}

/**
 * GLI §A.6.2 — escalation bands for theoretical-versus-actual comparison.
 *
 * A pari-mutuel game's realised return is dominated by whether a jackpot landed
 * in the window, so a naive band would alarm constantly. The bands widen as the
 * sample shrinks, using the single-round standard deviation from math-model §5
 * (σ ≈ 0.443 × stake) scaled by √n — a 3σ band on the mean.
 */
export function rtpVarianceBand(rounds: number): number {
  if (rounds <= 0) return Infinity;
  return (3 * 0.443) / Math.sqrt(rounds);
}

export type RtpAlert = 'OK' | 'WATCH' | 'INVESTIGATE';

export function classifyRtpVariance(
  actual: number,
  theoretical: number,
  rounds: number,
): { deviation: number; band: number; alert: RtpAlert } {
  const deviation = actual - theoretical;
  const band = rtpVarianceBand(rounds);
  const magnitude = Math.abs(deviation);
  return {
    deviation,
    band,
    alert: magnitude > band ? 'INVESTIGATE' : magnitude > band / 2 ? 'WATCH' : 'OK',
  };
}
