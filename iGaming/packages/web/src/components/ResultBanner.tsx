/**
 * Verdict card — rises from the bay after landfall (ux-redesign-v2.md §5.5).
 * SAFE tells the salvage story in amber; WRECKED is slate, short, and honest
 * ("1 in 6"), never punishing. The replay strip retells the round in one line.
 */
import { CrateIcon, ShieldCheckIcon, StormIcon, SurgeIcon } from './icons';
import { fmt, useStore } from '../store';

export function ResultBanner() {
  const phase = useStore((s) => s.phase);
  const lastLandfall = useStore((s) => s.lastLandfall);
  const myName = useStore((s) => s.name);
  const openVerify = useStore((s) => s.openVerify);

  const show = lastLandfall && (phase?.phase === 'RESOLVED' || phase?.phase === 'COOLDOWN');
  if (!show) return null;

  const r = lastLandfall.yourResult;
  const surge = lastLandfall.surge;
  const replay = lastLandfall.replay;
  const iWonSurge = surge?.winnerName != null && surge.winnerName === myName;
  const power = lastLandfall.stormPower;
  const powerMult = power ? power.mNum / power.mDen : 1;
  const cove = lastLandfall.struckZone + 1;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-2 px-3"
      style={{ bottom: 'calc(var(--lf-control-deck-height, 7.5rem) + 0.75rem)' }}
    >
      {/* Storm Power seal — Cat 3+ announces itself */}
      {power && powerMult >= 2 && (
        <div
          className={`lf-rise flex items-center gap-2 rounded-xl border px-4 py-1.5 font-extrabold ${
            powerMult >= 25
              ? 'lf-pulse border-[var(--lf-amber)] bg-[var(--lf-amber)] text-black'
              : 'border-[var(--lf-amber)]/70 bg-[#1c1508]/90 text-[var(--lf-amber)]'
          }`}
        >
          <StormIcon size={18} />
          {power.label} — salvage ×{powerMult}
        </div>
      )}

      {/* Liability cap disclosure — never silent (A3) */}
      {lastLandfall.powerCapped && (
        <div className="lf-rise rounded-xl border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/95 px-4 py-1.5 text-sm font-semibold text-[var(--lf-text)]">
          Storm Power payout reached the round cap — salvage was clamped
        </div>
      )}

      {/* Golden Anchor — the rarest moment in the game */}
      {surge && surge.winnerName && (
        <div
          className={`lf-rise flex items-center gap-2 rounded-2xl border-2 border-[var(--lf-amber)] px-5 py-2.5 text-center font-extrabold ${
            iWonSurge ? 'bg-[var(--lf-amber)] text-black' : 'bg-[#1c1508]/95 text-[var(--lf-amber)]'
          }`}
        >
          <SurgeIcon size={22} />
          <div>
            <div className="text-base leading-tight">GOLDEN ANCHOR</div>
            <div className="text-sm leading-tight">
              {iWonSurge ? 'You take the whole pot' : `${surge.winnerName} takes the pot`}: +
              {fmt(surge.potMinor)}
            </div>
          </div>
        </div>
      )}
      {surge && !surge.winnerName && (
        <div className="lf-rise rounded-xl border border-[var(--lf-amber)]/60 bg-[#1c1508]/90 px-4 py-1.5 text-sm font-semibold text-[var(--lf-amber)]">
          Nobody survived to claim the pot — {fmt(surge.potMinor)} rolls over
        </div>
      )}

      {/* the personal verdict */}
      {r.outcome === 'SPECTATOR' ? (
        <div className="lf-rise lf-surface rounded-lg px-4 py-2 text-sm text-[var(--lf-dim)]">
          The storm chose Cove {cove}
        </div>
      ) : r.outcome === 'WRECKED' ? (
        <div className="lf-rise rounded-xl border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/95 px-6 py-2.5 text-center">
          <div className="text-2xl font-extrabold text-[var(--lf-text)]">−{fmt(-r.netMinor)}</div>
          <div className="mt-0.5 text-[13px] font-semibold text-[var(--lf-dim)]">
            The storm chose your cove — 1 chance in 6
          </div>
        </div>
      ) : (
        <div
          className={`lf-rise rounded-xl px-6 py-2.5 text-center ${
            r.netMinor >= 0
              ? 'bg-[var(--lf-amber)] text-black'
              : 'border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/95 text-[var(--lf-text)]'
          }`}
        >
          <div className="flex items-center justify-center gap-2 text-2xl font-extrabold">
            <CrateIcon size={22} />
            {r.netMinor >= 0 ? '+' : '−'}
            {fmt(Math.abs(r.netMinor))}
          </div>
          <div className={`mt-0.5 text-[13px] font-semibold ${r.netMinor >= 0 ? 'text-black/70' : 'text-[var(--lf-dim)]'}`}>
            {r.outcome === 'SPLIT'
              ? `Half your fleet was in Cove ${cove}`
              : `Salvage from Cove ${cove}'s cargo`}
          </div>
        </div>
      )}

      {/* replay strip: the round retold in one line + one-tap fairness */}
      <div className="lf-rise lf-surface pointer-events-auto flex max-w-[min(94vw,620px)] items-center gap-3 rounded-lg px-4 py-2 text-xs text-[var(--lf-dim)]">
        <span className="font-semibold text-[var(--lf-text)]">{replay.headline}</span>
        <span className="hidden sm:inline">
          {replay.fogMoves} fog moves · wreck {fmt(replay.struckPoolMinor)}
        </span>
        <button
          onClick={() => openVerify(lastLandfall.roundId)}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-[var(--lf-line)] px-2 py-1 font-semibold hover:border-[var(--lf-dim)] hover:text-[var(--lf-text)]"
          title="Verify this round cryptographically"
        >
          <ShieldCheckIcon size={14} />
          Verify
        </button>
      </div>
    </div>
  );
}
