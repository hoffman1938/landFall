/**
 * Verdict card — rises from the bay after landfall (ux-redesign-v2.md §5.5).
 * SAFE tells the salvage story in amber; WRECKED is slate, short, and honest
 * ("1 in 6"), never punishing. The replay strip retells the round in one line.
 */
import { CrateIcon, ShieldCheckIcon, StormIcon, SurgeIcon } from './icons';
import { fmt, useStore } from '../store';
import { zoneName } from '../strings';

export function ResultBanner() {
  const phase = useStore((s) => s.phase);
  const lastLandfall = useStore((s) => s.lastLandfall);
  const myName = useStore((s) => s.name);
  const openVerify = useStore((s) => s.openVerify);
  const verifyGlow = useStore((s) => s.verifyGlow);

  const show = lastLandfall && (phase?.phase === 'RESOLVED' || phase?.phase === 'COOLDOWN');
  if (!show) return null;

  const r = lastLandfall.yourResult;
  const surge = lastLandfall.surge;
  const replay = lastLandfall.replay;
  const iWonSurge = surge?.winnerName != null && surge.winnerName === myName;
  const power = lastLandfall.stormPower;
  const powerMult = power ? power.mNum / power.mDen : 1;
  const isPerfectStorm = power?.label === 'PERFECT STORM';
  const struckZone = zoneName(lastLandfall.struckZone);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-2 px-3"
      style={{ bottom: 'calc(var(--lf-control-deck-height, 7.5rem) + 0.75rem)' }}
    >
      {/* Storm Power seal — Cat 3+ announces itself */}
      {power && powerMult >= 2 && (
        <div
          className={`lf-rise flex items-center gap-2 rounded-xl border px-5 py-2 text-lg font-black uppercase tracking-[0.04em] ${
            powerMult >= 25
              ? 'lf-gold lf-pulse border-[var(--lf-amber)]'
              : 'border-[var(--lf-amber)]/70 bg-[#1c1508]/90 text-[var(--lf-amber)]'
          }`}
        >
          <StormIcon size={20} />
          {isPerfectStorm ? `Perfect Storm — payouts ×${powerMult}` : `×${powerMult} multiplier round`}
        </div>
      )}

      {/* Liability cap disclosure — never silent (A3) */}
      {lastLandfall.powerCapped && (
        <div className="lf-rise rounded-xl border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/95 px-4 py-1.5 text-sm font-semibold text-[var(--lf-text)]">
          Maximum round payout reached — the multiplier was capped
        </div>
      )}

      {/* Golden Anchor — the rarest moment in the game */}
      {surge && surge.winnerName && (
        <div
          className={`lf-rise flex items-center gap-3 rounded-2xl border-2 border-[var(--lf-amber)] px-6 py-3 text-center font-extrabold ${
            iWonSurge ? 'lf-gold lf-payout' : 'bg-[#1c1508]/95 text-[var(--lf-amber)]'
          }`}
        >
          <SurgeIcon size={26} />
          <div>
            <div className="text-xl font-black uppercase leading-tight tracking-[0.14em]">
              Jackpot
            </div>
            <div className="text-sm leading-tight">
              {iWonSurge ? 'You win the whole jackpot' : `${surge.winnerName} wins the jackpot`}: +
              {fmt(surge.potMinor)}
            </div>
          </div>
        </div>
      )}
      {surge && !surge.winnerName && (
        <div className="lf-rise rounded-xl border border-[var(--lf-amber)]/60 bg-[#1c1508]/90 px-4 py-1.5 text-sm font-semibold text-[var(--lf-amber)]">
          No one was safe — the {fmt(surge.potMinor)} jackpot rolls over
        </div>
      )}

      {/* the personal verdict */}
      {r.outcome === 'SPECTATOR' ? (
        <div className="lf-rise lf-surface rounded-lg px-4 py-2 text-sm text-[var(--lf-dim)]">
          The storm hit {struckZone} — players there lost; everyone else shared its pool
        </div>
      ) : r.outcome === 'WRECKED' ? (
        /* §2.8 — a loss stays short, honest and calm: slate, never punished,
           never styled like a win. It gets weight, not heat. */
        <div className="lf-rise lf-surface rounded-2xl border-[var(--lf-line)] px-7 py-3 text-center">
          <div className="text-[2rem] font-black leading-none text-[var(--lf-text)]">
            −{fmt(-r.netMinor)}
          </div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--lf-dim)]">
            {struckZone} was hit — a 1-in-6 chance. Its pool went to the other players.
          </div>
        </div>
      ) : (
        <div
          className={`lf-rise rounded-2xl px-7 py-3 text-center ${
            r.netMinor >= 0
              ? 'lf-gold'
              : 'lf-surface border-[var(--lf-line)] text-[var(--lf-text)]'
          }`}
        >
          <div
            className={`flex items-center justify-center gap-2.5 text-[2rem] font-black leading-none ${
              r.netMinor >= 0 ? 'lf-payout' : ''
            }`}
          >
            <CrateIcon size={26} />
            {r.netMinor >= 0 ? '+' : '−'}
            {fmt(Math.abs(r.netMinor))}
          </div>
          <div className={`mt-1 text-[13px] font-semibold ${r.netMinor >= 0 ? 'text-black/75' : 'text-[var(--lf-dim)]'}`}>
            {r.outcome === 'SPLIT'
              ? `Half your bet was in ${struckZone}`
              : powerMult >= 2
                ? `You're safe — ${struckZone}'s pool, ×${powerMult} this round`
                : `You're safe — ${struckZone}'s pool was shared`}
          </div>
        </div>
      )}

      {/* replay strip: the round retold in one line + one-tap fairness */}
      <div className="lf-rise lf-surface pointer-events-auto flex max-w-[min(94vw,620px)] items-center gap-3 rounded-lg px-4 py-2 text-xs text-[var(--lf-dim)]">
        <span className="font-semibold text-[var(--lf-text)]">{replay.headline}</span>
        <span className="hidden sm:inline">
          {replay.fogMoves} last moves · hit pool {fmt(replay.struckPoolMinor)}
        </span>
        {/* E3 first-loss trust moment: the stamp glows once (focus cyan, never
            amber) on the first loss ≥ 10× min stake — fairness offered exactly
            when doubt is felt (ux-redesign-v2.md §6.3). */}
        <button
          onClick={() => openVerify(lastLandfall.roundId)}
          className={`ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-[var(--lf-line)] px-2 py-1 font-semibold hover:border-[var(--lf-dim)] hover:text-[var(--lf-text)] ${
            verifyGlow ? 'lf-verify-glow' : ''
          }`}
          title="Verify this round cryptographically"
        >
          <ShieldCheckIcon size={14} />
          Verify
        </button>
      </div>
    </div>
  );
}
