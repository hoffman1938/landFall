/**
 * Client-side round verification — docs/04-architecture/rng-provably-fair-spec.md §6.
 * Two-part check: cryptographic (chain link + draw recompute) and arithmetic
 * (your payout from the public lock snapshot).
 */
import {
  stormPowerFromRoll,
  weatherFromRoll,
  type StormPowerTier,
  type WeatherId,
  type WeatherPattern,
} from './constants.js';
import { drawZone, verifyChainLink } from './rng.js';
import { pickGoldenAnchor, settleRound, type StakeEntry } from './settlement.js';

export interface RoundVerificationInput {
  roundId: number;
  seedHex: string;
  prevChainValue: string;
  announcedStruckZone: number;
  zoneCount: number;
  rake: number;
  /** Full lock snapshot as published (all stakes incl. house seeds). */
  stakes: StakeEntry[];
  /** Optional: verify one player's payout. */
  myStakeId?: string;
  myAnnouncedPayoutMinor?: number;
  /** Optional Storm Surge check: the surge probability in force and the announced surge state. */
  surgeProb?: number;
  announcedSurge?: boolean;
  announcedSurgeWinnerStakeId?: string | null;
  /** Optional Storm Power check: the multiplier the server claims applied. */
  announcedPowerLabel?: string;
  /** Optional Weather Pattern check: the round pattern the server claims applied. */
  announcedWeatherId?: WeatherId;
}

export interface RoundVerificationResult {
  chainOk: boolean;
  drawOk: boolean;
  recomputedZone: number;
  u: number;
  feints: [number, number];
  payoutOk: boolean | null; // null when no payout check requested
  recomputedPayoutMinor: number | null;
  /** null when no surge check requested. */
  surgeOk: boolean | null;
  recomputedSurge: boolean | null;
  recomputedSurgeWinnerStakeId: string | null;
  /** Storm Power always recomputed; powerOk null unless an announced label was provided. */
  recomputedPower: StormPowerTier;
  powerOk: boolean | null;
  /** Weather Pattern always recomputed; weatherOk null unless an announced id was provided. */
  recomputedWeather: WeatherPattern;
  weatherOk: boolean | null;
  allOk: boolean;
}

export function verifyRound(input: RoundVerificationInput): RoundVerificationResult {
  const chainOk = verifyChainLink(input.seedHex, input.prevChainValue);
  const draw = drawZone(input.seedHex, input.roundId, input.zoneCount);
  const drawOk = draw.struckZone === input.announcedStruckZone;

  // Storm Power is part of the same digest — always recompute it, and use it in
  // the payout recheck (payouts are settled WITH the multiplier).
  const recomputedPower = stormPowerFromRoll(draw.stormPowerRoll);
  const powerOk =
    input.announcedPowerLabel === undefined
      ? null
      : recomputedPower.label === input.announcedPowerLabel;
  const recomputedWeather = weatherFromRoll(draw.weatherRoll);
  const weatherOk =
    input.announcedWeatherId === undefined
      ? null
      : recomputedWeather.id === input.announcedWeatherId;

  let payoutOk: boolean | null = null;
  let recomputedPayoutMinor: number | null = null;
  if (input.myStakeId !== undefined) {
    const settlement = settleRound(input.stakes, input.announcedStruckZone, input.rake, {
      mNum: recomputedPower.mNum,
      mDen: recomputedPower.mDen,
    });
    const line = settlement.lines.find((l) => l.id === input.myStakeId);
    recomputedPayoutMinor = line ? line.payoutMinor : null;
    payoutOk =
      line !== undefined &&
      (input.myAnnouncedPayoutMinor === undefined ||
        line.payoutMinor === input.myAnnouncedPayoutMinor);
  }

  // Storm Surge: recompute trigger + Golden Anchor winner from the same digest.
  let surgeOk: boolean | null = null;
  let recomputedSurge: boolean | null = null;
  let recomputedSurgeWinnerStakeId: string | null = null;
  if (input.surgeProb !== undefined) {
    recomputedSurge = draw.uSurge < input.surgeProb;
    const winner = recomputedSurge
      ? pickGoldenAnchor(input.stakes, input.announcedStruckZone, draw.uWinner)
      : null;
    recomputedSurgeWinnerStakeId = winner?.id ?? null;
    surgeOk =
      (input.announcedSurge === undefined || recomputedSurge === input.announcedSurge) &&
      (input.announcedSurgeWinnerStakeId === undefined ||
        recomputedSurgeWinnerStakeId === input.announcedSurgeWinnerStakeId);
  }

  return {
    chainOk,
    drawOk,
    recomputedZone: draw.struckZone,
    u: draw.u,
    feints: draw.feints,
    payoutOk,
    recomputedPayoutMinor,
    surgeOk,
    recomputedSurge,
    recomputedSurgeWinnerStakeId,
    recomputedPower,
    powerOk,
    recomputedWeather,
    weatherOk,
    allOk:
      chainOk &&
      drawOk &&
      payoutOk !== false &&
      surgeOk !== false &&
      powerOk !== false &&
      weatherOk !== false,
  };
}
