/**
 * ControlDeck state machine (remediation D1) — pure resolution of the deck's
 * controls from round state, so every state is enumerable and unit-tested
 * (test/deckState.test.ts dumps the full table).
 *
 * DESIGN LAW (Do-Not list): the primary button is NEVER destructive. Its kind
 * type does not even include 'cancel' — cancel lives only on the small ✕,
 * which requires hold-to-confirm during Blind Fog (it consumes the one fog
 * order). RESTAKE is an explicit secondary that appears when the stepper
 * differs from the placed stake; it never replaces the primary's meaning.
 * The primary's position and size never change within a phase.
 *
 * State table — (phase × fleet × fog × order) → controls:
 *
 * | phase        | fleet | fog | final/pending | primary            | kind      | RESTAKE | ✕      |
 * |--------------|-------|-----|---------------|--------------------|-----------|---------|--------|
 * | (disconnect) | —     | —   | —             | RECONNECTING…      | idle      | no      | no     |
 * | (connecting) | —     | —   | —             | CONNECTING…        | idle      | no      | no     |
 * | ANCHOR_OPEN  | none  | any | pending       | SENDING…           | idle      | no      | no     |
 * | ANCHOR_OPEN  | none  | any | —             | REBET (if last)    | action    | no      | no     |
 * | ANCHOR_OPEN  | none  | any | —             | SELECT A COVE      | idle      | no      | no     |
 * | ANCHOR_OPEN  | placed| no  | —             | ANCHORED — cove·stk| confirmed | if diff | yes    |
 * | ANCHOR_OPEN  | placed| yes | —             | ANCHORED — cove·stk| confirmed | if diff | HOLD   |
 * | ANCHOR_OPEN  | any   | any | final used    | FINAL ORDER SET    | confirmed | no      | no     |
 * | LOCKED_STORM | any   | —   | —             | ANCHORS LOCKED     | idle      | no      | no     |
 * | RESOLVED     | any   | —   | —             | LANDFALL           | idle      | no      | no     |
 * | COOLDOWN     | any   | —   | —             | NEXT ROUND SOON    | idle      | no      | no     |
 */
import type { RoundPhase } from '@landfall/core';

export interface DeckStateInput {
  connected: boolean;
  phase: RoundPhase | null;
  hasFleet: boolean;
  /** Stake of the placed fleet (null when none). */
  fleetStakeMinor: number | null;
  stakeInputMinor: number;
  finalOrderUsed: boolean;
  orderPending: boolean;
  /** Blind Fog active (tide report frozen during ANCHOR_OPEN). */
  fogActive: boolean;
  hasLastFleet: boolean;
}

export type PrimaryId =
  | 'reconnecting'
  | 'connecting'
  | 'locked'
  | 'landfall'
  | 'cooldown'
  | 'final-order-set'
  | 'sending'
  | 'anchored'
  | 'rebet'
  | 'select-cove';

/** Deliberately excludes any destructive kind — enforced by the type system. */
export type PrimaryKind = 'action' | 'confirmed' | 'idle';

export interface DeckState {
  primary: { id: PrimaryId; kind: PrimaryKind; disabled: boolean };
  /** Secondary RESTAKE button: stepper differs from the placed stake. */
  showRestake: boolean;
  /** Small ✕ cancel button visible. */
  showCancel: boolean;
  /** ✕ requires hold-to-confirm (Blind Fog: cancel consumes the one fog order). */
  cancelNeedsHold: boolean;
}

export function resolveDeckState(input: DeckStateInput): DeckState {
  const none: Pick<DeckState, 'showRestake' | 'showCancel' | 'cancelNeedsHold'> = {
    showRestake: false,
    showCancel: false,
    cancelNeedsHold: false,
  };
  if (!input.connected) {
    return { primary: { id: 'reconnecting', kind: 'idle', disabled: true }, ...none };
  }
  if (input.phase === null) {
    return { primary: { id: 'connecting', kind: 'idle', disabled: true }, ...none };
  }
  if (input.phase === 'LOCKED_STORM') {
    return { primary: { id: 'locked', kind: 'idle', disabled: true }, ...none };
  }
  if (input.phase === 'RESOLVED') {
    return { primary: { id: 'landfall', kind: 'idle', disabled: true }, ...none };
  }
  if (input.phase === 'COOLDOWN') {
    return { primary: { id: 'cooldown', kind: 'idle', disabled: true }, ...none };
  }
  // ANCHOR_OPEN
  if (input.finalOrderUsed) {
    return { primary: { id: 'final-order-set', kind: 'confirmed', disabled: true }, ...none };
  }
  if (input.orderPending) {
    return { primary: { id: 'sending', kind: 'idle', disabled: true }, ...none };
  }
  if (input.hasFleet) {
    return {
      // Calm confirmed state: pressing it does nothing (D1 — never a trap).
      primary: { id: 'anchored', kind: 'confirmed', disabled: true },
      showRestake: input.stakeInputMinor !== input.fleetStakeMinor,
      showCancel: true,
      cancelNeedsHold: input.fogActive,
    };
  }
  if (input.hasLastFleet) {
    return { primary: { id: 'rebet', kind: 'action', disabled: false }, ...none };
  }
  return { primary: { id: 'select-cove', kind: 'idle', disabled: true }, ...none };
}

/**
 * D4 — payout expectation strip formatting. Input: gains per other cove (from
 * core's payoutExpectationGains, public tide bands only). Output copy follows
 * the R7-reviewed template; ranges only, never a guarantee.
 */
export interface PayoutStrip {
  /** e.g. "+8–15%" — range over the other coves excluding the heaviest. */
  typicalRange: string;
  /** e.g. "+40%" — the heaviest other cove. */
  heaviest: string;
}

export function formatPayoutStrip(gains: readonly number[]): PayoutStrip | null {
  if (gains.length === 0) return null;
  const pct = (g: number) => Math.round(g * 100);
  const sorted = [...gains].sort((a, b) => a - b);
  const heaviest = sorted[sorted.length - 1]!;
  const rest = sorted.slice(0, -1);
  const lo = pct(rest.length > 0 ? rest[0]! : heaviest);
  const hi = pct(rest.length > 0 ? rest[rest.length - 1]! : heaviest);
  return {
    typicalRange: lo === hi ? `+${lo}%` : `+${lo}–${hi}%`,
    heaviest: `+${pct(heaviest)}%`,
  };
}
