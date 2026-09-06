import { useEffect, useId, useRef } from 'react';
import { useStore } from '../store';
import { ONE_LINER } from '../strings';
import { AnchorIcon, CrateIcon, FogIcon, LockIcon, StormIcon, XIcon } from './icons';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-md border border-[var(--lf-line)] bg-[var(--lf-bg)] px-3 transition-colors open:border-[var(--lf-line-2)] hover:border-[var(--lf-line-2)]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 font-bold text-[var(--lf-text)]">
        <span>{title}</span>
        <span className="ml-auto text-lg text-[var(--lf-mute)] transition-transform group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="pb-3 leading-relaxed text-[var(--lf-dim)]">{children}</div>
    </details>
  );
}

/** The whole game in six pictures (ux-redesign-v2.md §6.2) — read this, skip the prose. */
function PictogramStrip() {
  const frames: [React.ComponentType<{ size?: number }>, string, string][] = [
    [AnchorIcon, 'var(--lf-focus)', 'Pick a zone'],
    [FogIcon, 'var(--lf-warn)', 'Bets hide: one last move'],
    [LockIcon, 'var(--lf-mute)', 'Bets lock'],
    [StormIcon, 'var(--lf-danger)', 'Storm hits one zone'],
    [XIcon, 'var(--lf-danger)', 'That zone loses'],
    [CrateIcon, 'var(--lf-win)', 'Its money pays the rest'],
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {frames.map(([Icon, color, label], i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-2 rounded-md border border-[var(--lf-line)] bg-[var(--lf-bg)] px-1 py-3 text-center"
        >
          <span style={{ color }}>
            <Icon size={26} />
          </span>
          <span className="text-[11px] font-semibold leading-tight text-[var(--lf-dim)]">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RulesModal() {
  const rulesOpen = useStore((s) => s.rulesOpen);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!rulesOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setRulesOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [rulesOpen, setRulesOpen]);

  if (!rulesOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) setRulesOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="lf-overlay max-h-[calc(100dvh-1.5rem)] w-full max-w-xl space-y-4 overflow-y-auto rounded-lg p-4 text-sm sm:max-h-[85vh] sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2
            id={titleId}
            className="text-[15px] font-black uppercase tracking-[0.16em] text-[var(--lf-text)]"
          >
            How Landfall Works
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setRulesOpen(false)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-[var(--lf-dim)] hover:text-[var(--lf-text)]"
            aria-label="Close how to play"
          >
            <XIcon size={18} />
          </button>
        </div>

        <PictogramStrip />

        <p className="text-center text-base font-semibold leading-relaxed text-[var(--lf-text)]">
          {ONE_LINER}
        </p>

        <Section title="The Round (~20 seconds)">
          Pick <b>1 Zone</b> for your whole bet, or <b>2 Zones</b> to split one bet across two zones
          at <b>70% / 30%</b>. While betting is open you can move and resize your bet freely. Each
          zone shows a shared <b>crowd meter</b> — Low, Medium, High, Full — instead of exact live
          totals. In the last seconds <b>bets are hidden</b>: you get <b>one last move</b>. Then the
          storm rolls in and hits <b>exactly one zone</b>.
        </Section>

        <Section title="Winning">
          If your zone is hit, you lose your bet. If you're safe (a 5-in-6 chance), you keep your
          bet <b>plus a share of the hit zone's money</b>, split among all safe players in
          proportion to bet size. The big wins come when a <b>crowded, full zone is hit</b> — the
          fewer people you share with and the bigger the pool, the bigger your payout.{' '}
          <b>Safe players receive 88% of the hit zone's pool</b>; the rest funds the game fee, the
          jackpot, and the multiplier reserve.
        </Section>

        <Section title="Storm Power — the multiplier">
          Every storm has a hidden <b>category</b>, revealed at landfall, that multiplies all
          survivors' salvage — and it is <b>never less than ×1</b>: a weak storm leaves your
          salvage untouched. <b>Cat 1 ×1</b> (common) · <b>Cat 2 ×1.25</b> (~1 in 13) ·{' '}
          <b>Cat 3 ×2</b> (~1 in 131) · <b>Cat 4 ×5</b> (~1 in 950) · <b>Cat 5 ×25</b> (~1 in
          19,000) · <b>Cat 6 ×100</b> (~1 in 210,000) ·{' '}
          <b className="text-[var(--lf-amber)]">PERFECT STORM ×500</b> (~1 in 1,000,000). The bonus
          above ×1 is paid from the <b>Storm Reserve</b>, funded by a share of every round's take,
          and a single round's total salvage is capped at a published multiple of that round's
          handle — if the cap ever applies, the result says so. It's all in the same provably-fair
          digest, and the multiplier only scales the salvage on top of your returned stake.
        </Section>

        <Section title="Weather Patterns">
          Every round has a simple weather pattern from the same provably-fair digest.{' '}
          <b>Heavy Fog</b> starts Blind Fog earlier, <b>Crosswind</b> delays public signal flags,
          and <b>High Swell</b> makes the storm presentation rougher. Weather never changes which
          harbor is hit and never changes payout math.
        </Section>

        <Section title="Jackpot — the bonus round">
          A fixed share of every round's take feeds the <b>jackpot</b> (it grows every round).
          Roughly one round in 25 is a <b>BONUS ROUND</b> — announced before betting. When the storm
          passes, <b>one safe player</b> — odds proportional to bet size — wins the <b>entire
          jackpot</b>. A small bet can win hundreds of times its size; a big bet has better odds.
          This is where the 500x stories come from.
        </Section>

        <Section title="Strategy">
          The storm never chases the money — every zone has exactly a 1-in-6 chance, always. But
          your <b>payout</b> depends on the crowd: standing where others aren't pays relatively
          more. Read the crowd meters, decide whether the crowd will flee or pile in while bets are
          hidden, choose <b>1 Zone</b> or <b>2 Zones</b>, and use <b>Join me</b>, <b>Avoid</b>, or{' '}
          <b>Staying</b> signals to bait or coordinate. Signals are public talk, not binding orders.
          Use <b>×2</b> to press your bet and <b>Bet Again</b> to repeat your last bet.
        </Section>

        <Section title="Wreck Wake Replay">
          After landfall, the replay card summarizes what mattered: fog moves, final orders, split
          fleets, signal pressure on the wrecked harbor, and the biggest safe crowd. It is a social
          readout only — settlement is already fixed by the public lock snapshot.
        </Section>

        <Section title="Provably Fair">
          Every outcome is fixed <b>before</b> betting opens, committed in a public hash chain.
          After each round the seed is revealed — hit <b>Verify</b> to have your own browser
          recompute the strike, weather, the surge trigger, the Golden Anchor pick, and your exact
          payout. Exact lock pools are hidden during play but published after lock for verification.
        </Section>

        <div className="rounded-md bg-[var(--lf-bg)] px-3 py-2 text-xs text-[var(--lf-dim)]">
          Educational build · virtual credits only · survivors receive 88% of the wrecked pool ·
          long-run return to players ≈ 98%. Play the crowd, not the storm.
        </div>
      </div>
    </div>
  );
}
