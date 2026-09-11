/**
 * Adaptive house liquidity (C-series follow-up, "thin table" remediation).
 *
 * THE PROBLEM this solves. A survivor's salvage is
 *
 *     gain / stake = (1 − RAKE) · P_struck / (T − P_struck)
 *
 * With K = 6 uniform pools that collapses to (1 − RAKE)/(K − 1) ≈ +17.6%
 * EVERY round — the same number, forever. Table size does not move that mean
 * and never can: it is the pari-mutuel identity. What table size actually buys
 * is DISPERSION — pools of different weights, so a struck heavy cove pays far
 * more than a struck light one, and reading the crowd is worth something.
 *
 * Measured against the production `settleRound` (6 coves, 1.00 stake):
 *
 *   seed 25.00/cove,   5 players   →  +17.0%..+18.0%   (2pp spread — dead flat)
 *   seed 25.00/cove,  30 players   →  +10.0%..+25.0%   (15pp)
 *   seed  2.00/cove,   5 players   →   +7.0%..+24.0%   (17pp)
 *   seed  2.00/cove,  30 players   →   +2.0%..+36.0%   (34pp)
 *
 * Read the 5-player rows together: the SAME five players are eight times more
 * interesting at a 2.00 seed than at a 25.00 one. A large flat house seed is
 * not liquidity — it is an averaging filter bolted onto the pools, and it hurts
 * most on exactly the thin tables it was meant to rescue.
 *
 * THE POLICY. The house no longer adds a constant; it TOPS THE TABLE UP to a
 * liquidity floor. Below the floor it makes up the difference so a quiet table
 * still settles; above it, the seed falls away to a token amount and the round
 * becomes pure player-versus-player, which is the game at its best. The house's
 * seeding cost (it pays the rake on its own seed) shrinks on the same curve —
 * the operator pays for liquidity only while liquidity is actually scarce.
 *
 * The input is the RECENT handle (an EMA over settled rounds), never the live
 * round's pools: the seed is fixed and published in the round header before
 * anchoring opens, so it can leak nothing about where money is going now.
 */

export interface LiquidityPolicy {
  /**
   * Total table handle the house guarantees. While recent real handle is under
   * this, the house makes up the difference; at or above it, the seed drops to
   * `minSeedMinor`.
   */
  floorMinor: number;
  /** Token seed that always remains, so no cove is ever literally empty. */
  minSeedMinor: number;
  /** Ceiling per cove — the seed on a completely dead table. */
  maxSeedMinor: number;
}

/** How fast the estimate follows a RISING handle. 0.25 ≈ a 4-round memory. */
export const HANDLE_EMA_ALPHA = 0.25;
/**
 * How fast it follows a FALLING handle. Deliberately much faster, because the
 * two directions are not symmetric in risk.
 *
 * math-model §6 documents that a lone player staking into thin seeds faces a
 * worse-than-nominal edge — their own stake makes their zone the biggest pool,
 * so they are the whale of their own round — and that raising the seed shrinks
 * that deviation. A slow-falling estimate would leave the seed low for several
 * rounds after a busy table emptied out, which is exactly the window where a
 * newly-solo player needs it high. Reacting fast to a room going quiet is
 * therefore a player-protection property, not a tuning preference.
 */
export const HANDLE_EMA_ALPHA_FALLING = 0.6;

/**
 * House seed per cove for the coming round.
 *
 * @param recentRealHandleMinor EMA of settled rounds' non-house handle.
 * @param zones                 K (six coves).
 */
export function houseSeedPerZone(
  policy: LiquidityPolicy,
  recentRealHandleMinor: number,
  zones: number,
): number {
  if (zones <= 0) return 0;
  const shortfall = Math.max(0, policy.floorMinor - Math.max(0, recentRealHandleMinor));
  const perZone = Math.ceil(shortfall / zones);
  // Integer minor units throughout (Identity Freeze §2.6). The CEILING is
  // absolute — it is the house's per-round liability limit, so a misconfigured
  // floor can never push the seed above it.
  const floorSeed = Math.min(policy.minSeedMinor, policy.maxSeedMinor);
  return Math.min(policy.maxSeedMinor, Math.max(floorSeed, perZone));
}

/**
 * Asymmetric moving average of a room's real (non-house) handle: slow to admit
 * that a room got busy, fast to admit that it went quiet. See
 * HANDLE_EMA_ALPHA_FALLING for why the asymmetry protects players.
 */
export function updateHandleEma(
  previousEmaMinor: number | null,
  roundRealHandleMinor: number,
  alphaRising = HANDLE_EMA_ALPHA,
  alphaFalling = HANDLE_EMA_ALPHA_FALLING,
): number {
  const observed = Math.max(0, roundRealHandleMinor);
  if (previousEmaMinor === null) return Math.round(observed);
  const alpha = observed < previousEmaMinor ? alphaFalling : alphaRising;
  return Math.max(0, Math.round(previousEmaMinor + alpha * (observed - previousEmaMinor)));
}

/**
 * A SYMMETRIC mean estimate of settled handle, for anything that must be
 * UNBIASED rather than protective.
 *
 * `updateHandleEma` above is deliberately asymmetric — fast to admit a room went
 * quiet, slow to admit it got busy — because the house seed it sizes is a
 * player-protection mechanism and erring toward "quiet" errs toward more
 * liquidity. That same asymmetry is a BIAS anywhere the estimate stands in for
 * an average, and it under-tracks by more the spikier the table is.
 *
 * The jackpot reset is such a place, and the bias was measurable. The reset is
 * `budgetFraction × houseShare × r/K × H`, linear in H, so the published RTP
 * term `jackpotReseedReturn` is exact only if H is an unbiased estimate of mean
 * handle. Measured against the release-gate simulation's deliberately spiky
 * synthetic crowd (a 5% chance of a 500–5,000 credit whale in any round), the
 * asymmetric estimate delivered a re-seed of 0.2345% of handle against a
 * modelled 0.3500% — a third short, and short in the direction that makes the
 * DISPLAYED return higher than the realised one. Against the behavioural crowd
 * of the certification simulation it ran slightly high instead. An estimator
 * whose bias changes sign with crowd volatility cannot underwrite a published
 * figure.
 *
 * So the two uses get two estimators. This one is symmetric and slow, which is
 * what "average handle at this table" actually means.
 */
export const HANDLE_MEAN_ALPHA = 0.05; // ≈ a 20-round memory, both directions

export function updateHandleMeanEma(
  previousEmaMinor: number | null,
  roundRealHandleMinor: number,
  alpha = HANDLE_MEAN_ALPHA,
): number {
  const observed = Math.max(0, roundRealHandleMinor);
  if (previousEmaMinor === null) return Math.round(observed);
  return Math.max(0, Math.round(previousEmaMinor + alpha * (observed - previousEmaMinor)));
}

/**
 * How a room's population reads to a player choosing a table. Purely a display
 * and routing hint — it never touches odds, stakes or settlement.
 */
export type LiquidityLevel = 'quiet' | 'filling' | 'busy';

/** Thresholds in REAL humans; bots are never counted (population honesty, C2). */
export const LIQUIDITY_BUSY_HUMANS = 8;
export const LIQUIDITY_FILLING_HUMANS = 3;

export function liquidityLevel(humanCount: number): LiquidityLevel {
  if (humanCount >= LIQUIDITY_BUSY_HUMANS) return 'busy';
  if (humanCount >= LIQUIDITY_FILLING_HUMANS) return 'filling';
  return 'quiet';
}
