/**
 * The notice band — one slot above the deck, and never more than one notice.
 *
 * Before this, three independent components each pinned themselves to the same
 * strip with the same `bottom: calc(deck + 0.75rem)`: the error toast, the
 * "there is more here" offer, and (at the top of the board) the table intro,
 * which landed squarely on the compact Storm Clock instead. Any two of them
 * could be on screen at once, stacked in the same pixels, and the third could
 * cover the countdown.
 *
 * So there is one band, and it ranks its candidates rather than stacking them:
 *
 *   1. TOAST        a refusal the player is owed an explanation for, right now
 *   2. TABLE INTRO  the limits of the table they just joined
 *   3. OFFER        an invitation that can wait for any later round
 *
 * Everything here is transient and self-dismissing. The round's own surfaces
 * (tide report, final order, result) live in the stage slot directly above this
 * band, in the same flex column, so they stack instead of overlapping.
 *
 * ONE RULE ABOUT POINTER EVENTS, and it is the important part of this file:
 * a notice BODY never takes clicks, only its own controls do. The band floats
 * over the board, and on a 320px screen a notice is tall enough to sit across
 * four of the six harbors — measured, with those harbors reported unclickable
 * during SELECTING, which is the one moment they must work. Text that cannot
 * be clicked cannot steal a tap, so the body is `pointer-events-none` and each
 * button opts back in.
 */
import { useStore } from '../store';
import { TableIntroCard, useTableIntro } from './TableIntro';
import {
  getUiMode,
  setUiMode,
  shouldOfferAdvanced,
  useUiMode,
  withMode,
  withOfferDismissed,
} from '../uiMode';
import { useDeckProgress } from '../deckProgress';
import type { RoundState } from '../roundMachine';

export function BoardNotices({ state }: { state: RoundState }) {
  const toast = useStore((s) => s.toast);
  const toastTone = useStore((s) => s.toastTone);
  const { intro, dismiss } = useTableIntro();
  const uiMode = useUiMode();
  const progress = useDeckProgress();

  // 1 — a refusal outranks everything: it explains an action that just failed.
  if (toast) {
    return (
      <div
        role={toastTone === 'error' ? 'alert' : 'status'}
        aria-live={toastTone === 'error' ? 'assertive' : 'polite'}
        className={`lf-appear pointer-events-none max-w-[min(92vw,34rem)] rounded-md border bg-[var(--lf-surface)] px-4 py-2 text-center text-sm font-semibold text-[var(--lf-text)] ${
          toastTone === 'error' ? 'border-[var(--lf-accent-line)]' : 'border-[var(--lf-line-2)]'
        }`}
      >
        {toast}
      </div>
    );
  }

  // 2 — the table you just walked into.
  if (intro) return <TableIntroCard intro={intro} onDismiss={dismiss} />;

  /*
   * 3 — the advanced offer, during SELECTING only.
   *
   * SELECTING is the one state where the stage slot above is empty, so the
   * column holds one thing rather than two. It matters on a short board: with
   * the result card also in the column, the pair overflowed it and the clipping
   * that keeps cards on the board cut VERIFY in half and made it unclickable
   * (measured at 740x360). Covering harbors is no longer a hazard here because
   * the body does not take clicks — see the pointer-events note above.
   */
  if (state === 'SELECTING' && shouldOfferAdvanced(uiMode, progress.roundsCompleted)) {
    return (
      <div
        role="status"
        className="lf-appear pointer-events-none flex w-[min(94vw,30rem)] items-center gap-2 rounded-md border border-[var(--lf-line-2)] bg-[var(--lf-surface)] px-3 py-2"
      >
        <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--lf-text)]">
          More here: play styles, signals, stats.
        </p>
        <button
          type="button"
          onClick={() => setUiMode(withMode(getUiMode(), 'advanced'))}
          className="pointer-events-auto min-h-[40px] shrink-0 rounded-md border border-white px-3 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--lf-text)]"
        >
          Show me
        </button>
        <button
          type="button"
          onClick={() => setUiMode(withOfferDismissed(getUiMode()))}
          aria-label="Keep the simple board"
          className="pointer-events-auto min-h-[40px] min-w-[40px] shrink-0 px-3 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--lf-mute)] hover:text-[var(--lf-text)]"
        >
          No
        </button>
      </div>
    );
  }

  return null;
}
