import { describe, expect, it } from 'vitest';
import type { RoomInfo } from '@landfall/core';
import { preselectedRoomId, suggestedRoomId, tableOptions } from '../src/tableChoice';

const room = (
  roomId: string,
  minStakeMinor: number,
  maxStakeMinor: number,
  humanCount = 0,
  liquidity: RoomInfo['liquidity'] = 'quiet',
): RoomInfo => ({
  roomId,
  name: roomId,
  minStakeMinor,
  maxStakeMinor,
  humanCount,
  botsAllowed: true,
  ...(liquidity ? { liquidity } : {}),
});

const ladder: RoomInfo[] = [
  room('skiff', 100, 5_000, 2),
  room('schooner', 500, 50_000, 9, 'busy'),
  room('flagship', 5_000, 500_000),
  room('leviathan', 500_000, 50_000_000),
];

describe('table choice', () => {
  it('suggests the cheapest affordable table, never the busiest or the biggest', () => {
    expect(suggestedRoomId(ladder, 5_000_000)).toBe('skiff');
    // The busy table is not the suggestion just because it is busy.
    expect(suggestedRoomId(ladder, 600)).toBe('skiff');
    expect(suggestedRoomId(ladder, 600_000)).toBe('skiff');
  });

  it('still points somewhere real when nothing is affordable', () => {
    expect(suggestedRoomId(ladder, 1)).toBe('skiff');
    expect(suggestedRoomId([], 1_000)).toBeNull();
  });

  it('marks affordability from the minimum bet and counts whole bets', () => {
    const options = tableOptions(ladder, 'schooner', 5_000);
    expect(options.map((o) => o.affordable)).toEqual([true, true, true, false]);
    expect(options.find((o) => o.roomId === 'skiff')!.betsAffordable).toBe(50);
    expect(options.find((o) => o.roomId === 'flagship')!.betsAffordable).toBe(1);
    expect(options.find((o) => o.roomId === 'leviathan')!.betsAffordable).toBe(0);
  });

  it('flags the current table and the suggestion separately', () => {
    const options = tableOptions(ladder, 'flagship', 5_000);
    expect(options.find((o) => o.current)!.roomId).toBe('flagship');
    expect(options.find((o) => o.suggested)!.roomId).toBe('skiff');
  });

  it('defaults liquidity to quiet when the server did not send one', () => {
    const options = tableOptions([room('solo', 100, 5_000)], null, 1_000);
    expect(options[0]!.liquidity).toBe('quiet');
  });

  it('preselects the table you are already at, so a refresh is one tap', () => {
    expect(preselectedRoomId(ladder, 'flagship', 5_000)).toBe('flagship');
  });

  it('falls back to the suggestion when the current table is out of reach', () => {
    // Balance dropped below the table the player was last seated at.
    expect(preselectedRoomId(ladder, 'flagship', 600)).toBe('skiff');
    expect(preselectedRoomId(ladder, null, 600)).toBe('skiff');
  });
});
