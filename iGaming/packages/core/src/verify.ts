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
import {
  drawEnvironment,
  drawEventTier,
  type EnvironmentId,
  type EnvironmentSpec,
  type EventTierId,
  type EventTierSpec,
} from './presentation.js';
import { drawZone, verifyChainLink } from './rng.js';
import {
  pickGoldenAnchor,
  pickGoldenAnchorFlat,
  settleRound,
  type StakeEntry,
} from './settlement.js';

export interface RoundVerificationInput {
  roundId: number;
  seedHex: string;
  prevChainValue: string;
  announcedStruckZone: number;
  zoneCount: number;
  rake: number;
  /** Full lock snapshot as published (all stakes incl. house seeds). */
  stakes: StakeEntry[];
  /**
   * Storm Power liability cap in force for the round (A3), as a multiple of the
   * round handle. Omitted -> uncapped recompute (legacy rounds).
   */
  maxPayoutMultiple?: number;
  /** Optional: verify one player's payout. */
  myStakeId?: string;
  myAnnouncedPayoutMinor?: number;
  /** Optional Storm Surge check: the surge probability in force and the announced surge state. */
  surgeProb?: number;
  announcedSurge?: boolean;
  announcedSurgeWinnerStakeId?: string | null;
  /** Flat-odds Golden Anchor mode as announced in the round header (A4). */
  surgeFlatOdds?: boolean;
  /** Optional Storm Power check: the multiplier the server claims applied. */
  announcedPowerLabel?: string;
  /** Optional Weather Pattern check: the round pattern the server claims applied. */
  announcedWeatherId?: WeatherId;
  /**
   * Optional v4 presentation checks. These live in their own HMAC domains and
   * touch nothing but the screen, but the server ANNOUNCES them before the seed
   * is revealed — so they get verified for the same reason the surge
   * announcement does: an announcement nobody can check is not a commitment.
   */
  announcedEventTierId?: EventTierId;
  announcedEnvironmentId?: EnvironmentId;
}

export interface RoundVerificationResult {
  chainOk: boolean;
  drawOk: boolean;
  recomputedZone: number;
  u: number;
  feints: [number, number];
  payoutOk: boolean | null; // null when no payout check requested
  recomputedPayoutMinor: number | null;
  /** True when the recomputed settlement hit the liability cap (null: no payout check). */
  recomputedPowerCapped: boolean | null;
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
  /** v4 presentation domains — always recomputed; *Ok null unless announced. */
  recomputedEventTier: EventTierSpec;
  eventTierOk: boolean | null;
  recomputedEnvironment: EnvironmentSpec;
  environmentOk: boolean | null;
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

  // v4: separate HMAC domains over the same revealed seed. Recomputing them here
  // is what makes "the event tier cannot touch the harbor" checkable rather
  // than merely claimed — the harbor above came from a different message.
  const recomputedEventTier = drawEventTier(input.seedHex, input.roundId);
  const eventTierOk =
    input.announcedEventTierId === undefined
      ? null
      : recomputedEventTier.id === input.announcedEventTierId;
  const recomputedEnvironment = drawEnvironment(input.seedHex, input.roundId);
  const environmentOk =
    input.announcedEnvironmentId === undefined
      ? null
      : recomputedEnvironment.id === input.announcedEnvironmentId;

  // Liability cap in force (A3): recompute from the public snapshot's handle so
  // capped rounds verify exactly as settled.
  const handleMinor = input.stakes.reduce((a, s) => a + s.amountMinor, 0);
  const maxSalvageMinor =
    input.maxPayoutMultiple === undefined ? undefined : input.maxPayoutMultiple * handleMinor;

  let payoutOk: boolean | null = null;
  let recomputedPayoutMinor: number | null = null;
  let recomputedPowerCapped: boolean | null = null;
  if (input.myStakeId !== undefined) {
    const settlement = settleRound(
      input.stakes,
      input.announcedStruckZone,
      input.rake,
      { mNum: recomputedPower.mNum, mDen: recomputedPower.mDen },
      maxSalvageMinor,
    );
    recomputedPowerCapped = settlement.powerCapped;
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
    const pick = input.surgeFlatOdds ? pickGoldenAnchorFlat : pickGoldenAnchor;
    const winner = recomputedSurge
      ? pick(input.stakes, input.announcedStruckZone, draw.uWinner)
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
    recomputedPowerCapped,
    surgeOk,
    recomputedSurge,
    recomputedSurgeWinnerStakeId,
    recomputedPower,
    powerOk,
    recomputedWeather,
    weatherOk,
    recomputedEventTier,
    eventTierOk,
    recomputedEnvironment,
    environmentOk,
    allOk:
      chainOk &&
      drawOk &&
      payoutOk !== false &&
      surgeOk !== false &&
      powerOk !== false &&
      weatherOk !== false &&
      eventTierOk !== false &&
      environmentOk !== false,
  };
}
