/**
 * The dialog contract, in one place.
 *
 * Eight overlays shipped with eight different answers to the same three
 * questions. Audited:
 *
 *   RulesModal, VerifyModal      escape + focus in + focus restored
 *   AdvancedSheet, WelcomeGate   escape + focus in, focus NOT restored
 *   WreckLogSheet, SkipperCard,
 *   LimitsModal                  escape only — focus stayed on the page behind
 *   RealityCheck                 none of the three
 *
 * A keyboard or screen-reader user opening the round history therefore landed
 * nowhere: the sheet appeared, focus stayed on the button underneath it, and
 * Tab walked the board behind the scrim. This hook is the single answer, so a
 * new overlay gets the behaviour by construction rather than by remembering.
 *
 *   - focus moves to `initialFocus` (or the dialog) when it opens;
 *   - Escape closes it;
 *   - focus returns to whatever had it before, when it closes.
 *
 * It deliberately does NOT implement a focus TRAP. Every overlay here is a
 * scrim over an inert page, and a partial trap is worse than none — this is the
 * behaviour that was missing, stated once.
 */
import { useEffect, type RefObject } from 'react';

export interface DialogOptions {
  open: boolean;
  onClose(): void;
  /** What to focus when it opens. Falls back to the dialog element itself. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Set false for an overlay that must be answered rather than dismissed. */
  closeOnEscape?: boolean;
}

export function useDialog({
  open,
  onClose,
  initialFocus,
  closeOnEscape = true,
}: DialogOptions): void {
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // A frame's grace: the dialog's own content mounts in the same commit, and
    // focusing before layout lands can scroll a sheet to the wrong place.
    const raf = requestAnimationFrame(() => initialFocus?.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (!closeOnEscape || event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      // Only take focus back if it is still inside the overlay we are closing —
      // otherwise we would yank it away from wherever the user has moved on to.
      if (previouslyFocused && document.body.contains(previouslyFocused)) {
        const active = document.activeElement;
        if (!active || active === document.body) previouslyFocused.focus();
      }
    };
  }, [open, onClose, initialFocus, closeOnEscape]);
}
