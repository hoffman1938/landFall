/**
 * The beginner top bar — three items, and a way to the rest.
 *
 * The shipped `TopBar` carries twelve simultaneous items: logo, room switcher
 * with population, round id, phase chip, weather chip, jackpot ticker with a
 * LIVE dot, connection dot, player name, balance, volume, settings and help.
 * At most three of them affect the decision a player is making right now.
 *
 * Those three:
 *
 *      LANDFALL      where you are
 *      12.50         what you have
 *      ADVANCED      where everything else went
 *
 * The connection state joins them only when it is bad, because a green dot that
 * is always green teaches a player to ignore the dot.
 */
import { fmt, useStore } from '../store';

export function BeginnerTopBar({ onOpenAdvanced }: { onOpenAdvanced(): void }) {
  const balanceMinor = useStore((s) => s.balanceMinor);
  const connected = useStore((s) => s.connected);

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-[var(--lf-line)] bg-[var(--lf-bg-2)] px-3 py-2">
      <span className="text-[14px] font-black uppercase tracking-[0.22em] text-[var(--lf-text)]">
        Landfall
      </span>

      {!connected && (
        <span
          role="status"
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--lf-accent)]"
        >
          <span className="lf-pulse h-1.5 w-1.5 rounded-full bg-[var(--lf-accent)]" />
          Reconnecting
        </span>
      )}

      <div className="ml-auto flex items-baseline gap-1.5">
        <span className="lf-label-soft">Credits</span>
        <span className="lf-num text-[17px] text-[var(--lf-text)]">{fmt(balanceMinor)}</span>
      </div>

      <button
        type="button"
        onClick={onOpenAdvanced}
        className="min-h-[40px] shrink-0 rounded-md border border-[var(--lf-line)] px-2.5 text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--lf-dim)] transition-colors hover:border-[var(--lf-line-2)] hover:text-[var(--lf-text)]"
      >
        Advanced
      </button>
    </header>
  );
}
