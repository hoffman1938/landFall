import { describe, expect, it } from 'vitest';
import {
  ADVANCED_OFFER_ROUNDS,
  freshUiMode,
  grandfatheredUiMode,
  shouldOfferAdvanced,
  surfacesFor,
  withMode,
  withOfferDismissed,
} from '../src/uiMode';

describe('surfaces', () => {
  it('beginner shows none of the instruments', () => {
    const s = surfacesFor('beginner');
    expect(Object.values(s).every((v) => v === false)).toBe(true);
  });

  it('advanced shows all of them', () => {
    const s = surfacesFor('advanced');
    expect(Object.values(s).every((v) => v === true)).toBe(true);
  });
});

describe('defaults', () => {
  it('a fresh profile starts in beginner mode with the offer outstanding', () => {
    expect(freshUiMode()).toEqual({ version: 1, mode: 'beginner', offerAnswered: false });
  });

  it('a profile that predates this pass keeps the full dashboard', () => {
    expect(grandfatheredUiMode()).toEqual({ version: 1, mode: 'advanced', offerAnswered: true });
  });
});

describe('the advanced offer', () => {
  it('waits for the round threshold', () => {
    const fresh = freshUiMode();
    expect(shouldOfferAdvanced(fresh, 0)).toBe(false);
    expect(shouldOfferAdvanced(fresh, ADVANCED_OFFER_ROUNDS - 1)).toBe(false);
    expect(shouldOfferAdvanced(fresh, ADVANCED_OFFER_ROUNDS)).toBe(true);
  });

  it('is never made twice', () => {
    const dismissed = withOfferDismissed(freshUiMode());
    expect(shouldOfferAdvanced(dismissed, 999)).toBe(false);
  });

  it('is never made to someone already in advanced mode', () => {
    expect(shouldOfferAdvanced(grandfatheredUiMode(), 999)).toBe(false);
  });
});

describe('transitions', () => {
  it('choosing a mode also answers the offer', () => {
    const next = withMode(freshUiMode(), 'advanced');
    expect(next.mode).toBe('advanced');
    expect(next.offerAnswered).toBe(true);
  });

  it('is reversible — advanced is a choice, not a one-way door', () => {
    const back = withMode(withMode(freshUiMode(), 'advanced'), 'beginner');
    expect(back.mode).toBe('beginner');
    expect(back.offerAnswered).toBe(true);
  });

  it('returns the SAME object on a no-op so the store can skip the write', () => {
    const fresh = freshUiMode();
    expect(withMode(fresh, 'beginner')).toBe(fresh);
    const answered = withOfferDismissed(fresh);
    expect(withOfferDismissed(answered)).toBe(answered);
  });
});
