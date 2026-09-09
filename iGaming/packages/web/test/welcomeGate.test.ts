import { describe, expect, it } from 'vitest';
import { nextWelcomeOpen } from '../src/welcomeGate';

describe('entry gate open decision', () => {
  it('opens on a clean first arrival', () => {
    expect(nextWelcomeOpen({ settled: false, hasLiveFleet: false, currentlyOpen: false })).toBe(
      true,
    );
  });

  it('stays shut when the first frame resumes a live fleet', () => {
    // Mid-round reconnect: the player's own money is on the table and a modal
    // over it would be worse than no onboarding at all.
    expect(nextWelcomeOpen({ settled: false, hasLiveFleet: true, currentlyOpen: false })).toBe(
      false,
    );
  });

  it('does not reopen when a table switch replies with a fresh WELCOME', () => {
    // The regression this module exists for: JOIN_ROOM is answered with a full
    // WELCOME frame, which used to slam the gate shut in front of a player who
    // had just chosen their table.
    expect(nextWelcomeOpen({ settled: true, hasLiveFleet: false, currentlyOpen: false })).toBe(
      false,
    );
  });

  it('does not reopen on a reconnect after the gate was dismissed', () => {
    expect(nextWelcomeOpen({ settled: true, hasLiveFleet: true, currentlyOpen: false })).toBe(
      false,
    );
  });

  it('leaves an still-open gate open if a frame arrives before it is answered', () => {
    // A table's population can change while the player is reading; the ROOM_LIST
    // refresh must not close the gate under them.
    expect(nextWelcomeOpen({ settled: true, hasLiveFleet: false, currentlyOpen: true })).toBe(true);
  });

  it('is idempotent — repeated frames never flip a settled decision', () => {
    let open = nextWelcomeOpen({ settled: false, hasLiveFleet: false, currentlyOpen: false });
    for (let i = 0; i < 5; i++) {
      open = nextWelcomeOpen({ settled: true, hasLiveFleet: false, currentlyOpen: open });
    }
    expect(open).toBe(true);
  });
});
