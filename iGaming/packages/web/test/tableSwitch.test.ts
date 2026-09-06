/**
 * Regression cover for table-scoped state leaking across a switch.
 *
 * The reported bug: after moving from a high-stakes table to a low-stakes one,
 * the old table's bet came with you — the deck offered "Bet again 50,000" at a
 * table whose maximum is 50, and the server rejected it on press.
 */
import { describe, expect, it } from 'vitest';
import { isTableSwitch, tableSwitchReset, type TableSwitchInput } from '../src/tableSwitch';

const fmt = (minor: number) => (minor / 100).toFixed(2);

const leviathanToSkiff: TableSwitchInput = {
  previousRoomId: 'leviathan',
  previousRoomName: 'Leviathan Deep',
  nextRoomId: 'skiff',
  nextRoomName: 'Skiff Harbor',
  liveStakeMinor: 50_000_00,
  stakeInputMinor: 50_000_00,
  nextMinStakeMinor: 1_00,
  nextMaxStakeMinor: 50_00,
  formatCredits: fmt,
};

describe('isTableSwitch', () => {
  it('is a switch only when the table actually changed', () => {
    expect(isTableSwitch('skiff', 'schooner')).toBe(true);
    expect(isTableSwitch('skiff', 'skiff')).toBe(false);
    // First connection: there is no table to have left.
    expect(isTableSwitch(null, 'skiff')).toBe(false);
  });
});

describe('tableSwitchReset', () => {
  it('does nothing on a reconnection to the same table', () => {
    expect(tableSwitchReset({ ...leviathanToSkiff, previousRoomId: 'skiff' })).toBeNull();
    expect(tableSwitchReset({ ...leviathanToSkiff, previousRoomId: null })).toBeNull();
  });

  it('drops the rebet that belonged to the table you left', () => {
    const reset = tableSwitchReset(leviathanToSkiff)!;
    expect(reset.lastFleet).toBeNull();
    expect(reset.lastAnchor).toBeNull();
  });

  it('carries the stake into the new tier instead of leaving it above the max', () => {
    const reset = tableSwitchReset(leviathanToSkiff)!;
    expect(reset.stakeInputMinor).toBe(50_00);
    expect(reset.stakeInputMinor).toBeLessThanOrEqual(leviathanToSkiff.nextMaxStakeMinor);
  });

  it('raises a stake that is under the new tier minimum', () => {
    const reset = tableSwitchReset({
      ...leviathanToSkiff,
      previousRoomId: 'skiff',
      nextRoomId: 'leviathan',
      stakeInputMinor: 1_00,
      nextMinStakeMinor: 5_000_00,
      nextMaxStakeMinor: 500_000_00,
    })!;
    expect(reset.stakeInputMinor).toBe(5_000_00);
  });

  it('drops history, receipts and cooldowns that describe the other table', () => {
    const reset = tableSwitchReset(leviathanToSkiff)!;
    expect(reset.replayCards).toEqual([]);
    expect(reset.receipts).toEqual([]);
    expect(reset.lastLandfall).toBeNull();
    expect(reset.myFlagRounds).toEqual([]);
    expect(reset.events).toEqual([]);
    expect(reset.selectedZone).toBeNull();
    // A verify sheet left open would be recomputing another table's round.
    expect(reset.verifyRoundId).toBeNull();
    expect(reset.wreckLogOpen).toBe(false);
  });

  it('says what happened to the refunded bet, as news rather than a rejection', () => {
    const reset = tableSwitchReset(leviathanToSkiff)!;
    expect(reset.toast).toContain('Skiff Harbor');
    expect(reset.toast).toContain('50000.00');
    expect(reset.toast).toContain('Leviathan Deep');
    expect(reset.toast).toContain('refunded');
    expect(reset.toastTone).toBe('info');
  });

  it('stays quiet when there was no live bet to refund', () => {
    const reset = tableSwitchReset({ ...leviathanToSkiff, liveStakeMinor: 0 })!;
    expect(reset.toast).toBeNull();
    // The reset still happens — only the notice is conditional.
    expect(reset.lastFleet).toBeNull();
  });
});
