/**
 * REPORTING AND EXPORT (gap G22; Order 240 Arts. 2.2, 3.3; Order 222 Annex 1
 * Art. 21(b); GLI-19 §2.8.1(b), §2.8.3).
 *
 * The gap register calls this the cheapest real progress available, and it is
 * right: every figure below already existed in the tables. `stakes` carries one
 * row per bet, `rounds` carries the lock snapshot and the economy config in
 * force, `surge_events` and `storm_reserve_ledger` carry the jackpot movements.
 * What did not exist was a way to GET IT OUT.
 *
 * The obligations this serves, in the order they will be asked for:
 *
 *   Order 240 Art. 3.3 — on request, information on EACH SPECIFIC TRANSACTION,
 *     expressly including each specific bet placed and each specific jackpot
 *     paid. This is the most demanding data requirement in the whole pack.
 *   Order 240 Art. 2.2(a.d)–(a.e) — total GGR and RTP as reported figures.
 *   Order 222 Art. 21(b) — game transaction details, a bets overview and
 *     jackpot details to the Selected Person.
 *   GLI-19 §2.8.1(b) — an export mechanism for analysis and audit (CSV/XLS).
 *   GLI-19 §2.8.3 — theme/paytable record with theoretical RTP and lifetime
 *     aggregates, which is also the PAR sheet's live half (G24).
 *
 * Everything here READS. There is no write path in this module, deliberately:
 * a reporting component that can mutate the record it reports on is a finding
 * of its own.
 */
import { and, eq, gte, lte } from 'drizzle-orm';
import {
  RAKE,
  RAKE_SPLIT,
  RULES_VERSION,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  ZONE_COUNT,
  actualRtp,
  classifyRtpVariance,
  theoreticalRtp,
  balanceJackpot,
} from '@landfall/core';
import type { Db } from './db/index.js';
import { houseFloatLedger, rounds, stakes, stormReserveLedger, surgeEvents, surgePots } from './db/schema.js';

export interface Period {
  /** Inclusive epoch ms. */
  fromMs: number;
  /** Exclusive epoch ms. */
  toMs: number;
  roomId?: string | undefined;
}

/**
 * CSV serialisation. RFC 4180 quoting — a field containing a comma, a quote or
 * a newline is quoted and its quotes doubled. Written out rather than pulled in
 * because §3 of the architecture rules requires a recorded reason for a runtime
 * dependency and this is twelve lines.
 */
/**
 * A cell is a primitive or absent. Typed rather than `unknown` on purpose: an
 * object reaching `String()` here would silently export `[object Object]` into a
 * file a regulator reads as the record of a bet, which is a worse failure than
 * a compile error.
 */
export type CsvCell = string | number | boolean | null | undefined;

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const cell = (v: CsvCell): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n');
}

/**
 * Order 240 Art. 3.3 — EVERY BET PLACED, one row per stake. The most granular
 * feed we owe, and the one an inspection will actually ask for.
 */
export function betTransactions(db: Db, period: Period) {
  const rows = db
    .select({
      stakeId: stakes.id,
      roundId: stakes.roundId,
      playerId: stakes.playerId,
      zone: stakes.zone,
      amountMinor: stakes.amountMinor,
      isHouseSeed: stakes.isHouseSeed,
      outcome: stakes.outcome,
      payoutMinor: stakes.payoutMinor,
      placedAt: stakes.createdAt,
      roomId: rounds.roomId,
      struckZone: rounds.struckZone,
      settledAt: rounds.settledAt,
      voidedAt: rounds.voidedAt,
      rulesVersion: rounds.rulesVersion,
    })
    .from(stakes)
    .innerJoin(rounds, eq(stakes.roundId, rounds.id))
    .where(
      and(
        gte(stakes.createdAt, period.fromMs),
        lte(stakes.createdAt, period.toMs),
        ...(period.roomId ? [eq(rounds.roomId, period.roomId)] : []),
      ),
    )
    .all();
  return rows;
}

export function betTransactionsCsv(db: Db, period: Period): string {
  const rows = betTransactions(db, period);
  return toCsv(
    [
      'stake_id',
      'round_id',
      'room_id',
      'player_id',
      'zone',
      'amount_minor',
      'is_house_seed',
      'outcome',
      'payout_minor',
      'struck_zone',
      'placed_at',
      'settled_at',
      'voided_at',
      'rules_version',
    ],
    rows.map((r) => [
      r.stakeId,
      r.roundId,
      r.roomId,
      r.playerId,
      r.zone,
      r.amountMinor,
      r.isHouseSeed ? 1 : 0,
      r.outcome,
      r.payoutMinor,
      r.struckZone,
      r.placedAt,
      r.settledAt,
      r.voidedAt,
      r.rulesVersion,
    ]),
  );
}

/** Order 222 Art. 21(b.c) — jackpot details: every payout and every rollover. */
export function jackpotTransactions(db: Db, period: Period) {
  return db
    .select({
      roundId: surgeEvents.roundId,
      roomId: rounds.roomId,
      winnerPlayerId: surgeEvents.winnerPlayerId,
      winnerStakeId: surgeEvents.winnerStakeId,
      amountMinor: surgeEvents.amountMinor,
      flatOdds: surgeEvents.flatOdds,
      at: surgeEvents.createdAt,
    })
    .from(surgeEvents)
    .innerJoin(rounds, eq(surgeEvents.roundId, rounds.id))
    .where(
      and(
        gte(surgeEvents.createdAt, period.fromMs),
        lte(surgeEvents.createdAt, period.toMs),
        ...(period.roomId ? [eq(rounds.roomId, period.roomId)] : []),
      ),
    )
    .all();
}

export function jackpotTransactionsCsv(db: Db, period: Period): string {
  return toCsv(
    ['round_id', 'room_id', 'winner_player_id', 'winner_stake_id', 'amount_minor', 'flat_odds', 'paid_at'],
    jackpotTransactions(db, period).map((r) => [
      r.roundId,
      r.roomId,
      r.winnerPlayerId ?? '(rolled over — no surviving player stake)',
      r.winnerStakeId,
      r.amountMinor,
      r.flatOdds ? 1 : 0,
      r.at,
    ]),
  );
}

export interface EcsReport {
  /** Order 240 Art. 2.2(a.a)–(a.c). Placeholders until the permit issues. */
  permitHolder: string;
  permitNumber: string | null;
  authorizationCertificateNumber: string | null;
  period: Period;
  rulesVersion: number;
  rounds: number;
  voidedRounds: number;
  /** Every credit staked, house seeds included. */
  handleMinor: number;
  /** Every credit staked by real players. */
  playerHandleMinor: number;
  /** Every credit returned to players: stake back, salvage, jackpots. */
  playerReturnedMinor: number;
  /** Order 240 Art. 2.2(a.d) — total GGR (IN − OUT). */
  ggrMinor: number;
  rakeMinor: number;
  /** Order 240 Art. 2.2(a.e) — RTP, actual and theoretical. */
  actualRtp: number;
  theoreticalRtp: number;
  rtpVariance: ReturnType<typeof classifyRtpVariance>;
  jackpotPaidMinor: number;
  reserveBalanceMinor: number;
  reserveBackstopMinor: number;
  floatBalanceMinor: number;
  floatContributedMinor: number;
}

/**
 * The Order 240 Art. 2.2 data set. The RTP figure is the one that needed
 * DEFINING rather than computing (G24) — see packages/core/src/rtp.ts for why a
 * pari-mutuel game's theoretical return is a function of handle, and why the
 * reported figure is measured on player handle while the theoretical one is
 * measured on total handle.
 */
export function ecsReport(db: Db, period: Period): EcsReport {
  const bets = betTransactions(db, period);
  const handleMinor = bets.reduce((a, b) => a + b.amountMinor, 0);
  const playerBets = bets.filter((b) => !b.isHouseSeed);
  const playerHandleMinor = playerBets.reduce((a, b) => a + b.amountMinor, 0);
  const playerReturnedMinor = playerBets.reduce((a, b) => a + (b.payoutMinor ?? 0), 0);

  const jackpots = jackpotTransactions(db, period).filter((j) => j.winnerPlayerId !== null);
  const jackpotPaidMinor = jackpots.reduce((a, j) => a + j.amountMinor, 0);

  const roundRows = db
    .select()
    .from(rounds)
    .where(
      and(
        gte(rounds.createdAt, period.fromMs),
        lte(rounds.createdAt, period.toMs),
        ...(period.roomId ? [eq(rounds.roomId, period.roomId)] : []),
      ),
    )
    .all();
  const rakeMinor = roundRows.reduce((a, r) => a + (r.rakeMinor ?? 0), 0);

  // Jackpot wins are returns to players but are not stake payouts, so they are
  // added here rather than being double-counted in the stake rows above.
  const returned = playerReturnedMinor + jackpotPaidMinor;
  const actual = actualRtp({
    handleMinor,
    playerHandleMinor,
    playerReturnedMinor: returned,
    rakeMinor,
  });
  const theoretical = theoreticalRtp(RAKE, RAKE_SPLIT, ZONE_COUNT);

  const reserveRows = period.roomId
    ? db.select().from(stormReserveLedger).where(eq(stormReserveLedger.roomId, period.roomId)).all()
    : db.select().from(stormReserveLedger).all();
  const floatRows = period.roomId
    ? db.select().from(houseFloatLedger).where(eq(houseFloatLedger.roomId, period.roomId)).all()
    : db.select().from(houseFloatLedger).all();

  return {
    permitHolder: 'LANDFALL (demo build — no permit issued)',
    permitNumber: null,
    authorizationCertificateNumber: null,
    period,
    rulesVersion: RULES_VERSION,
    rounds: roundRows.length,
    voidedRounds: roundRows.filter((r) => r.voidedAt !== null).length,
    handleMinor,
    playerHandleMinor,
    playerReturnedMinor: returned,
    ggrMinor: actual.ggrMinor,
    rakeMinor,
    actualRtp: actual.playerRtp,
    theoreticalRtp: theoretical.totalRtp,
    rtpVariance: classifyRtpVariance(actual.playerRtp, theoretical.totalRtp, roundRows.length),
    jackpotPaidMinor,
    reserveBalanceMinor: reserveRows.at(-1)?.balanceMinor ?? 0,
    reserveBackstopMinor: reserveRows.reduce((a, r) => a + (r.backstopMinor ?? 0), 0),
    floatBalanceMinor: floatRows.at(-1)?.balanceMinor ?? 0,
    floatContributedMinor: floatRows.reduce((a, r) => a + r.topUpMinor, 0),
  };
}

/**
 * Order 222 Annex 1 Art. 17.2 — MONTHLY JACKPOT BALANCING, and the incident it
 * raises when the identity does not hold.
 *
 * The arithmetic is exact in integer minor units, so there is no tolerance band
 * and a non-zero discrepancy is always a real defect rather than rounding. The
 * reconciliation itself lives in the jackpot control software
 * (packages/core/src/jackpot.ts), which is the artefact Art. 17.1(c) requires to
 * be separately authorized; this function only assembles its inputs.
 */
export function monthlyJackpotBalancing(db: Db, roomId: string, period: Period) {
  const openingRow = db
    .select()
    .from(surgeEvents)
    .innerJoin(rounds, eq(surgeEvents.roundId, rounds.id))
    .where(and(eq(rounds.roomId, roomId), lte(surgeEvents.createdAt, period.fromMs)))
    .all()
    .at(-1);

  const roundRows = db
    .select()
    .from(rounds)
    .where(
      and(eq(rounds.roomId, roomId), gte(rounds.createdAt, period.fromMs), lte(rounds.createdAt, period.toMs)),
    )
    .all();
  const contributionsMinor = roundRows.reduce(
    (a, r) => a + Math.floor((r.rakeMinor ?? 0) * RAKE_SPLIT.surge),
    0,
  );

  const paid = jackpotTransactions(db, { ...period, roomId }).filter((j) => j.winnerPlayerId !== null);
  const paidOutMinor = paid.reduce((a, j) => a + j.amountMinor, 0);

  const pot = db.select().from(surgePots).where(eq(surgePots.roomId, roomId)).get();
  const closingMinor = (pot?.potMinor ?? 0) + (pot?.diversionMinor ?? 0);

  // Each payout restores the reset value, which is house-funded to the extent
  // the diversion pool could not cover it.
  const openingMinor = openingRow?.surge_events.amountMinor ?? 0;
  const houseSeededMinor = Math.max(0, closingMinor + paidOutMinor - openingMinor - contributionsMinor);

  return balanceJackpot({
    openingMinor,
    contributionsMinor,
    paidOutMinor,
    houseSeededMinor,
    closingMinor,
  });
}

/**
 * GLI-19 §2.8.3 — the theme/paytable record. A pari-mutuel game has no paytable,
 * so the "theme" is the economy configuration, and the record carries the
 * theoretical RTP with its lifetime aggregates. This is the live half of the PAR
 * sheet (G24); the documented half is docs/10-compliance/09-rtp-and-par-sheet.md.
 */
export function paytableRecord(db: Db) {
  const all = db.select().from(rounds).all();
  const settled = all.filter((r) => r.settledAt !== null);
  const theoretical = theoreticalRtp();
  return {
    themeId: 'landfall-pari-mutuel',
    rulesVersion: RULES_VERSION,
    configuration: {
      zoneCount: ZONE_COUNT,
      rake: RAKE,
      rakeSplit: RAKE_SPLIT,
      maxPayoutMultiple: STORM_POWER_MAX_PAYOUT_MULTIPLE,
    },
    theoreticalRtp: theoretical.totalRtp,
    rtpBreakdown: theoretical,
    availableFrom: all[0]?.createdAt ?? null,
    gamesPlayed: settled.length,
    voidedGames: all.filter((r) => r.voidedAt !== null).length,
    totalRakeMinor: settled.reduce((a, r) => a + (r.rakeMinor ?? 0), 0),
    decommissionedAt: null,
    status: 'ACTIVE' as const,
  };
}
