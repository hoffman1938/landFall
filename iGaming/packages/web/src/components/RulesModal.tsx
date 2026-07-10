import { useStore } from '../store';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 font-bold text-[var(--lf-text)]">{title}</h3>
      <div className="text-[var(--lf-dim)]">{children}</div>
    </div>
  );
}

export function RulesModal() {
  const rulesOpen = useStore((s) => s.rulesOpen);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  if (!rulesOpen) return null;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
      onClick={() => setRulesOpen(false)}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-[var(--lf-line)] bg-[var(--lf-panel)] p-6 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            <span className="text-[var(--lf-amber)]">⛯</span> How to Play LANDFALL
          </h2>
          <button onClick={() => setRulesOpen(false)} className="text-[var(--lf-dim)]">
            ✕
          </button>
        </div>

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
          bigger the wreck, the bigger your salvage. The house takes 6% of the wrecked pool only.
        </Section>

        <Section title="⛈ Storm Power — the multiplier">
          Every storm has a hidden <b>category</b>, revealed at landfall, that multiplies all
          survivors' salvage: <b>Cat 1 ×0.5</b> (common) · <b>Cat 2 ×1</b> · <b>Cat 3 ×2</b> (~1 in
          10) · <b>Cat 4 ×5</b> (~1 in 28) · <b>Cat 5 ×25</b> (~1 in 330) · <b>Cat 6 ×100</b> (~1 in
          4,000) · <b className="text-[var(--lf-amber)]">PERFECT STORM ×500</b> (~1 in 50,000).
          Surviving a Perfect Storm on a heavy wreck turns even a 1-credit anchor into hundreds —
          and it's all in the same provably-fair digest. A surviving win never becomes a loss: the
          multiplier only scales the salvage on top of your returned stake.
        </Section>

        <Section title="Weather Patterns">
          Every round has a simple weather pattern from the same provably-fair digest.{' '}
          <b>Heavy Fog</b> starts Blind Fog earlier, <b>Crosswind</b> delays public signal flags,
          and <b>High Swell</b> makes the storm presentation rougher. Weather never changes which
          harbor is hit and never changes payout math.
        </Section>

        <Section title="⚡ Storm Surge — the jackpot">
          Half of the house's take feeds the <b>Storm Surge pot</b> (shown at the top, always
          growing). Roughly one round in 25 is a <b>SURGE ROUND</b> — announced before anchoring.
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
          After each round the seed is revealed — hit <b>🛡 Verify</b> to have your own browser
          recompute the strike, weather, the surge trigger, the Golden Anchor pick, and your exact
          payout. Exact lock pools are hidden during play but published after lock for verification.
        </Section>

        <div className="rounded-md bg-[var(--lf-bg)] px-3 py-2 text-xs text-[var(--lf-dim)]">
          Educational build · virtual credits only · long-run expected return ≈ 99.5% (1% rake, half
          returned via the Surge pot). Play the crowd, not the storm.
        </div>
      </div>
    </div>
  );
}
