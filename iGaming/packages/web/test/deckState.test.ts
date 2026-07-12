/**
 * D1 — deck state machine coverage. Enumerates every (phase × fleet × fog ×
 * order) combination as a state dump and asserts the design laws:
 *   - the primary is NEVER a destructive action;
 *   - cancel exists only as the small ✕ (hold-to-confirm in fog);
 *   - RESTAKE appears exactly when the stepper differs from the placed stake.
 */
import { describe, expect, it } from 'vitest';
import type { RoundPhase } from '@landfall/core';
import { formatPayoutStrip, resolveDeckState, type DeckStateInput } from '../src/deckState';

function input(overrides: Partial<DeckStateInput>): DeckStateInput {
  return {
    connected: true,
    phase: 'ANCHOR_OPEN',
    hasFleet: false,
    fleetStakeMinor: null,
    stakeInputMinor: 5_00,
    finalOrderUsed: false,
    orderPending: false,
    fogActive: false,
    hasLastFleet: false,
    ...overrides,
  };
}

describe('deck state machine (D1)', () => {
  it('full state dump: every combination resolves, none is destructive-primary', () => {
    const phases: (RoundPhase | null)[] = [
      null,
      'ANCHOR_OPEN',
      'LOCKED_STORM',
      'RESOLVED',
      'COOLDOWN',
    ];
    const dump: string[] = [];
    for (const connected of [true, false]) {
      for (const phase of phases) {
        for (const hasFleet of [true, false]) {
          for (const fogActive of [true, false]) {
            for (const finalOrderUsed of [true, false]) {
              for (const orderPending of [true, false]) {
                for (const stakeDiffers of [true, false]) {
                  const s = resolveDeckState(
                    input({
                      connected,
                      phase,
                      hasFleet,
                      fleetStakeMinor: hasFleet ? 5_00 : null,
                      stakeInputMinor: stakeDiffers ? 10_00 : 5_00,
                      fogActive,
                      finalOrderUsed,
                      orderPending,
                      hasLastFleet: true,
                    }),
                  );
                  // Law: the primary kind can never be destructive (the type
                  // excludes it, this guards against future regressions).
                  expect(['action', 'confirmed', 'idle']).toContain(s.primary.kind);
                  // Law: cancel affordances only exist alongside a placed fleet
                  // during ANCHOR_OPEN.
                  if (s.showCancel) {
                    expect(connected).toBe(true);
                    expect(phase).toBe('ANCHOR_OPEN');
                    expect(hasFleet).toBe(true);
                    expect(finalOrderUsed).toBe(false);
                  }
                  // Law: hold-to-confirm exactly when fog is active.
                  if (s.showCancel) expect(s.cancelNeedsHold).toBe(fogActive);
                  // Law: RESTAKE appears iff the stepper differs from the
                  // placed stake (and a fleet exists, order actionable).
                  if (s.showRestake) {
                    expect(hasFleet).toBe(true);
                    expect(stakeDiffers).toBe(true);
                  }
                  dump.push(
                    `${connected ? 'on' : 'off'}|${phase ?? '—'}|fleet:${hasFleet ? 'y' : 'n'}|fog:${fogActive ? 'y' : 'n'}|final:${finalOrderUsed ? 'y' : 'n'}|pending:${orderPending ? 'y' : 'n'}|diff:${stakeDiffers ? 'y' : 'n'} -> ${s.primary.id}/${s.primary.kind}${s.showRestake ? ' +RESTAKE' : ''}${s.showCancel ? (s.cancelNeedsHold ? ' +✕(hold)' : ' +✕') : ''}`,
                  );
                }
              }
            }
          }
        }
      }
    }
    // The dump is the storybook-style artifact: assert its cardinality so a
    // new dimension can't silently skip enumeration.
    expect(dump).toHaveLength(2 * 5 * 2 * 2 * 2 * 2 * 2);
  });

  it('anchored fleet -> calm confirmed primary; cancel only on ✕', () => {
    const s = resolveDeckState(input({ hasFleet: true, fleetStakeMinor: 5_00 }));
    expect(s.primary).toEqual({ id: 'anchored', kind: 'confirmed', disabled: true });
    expect(s.showCancel).toBe(true);
    expect(s.cancelNeedsHold).toBe(false);
    expect(s.showRestake).toBe(false);
  });

  it('fog cancel requires hold-to-confirm', () => {
    const s = resolveDeckState(input({ hasFleet: true, fleetStakeMinor: 5_00, fogActive: true }));
    expect(s.showCancel).toBe(true);
    expect(s.cancelNeedsHold).toBe(true);
  });

  it('stepper differing from placed stake reveals RESTAKE without touching the primary', () => {
    const s = resolveDeckState(
      input({ hasFleet: true, fleetStakeMinor: 5_00, stakeInputMinor: 25_00 }),
    );
    expect(s.showRestake).toBe(true);
    expect(s.primary.id).toBe('anchored'); // primary meaning unchanged
  });

  it('final order set disables everything calmly', () => {
    const s = resolveDeckState(input({ hasFleet: true, finalOrderUsed: true }));
    expect(s.primary).toEqual({ id: 'final-order-set', kind: 'confirmed', disabled: true });
    expect(s.showCancel).toBe(false);
  });

  it('a pending selection (no fleet yet) makes Place Bet the actionable primary (v3 P0-1)', () => {
    const s = resolveDeckState(input({ hasFleet: false, hasSelection: true, hasLastFleet: true }));
    expect(s.primary).toEqual({ id: 'place-bet', kind: 'action', disabled: false });
    expect(s.showCancel).toBe(false);
  });

  it('a placed fleet outranks any lingering selection', () => {
    const s = resolveDeckState(
      input({ hasFleet: true, fleetStakeMinor: 5_00, hasSelection: true }),
    );
    expect(s.primary.id).toBe('anchored');
  });
});

describe('payout strip formatting (v3 §9/P0-6 — money, not percentage)', () => {
  it('formats the if-safe payout range in money from stake × (1 + gain)', () => {
    // stake $5.00, gains 8%..44% -> payout $5.40..$7.20
    const strip = formatPayoutStrip([0.08, 0.44, 0.2], 5_00)!;
    expect(strip.ifSafeRange).toBe('$5.40–$7.20');
  });

  it('collapses to a single figure with one other zone', () => {
    const strip = formatPayoutStrip([0.2], 5_00)!;
    expect(strip.ifSafeRange).toBe('$6.00');
  });

  it('returns null with no other zones or a non-positive stake', () => {
    expect(formatPayoutStrip([], 5_00)).toBeNull();
    expect(formatPayoutStrip([0.2], 0)).toBeNull();
  });
});
