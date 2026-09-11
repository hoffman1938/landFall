/**
 * Storage abstraction (remediation C3) — the ONLY persistence surface the game
 * logic sees. SQLite (dev) is implemented below; Postgres (production) swaps in
 * behind this interface without touching the coordinator.
 *
 * ATOMICITY CONTRACT: `inTransaction(fn)` runs `fn` atomically — everything a
 * settlement writes (stake outcomes, balance credits, surge pot, reserve
 * ledger, round row) MUST happen inside one `inTransaction` call, and a throw
 * anywhere inside (including the core conservation assert) must roll back all
 * of it. Implementations must be synchronous or provide equivalent isolation.
 */
import { and, count, desc, eq } from 'drizzle-orm';
import type { ActionReceipt } from '@landfall/core';
import type { Db } from './index.js';
import { randomHex } from '../random.js';
import {
  actionReceipts,
  actionTelemetry,
  playerDayLoss,
  playerLimits,
  players,
  rounds,
  skipperRecords,
  stakes,
  stormReserveLedger,
  surgeEvents,
  surgePots,
  serverSecrets,
  houseFloatLedger,
  significantEvents,
  controlVerifications,
} from './schema.js';

export interface PlayerRow {
  id: string;
  name: string;
  balanceMinor: number;
  isHouse: boolean;
  isBot: boolean;
  lastRoomId: string | null;
}

export interface StakeRow {
  id: string;
  roundId: number;
  playerId: string;
  zone: number;
  amountMinor: number;
  isHouseSeed: boolean;
}

export interface SurgeEventRow {
  roundId: number;
  winnerPlayerId: string | null;
  winnerStakeId: string | null;
  amountMinor: number;
  flatOdds: boolean;
}

export interface ReserveLedgerRow {
  roomId: string;
  roundId: number;
  inflowMinor: number;
  outflowMinor: number;
  balanceMinor: number;
  /** House capital injected this round to keep the fund non-negative (G11). */
  backstopMinor: number;
}

/** One round of segregated liquidity-float activity (G8). */
export interface HouseFloatLedgerRow {
  roundId: number;
  roomId: string;
  stakedMinor: number;
  returnedMinor: number;
  netMinor: number;
  topUpMinor: number;
  balanceMinor: number;
}

/** GLI-19 §2.9.5 significant event, with the value before and after (G37). */
export interface SignificantEventRow {
  category:
    | 'CONFIG'
    | 'GAME_STATE'
    | 'JACKPOT'
    | 'RESERVE'
    | 'INTEGRITY'
    | 'INCIDENT'
    | 'CDN'
    /** Practice-credit grants in a demo build — see `demoCredits.ts`. */
    | 'DEMO_CREDITS';
  component: string;
  actor: string;
  reason?: string | undefined;
  valueBefore?: string | undefined;
  valueAfter?: string | undefined;
  incident?: boolean | undefined;
}

/** GLI-19 §2.3.2 control-program verification result (G17). */
export interface ControlVerificationRow {
  trigger: 'SCHEDULED' | 'STARTUP' | 'ON_DEMAND';
  digestHex: string;
  baselineHex: string;
  passed: boolean;
  manifestJson: string;
}

export interface RoundSettlementFields {
  seedHex: string;
  struckZone: number;
  rakeMinor: number;
  rakeBp: number;
  maxPayoutMultiple: number;
  powerCapped: boolean;
}

export interface GameRepository {
  /** Atomicity contract — see file header. */
  inTransaction<T>(fn: () => T): T;

  // players
  getPlayer(id: string): PlayerRow | undefined;
  getHousePlayer(): PlayerRow | undefined;
  setPlayerBalance(id: string, balanceMinor: number): void;
  creditPlayer(id: string, deltaMinor: number): void;
  setPlayerRoom(id: string, roomId: string): void;

  // rounds
  insertRound(roomId: string, chainIndex: number, prevChainValue: string, rulesVersion: number): number;
  /** G27 — mark a round voided; every bet in it is refunded, no rake taken. */
  voidRound(roundId: number, reason: string): void;
  setRoundLockSnapshot(roundId: number, snapshotJson: string): void;
  roundSettledAt(roundId: number): number | null;
  settleRound(roundId: number, fields: RoundSettlementFields): void;
  recentStruckZones(roomId: string, limit: number): number[];

  // stakes
  insertStake(row: StakeRow): void;
  setStakeOutcome(stakeId: string, outcome: 'SAFE' | 'WRECKED', payoutMinor: number): void;

  // storm surge
  getSurgePot(roomId: string): { potMinor: number; diversionMinor: number } | undefined;
  setSurgePot(roomId: string, potMinor: number, diversionMinor: number): void;
  insertSurgeEvent(row: SurgeEventRow): void;
  countSurgeEvents(roomId: string): number;

  // storm reserve
  lastReserveBalance(roomId: string): number;
  lastReserveBackstopTotal(roomId: string): number;
  insertReserveLedger(row: ReserveLedgerRow): void;

  // segregated liquidity float (G8)
  lastFloatBalance(roomId: string): number | undefined;
  insertFloatLedger(row: HouseFloatLedgerRow): void;

  // significant events (G37) and control-program verification (G17)
  insertSignificantEvent(row: SignificantEventRow): void;
  insertControlVerification(row: ControlVerificationRow): void;
  lastControlBaseline(): string | undefined;

  // receipts (B1)
  insertReceipt(receipt: ActionReceipt): void;
  getOrCreateReceiptKey(): string;

  // behavioral telemetry (B3) — accepted round actions, for the offline collusion scan
  insertTelemetry(row: TelemetryInsert): void;

  // skipper records (E1) — cosmetic reputation, written inside the settlement txn
  getPlayerByName(name: string): PlayerRow | undefined;
  getSkipperRecord(playerId: string): SkipperRecordRow | undefined;
  upsertSkipperRecord(row: SkipperRecordRow): void;

  // responsible gambling (F1/F2)
  getPlayerLimits(playerId: string): PlayerLimitsRow | undefined;
  upsertPlayerLimits(row: PlayerLimitsRow): void;
  /** Signed day net loss (positive = down). Written inside the settlement txn. */
  getDayLoss(playerId: string, dayKey: string): number;
  addDayLoss(playerId: string, dayKey: string, deltaMinor: number): void;
}

export interface SkipperRecordRow {
  playerId: string;
  currentStreak: number;
  bestStreak: number;
  bluffsCalled: number;
  biggestSalvageMinor: number;
  roundsSailed: number;
  surgeWins: number;
}

export interface PlayerLimitsRow {
  playerId: string;
  sessionLossLimitMinor: number | null;
  dailyLossLimitMinor: number | null;
  stakePerRoundCapMinor: number | null;
  realityCheckMinutes: number | null;
  pendingJson: string | null;
  excludedUntil: number | null;
}

export interface TelemetryInsert {
  roomId: string;
  roundId: number;
  playerId: string;
  action: 'FLEET_ORDER' | 'CANCEL_ORDER' | 'SIGNAL';
  msIntoPhase: number;
  zone: number | null;
  stakeMinor: number | null;
  inFog: boolean;
  isMinStake: boolean;
  detail: string | null;
}

/**
 * The synchronous transaction primitive — the one thing the two SQLite hosts
 * spell differently. `better-sqlite3` hands back a wrapped function to call;
 * Durable Object storage runs the callback directly. Both are synchronous and
 * both roll back on a throw, which is exactly what the ATOMICITY CONTRACT
 * above requires, so the repository accepts either and normalises here rather
 * than existing twice.
 */
export type TransactionHost =
  | { transaction<T>(fn: () => T): () => T }
  | { transactionSync<T>(fn: () => T): T };

export class DrizzleSqliteRepository implements GameRepository {
  constructor(
    private db: Db,
    private txHost: TransactionHost,
  ) {}

  inTransaction<T>(fn: () => T): T {
    return 'transactionSync' in this.txHost
      ? this.txHost.transactionSync(fn)
      : this.txHost.transaction(fn)();
  }

  getPlayer(id: string): PlayerRow | undefined {
    const p = this.db.select().from(players).where(eq(players.id, id)).get();
    return p
      ? {
          id: p.id,
          name: p.name,
          balanceMinor: p.balanceMinor,
          isHouse: p.isHouse,
          isBot: p.isBot,
          lastRoomId: p.lastRoomId,
        }
      : undefined;
  }

  getHousePlayer(): PlayerRow | undefined {
    const p = this.db.select().from(players).where(eq(players.isHouse, true)).get();
    return p ? this.getPlayer(p.id) : undefined;
  }

  setPlayerBalance(id: string, balanceMinor: number): void {
    this.db.update(players).set({ balanceMinor }).where(eq(players.id, id)).run();
  }

  creditPlayer(id: string, deltaMinor: number): void {
    const p = this.db.select().from(players).where(eq(players.id, id)).get();
    if (!p) throw new Error(`creditPlayer: unknown player ${id}`);
    this.db
      .update(players)
      .set({ balanceMinor: p.balanceMinor + deltaMinor })
      .where(eq(players.id, id))
      .run();
  }

  setPlayerRoom(id: string, roomId: string): void {
    this.db.update(players).set({ lastRoomId: roomId }).where(eq(players.id, id)).run();
  }

  insertRound(
    roomId: string,
    chainIndex: number,
    prevChainValue: string,
    rulesVersion: number,
  ): number {
    // RETURNING, not the driver's `lastInsertRowid`: Durable Object SQLite hands
    // back a cursor that carries no rowid, so this is the one spelling both
    // SQLite hosts implement. The round id is the settlement's idempotency key,
    // so reading it back wrong is not a failure mode worth leaving open.
    //
    // `rulesVersion` is stamped HERE rather than at settlement: GLI-19 §A.5.1
    // binds a wager to the rules in force when it was accepted, and bets are
    // accepted against the round that this row opens (G45).
    const row = this.db
      .insert(rounds)
      .values({ roomId, chainIndex, prevChainValue, rulesVersion, createdAt: Date.now() })
      .returning({ id: rounds.id })
      .get();
    if (!row) throw new Error('insertRound: insert returned no row');
    return row.id;
  }

  /**
   * G27 / GLI §4.16, §A.6.4 — void a round that cannot be settled. The refund of
   * every stake is the caller's job inside the same transaction; this records
   * the void so the round can never later be settled and so the public record
   * and the player's history agree about what happened.
   */
  voidRound(roundId: number, reason: string): void {
    this.db
      .update(rounds)
      .set({ voidedAt: Date.now(), voidReason: reason })
      .where(eq(rounds.id, roundId))
      .run();
  }

  setRoundLockSnapshot(roundId: number, snapshotJson: string): void {
    this.db
      .update(rounds)
      .set({ lockSnapshotJson: snapshotJson })
      .where(eq(rounds.id, roundId))
      .run();
  }

  roundSettledAt(roundId: number): number | null {
    return (
      this.db.select({ s: rounds.settledAt }).from(rounds).where(eq(rounds.id, roundId)).get()
        ?.s ?? null
    );
  }

  settleRound(roundId: number, fields: RoundSettlementFields): void {
    this.db
      .update(rounds)
      .set({ ...fields, settledAt: Date.now() })
      .where(eq(rounds.id, roundId))
      .run();
  }

  recentStruckZones(roomId: string, limit: number): number[] {
    return this.db
      .select({ z: rounds.struckZone })
      .from(rounds)
      .where(eq(rounds.roomId, roomId))
      .orderBy(desc(rounds.id))
      .limit(limit)
      .all()
      .map((r) => r.z)
      .filter((z): z is number => z !== null)
      .reverse();
  }

  insertStake(row: StakeRow): void {
    this.db
      .insert(stakes)
      .values({ ...row, createdAt: Date.now() })
      .run();
  }

  setStakeOutcome(stakeId: string, outcome: 'SAFE' | 'WRECKED', payoutMinor: number): void {
    this.db.update(stakes).set({ outcome, payoutMinor }).where(eq(stakes.id, stakeId)).run();
  }

  getSurgePot(roomId: string): { potMinor: number; diversionMinor: number } | undefined {
    const row = this.db.select().from(surgePots).where(eq(surgePots.roomId, roomId)).get();
    return row ? { potMinor: row.potMinor, diversionMinor: row.diversionMinor ?? 0 } : undefined;
  }

  setSurgePot(roomId: string, potMinor: number, diversionMinor: number): void {
    this.db
      .insert(surgePots)
      .values({ roomId, potMinor, diversionMinor })
      .onConflictDoUpdate({ target: surgePots.roomId, set: { potMinor, diversionMinor } })
      .run();
  }

  insertSurgeEvent(row: SurgeEventRow): void {
    this.db
      .insert(surgeEvents)
      .values({ ...row, createdAt: Date.now() })
      .run();
  }

  countSurgeEvents(roomId: string): number {
    // Surge cadence (flat-odds Nth counting) is per room: join through rounds.
    return (
      this.db
        .select({ n: count() })
        .from(surgeEvents)
        .innerJoin(rounds, eq(surgeEvents.roundId, rounds.id))
        .where(eq(rounds.roomId, roomId))
        .get()?.n ?? 0
    );
  }

  lastReserveBalance(roomId: string): number {
    return (
      this.db
        .select()
        .from(stormReserveLedger)
        .where(eq(stormReserveLedger.roomId, roomId))
        .orderBy(desc(stormReserveLedger.roundId))
        .limit(1)
        .get()?.balanceMinor ?? 0
    );
  }

  lastReserveBackstopTotal(roomId: string): number {
    // The ledger stores the per-round injection, so the running total is a sum.
    const rows = this.db
      .select({ backstopMinor: stormReserveLedger.backstopMinor })
      .from(stormReserveLedger)
      .where(eq(stormReserveLedger.roomId, roomId))
      .all();
    return rows.reduce((a, r) => a + (r.backstopMinor ?? 0), 0);
  }

  insertReserveLedger(row: ReserveLedgerRow): void {
    this.db
      .insert(stormReserveLedger)
      .values({ ...row, createdAt: Date.now() })
      .run();
  }

  lastFloatBalance(roomId: string): number | undefined {
    return this.db
      .select()
      .from(houseFloatLedger)
      .where(eq(houseFloatLedger.roomId, roomId))
      .orderBy(desc(houseFloatLedger.roundId))
      .limit(1)
      .get()?.balanceMinor;
  }

  insertFloatLedger(row: HouseFloatLedgerRow): void {
    this.db
      .insert(houseFloatLedger)
      .values({ ...row, createdAt: Date.now() })
      .run();
  }

  insertSignificantEvent(row: SignificantEventRow): void {
    this.db
      .insert(significantEvents)
      .values({
        category: row.category,
        component: row.component,
        actor: row.actor,
        reason: row.reason ?? null,
        valueBefore: row.valueBefore ?? null,
        valueAfter: row.valueAfter ?? null,
        incident: row.incident ?? false,
        createdAt: Date.now(),
      })
      .run();
  }

  insertControlVerification(row: ControlVerificationRow): void {
    this.db
      .insert(controlVerifications)
      .values({ ...row, createdAt: Date.now() })
      .run();
  }

  lastControlBaseline(): string | undefined {
    return this.db
      .select()
      .from(controlVerifications)
      .orderBy(controlVerifications.id)
      .limit(1)
      .get()?.baselineHex;
  }

  insertReceipt(receipt: ActionReceipt): void {
    this.db
      .insert(actionReceipts)
      .values({
        roundId: receipt.roundId,
        seq: receipt.seq,
        playerId: receipt.playerId,
        action: receipt.action,
        actionHash: receipt.actionHash,
        ts: receipt.ts,
        msBeforeLock: receipt.msBeforeLock,
        verdict: receipt.verdict,
        reason: receipt.reason ?? null,
        sigHex: receipt.sigHex,
      })
      .run();
  }

  getOrCreateReceiptKey(): string {
    const row = this.db.select().from(serverSecrets).where(eq(serverSecrets.id, 1)).get();
    if (row) return row.receiptKeyHex;
    const keyHex = randomHex(32);
    this.db.insert(serverSecrets).values({ id: 1, receiptKeyHex: keyHex }).run();
    return keyHex;
  }

  insertTelemetry(row: TelemetryInsert): void {
    this.db
      .insert(actionTelemetry)
      .values({ ...row, createdAt: Date.now() })
      .run();
  }

  getPlayerByName(name: string): PlayerRow | undefined {
    const p = this.db.select().from(players).where(eq(players.name, name)).get();
    return p ? this.getPlayer(p.id) : undefined;
  }

  getSkipperRecord(playerId: string): SkipperRecordRow | undefined {
    const r = this.db
      .select()
      .from(skipperRecords)
      .where(eq(skipperRecords.playerId, playerId))
      .get();
    return r
      ? {
          playerId: r.playerId,
          currentStreak: r.currentStreak,
          bestStreak: r.bestStreak,
          bluffsCalled: r.bluffsCalled,
          biggestSalvageMinor: r.biggestSalvageMinor,
          roundsSailed: r.roundsSailed,
          surgeWins: r.surgeWins,
        }
      : undefined;
  }

  upsertSkipperRecord(row: SkipperRecordRow): void {
    const values = { ...row, updatedAt: Date.now() };
    this.db
      .insert(skipperRecords)
      .values(values)
      .onConflictDoUpdate({ target: skipperRecords.playerId, set: values })
      .run();
  }

  getPlayerLimits(playerId: string): PlayerLimitsRow | undefined {
    const r = this.db
      .select()
      .from(playerLimits)
      .where(eq(playerLimits.playerId, playerId))
      .get();
    return r
      ? {
          playerId: r.playerId,
          sessionLossLimitMinor: r.sessionLossLimitMinor,
          dailyLossLimitMinor: r.dailyLossLimitMinor,
          stakePerRoundCapMinor: r.stakePerRoundCapMinor,
          realityCheckMinutes: r.realityCheckMinutes,
          pendingJson: r.pendingJson,
          excludedUntil: r.excludedUntil,
        }
      : undefined;
  }

  upsertPlayerLimits(row: PlayerLimitsRow): void {
    const values = { ...row, updatedAt: Date.now() };
    this.db
      .insert(playerLimits)
      .values(values)
      .onConflictDoUpdate({ target: playerLimits.playerId, set: values })
      .run();
  }

  getDayLoss(playerId: string, dayKey: string): number {
    return (
      this.db
        .select()
        .from(playerDayLoss)
        .where(and(eq(playerDayLoss.playerId, playerId), eq(playerDayLoss.dayKey, dayKey)))
        .get()?.netLossMinor ?? 0
    );
  }

  addDayLoss(playerId: string, dayKey: string, deltaMinor: number): void {
    const existing = this.getDayLoss(playerId, dayKey);
    this.db
      .insert(playerDayLoss)
      .values({ playerId, dayKey, netLossMinor: existing + deltaMinor })
      .onConflictDoUpdate({
        target: [playerDayLoss.playerId, playerDayLoss.dayKey],
        set: { netLossMinor: existing + deltaMinor },
      })
      .run();
  }
}
