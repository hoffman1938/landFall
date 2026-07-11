import { useEffect, useId, useRef } from 'react';
import { useStore } from '../store';
import { AnchorIcon, CrateIcon, FogIcon, LockIcon, StormIcon, XIcon } from './icons';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-[var(--lf-line)] bg-[var(--lf-bg)]/55 px-3">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 font-bold text-[var(--lf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]">
        <span>{title}</span>
        <span className="ml-auto text-lg text-[var(--lf-dim)] transition-transform group-open:rotate-45" aria-hidden="true">
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
    [AnchorIcon, 'var(--lf-focus)', 'Anchor in a cove'],
    [FogIcon, '#aebccf', 'Fog: one hidden move'],
    [LockIcon, '#51678a', 'Boats lock'],
    [StormIcon, 'var(--lf-danger)', 'Storm picks one cove'],
    [XIcon, 'var(--lf-danger)', 'That cove loses'],
    [CrateIcon, 'var(--lf-amber)', 'Its cargo pays the rest'],
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {frames.map(([Icon, color, label], i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-1.5 rounded-xl bg-[var(--lf-bg)] px-1 py-3 text-center"
        >
          <span style={{ color }}>
            <Icon size={26} />
          </span>
          <span className="text-[11px] font-semibold leading-tight text-[var(--lf-text)]">
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) setRulesOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-[var(--lf-line)] bg-[var(--lf-panel)] p-4 text-sm sm:max-h-[85vh] sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold">
            How Landfall Works
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setRulesOpen(false)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--lf-dim)] hover:text-[var(--lf-text)]"
            aria-label="Close how to play"
          >
            <XIcon size={18} />
          </button>
        </div>

        <PictogramStrip />

        <p className="text-center text-base font-semibold leading-relaxed text-[var(--lf-text)]">
          Choose a cove. One gets hit. Its cargo pays the rest.
        </p>

        <Section title="The Round (~20 seconds)">
          Choose <b>Focus</b> to place your full stake in one harbor, or <b>Split</b> to divide one
          stake across two harbors at <b>70% / 30%</b>. While the anchor window is open you can move
          your fleet and resize your stake. The board shows shared <b>Tide Reports</b> — light,
          medium, heavy, packed — instead of exact live pools. In the last seconds <b>Blind Fog</b>{' '}
          freezes the public report; you get <b>one final order</b>. Then the storm rolls in and
          wrecks <b>exactly one harbor</b>.
        </Section>

        <Section title="Winning">
          If your harbor is wrecked, you lose your stake. If you survive (5 out of 6 chance), you
          keep your stake <b>plus a share of the wrecked harbor's money</b>, split among all
          survivors in proportion to stake size. The big wins come when a{' '}
          <b>crowded, heavy harbor takes the storm</b> — the fewer people you share with and the
          bigger the wreck, the bigger your salvage. <b>Survivors receive 88% of the wrecked
          pool</b>; the rest funds the house take, the Storm Surge pot, and the Storm Reserve.
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

        <Section title="Storm Surge — the jackpot">
          A fixed share of every round's take feeds the <b>Storm Surge pot</b> (shown at the top,
          always growing). Roughly one round in 25 is a <b>SURGE ROUND</b> — announced before anchoring.
          When the storm passes, the <b>Golden Anchor</b> picks <b>one surviving player</b> — odds
          proportional to stake — who wins the <b>entire pot</b>. A small stake can win hundreds of
          times its size; a big stake hunts the pot with better odds. This is where the 500x stories
          come from.
        </Section>

        <Section title="Strategy">
          The storm never chases the money — every harbor has exactly a 1-in-6 chance, always. But
          your <b>payout</b> depends on the crowd: standing where others aren't pays relatively
          more. Read the Tide Reports, decide whether the crowd will flee or pile in during fog,
          decide whether to Focus or Split, and use <b>Rally</b>, <b>Flee</b>, or <b>Hold</b>{' '}
          signals to bait or coordinate. Signals are public talk, not binding orders. Use <b>×2</b>{' '}
          to press your bet and <b>↻ Rebet</b> to repeat your last fleet order.
        </Section>

        <Section title="Wreck Wake Replay">
          After landfall, the replay card summarizes what mattered: fog moves, final orders, split
          fleets, signal pressure on the wrecked harbor, and the biggest safe crowd. It is a social
          readout only — settlement is already fixed by the public lock snapshot.
        </Section>

        <Section title="Provably Fair">
          Every outcome is fixed <b>before</b> anchoring opens, committed in a public hash chain.
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
