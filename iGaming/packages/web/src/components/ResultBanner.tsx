import { fmt, useStore } from '../store';

export function ResultBanner() {
  const phase = useStore((s) => s.phase);
  const lastLandfall = useStore((s) => s.lastLandfall);
  const myName = useStore((s) => s.name);

  const show = lastLandfall && (phase?.phase === 'RESOLVED' || phase?.phase === 'COOLDOWN');
  if (!show) return null;

  const r = lastLandfall.yourResult;
  const surge = lastLandfall.surge;
  const replay = lastLandfall.replay;
  const iWonSurge = surge?.winnerName != null && surge.winnerName === myName;

  const power = lastLandfall.stormPower;
  const powerMult = power ? power.mNum / power.mDen : 1;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex flex-col items-center gap-2">
      {/* Storm Power category — the multiplier reveal (Cat 3+ gets loud). */}
      {power && powerMult >= 2 && (
        <div
          className={`rounded-lg border px-5 py-2 text-center font-extrabold ${
            powerMult >= 25
              ? 'lf-pulse border-[var(--lf-amber)] bg-[var(--lf-amber)] text-black'
              : 'border-[var(--lf-amber)]/70 bg-[#1c1508] text-[var(--lf-amber)]'
          }`}
        >
          ⛈ {power.label} — salvage ×{powerMult}
        </div>
      )}
      {/* Golden Anchor announcement — the marquee moment. */}
      {surge && surge.winnerName && (
        <div
          className={`rounded-xl border-2 border-[var(--lf-amber)] px-6 py-3 text-center font-extrabold ${
            iWonSurge ? 'bg-[var(--lf-amber)] text-black' : 'bg-[#1c1508] text-[var(--lf-amber)]'
          }`}
        >
          <div className="text-lg">⚡⚓ GOLDEN ANCHOR</div>
          <div className="text-base">
            {iWonSurge ? 'YOU WIN' : surge.winnerName + ' wins'} the pot: +{fmt(surge.potMinor)}
            {surge.winnerStakeMinor ? (
              <span className="ml-1 text-sm opacity-80">
                ({Math.round(surge.potMinor / Math.max(1, surge.winnerStakeMinor))}x the stake)
              </span>
            ) : null}
          </div>
        </div>
      )}
      {surge && !surge.winnerName && (
        <div className="rounded-lg border border-[var(--lf-amber)]/60 bg-[#1c1508] px-4 py-2 text-sm font-semibold text-[var(--lf-amber)]">
          ⚡ No surviving skipper — the pot of {fmt(surge.potMinor)} rolls over
        </div>
      )}

      {r.outcome === 'SPECTATOR' ? (
        <div className="rounded-lg border border-[var(--lf-line)] bg-[var(--lf-panel)]/95 px-4 py-2 text-sm text-[var(--lf-dim)]">
          Harbor {lastLandfall.struckZone + 1} took the storm
        </div>
      ) : (
        <div
          className={`rounded-lg px-5 py-2.5 text-base font-bold ${
            r.outcome === 'SAFE'
              ? 'bg-[var(--lf-amber)] text-black'
              : r.outcome === 'SPLIT'
                ? r.netMinor >= 0
                  ? 'border border-[var(--lf-amber)] bg-[#1c1508] text-[var(--lf-amber)]'
                  : 'border border-[var(--lf-danger)] bg-[#240c13] text-[var(--lf-danger)]'
                : 'bg-[var(--lf-danger)]/90 text-white'
          }`}
        >
          {r.outcome === 'SAFE'
            ? `SAFE  +${fmt(r.netMinor)}`
            : r.outcome === 'SPLIT'
              ? `SPLIT  ${r.netMinor >= 0 ? '+' : '-'}${fmt(Math.abs(r.netMinor))}`
              : `WRECKED  -${fmt(-r.netMinor)}`}
        </div>
      )}

      <div className="max-w-[min(92vw,560px)] rounded-lg border border-[var(--lf-line)] bg-[var(--lf-panel)]/95 px-4 py-2 text-center text-xs text-[var(--lf-dim)] shadow-2xl">
        <div className="font-semibold text-[var(--lf-text)]">{replay.headline}</div>
        <div className="mt-1">
          {replay.finalOrders} final orders · {replay.splitFleets} split fleets · struck pool{' '}
          {fmt(replay.struckPoolMinor)}
          {replay.mostCrowdedSafeZone !== null
            ? ` · safest crowd H${replay.mostCrowdedSafeZone + 1} ${fmt(
                replay.mostCrowdedSafePoolMinor,
              )}`
            : ''}
        </div>
        <div className="mt-0.5">
          Flags: Rally {replay.signalSummary.rally} · Flee {replay.signalSummary.flee} · Hold{' '}
          {replay.signalSummary.hold} · on wreck {replay.signalSummary.onStruck}
        </div>
      </div>
    </div>
  );
}
