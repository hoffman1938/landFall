/**
 * The verdict — what the round did to your balance, stated once, plainly.
 *
 * The whole component is built around one rule about losing: a loss is
 * reported, never staged. It gets the same card, the same size and the same
 * settle animation as a win; the figure stays white rather than red, and the
 * only red on it is the hairline that says which zone the storm took. Red here
 * is the storm's colour, not a verdict on the player.
 *
 * A win is green and says the amount. It does not flash, scale up, or throw
 * anything across the screen — the money already moved, and a product that
 * celebrates a payout harder than it reports a loss is teaching the wrong
 * lesson about what just happened.
 *
 * The replay strip retells the round in one line and keeps one-tap fairness
 * within reach of the moment doubt actually occurs.
 */
import { ShieldCheckIcon, StormIcon, SurgeIcon } from './icons';
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
      className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-1.5 px-3"
      style={{ bottom: 'calc(var(--lf-control-deck-height, 7.5rem) + 0.75rem)' }}
    >
      {/* Storm Power — a multiplier is a fact about the round, so it is a chip */}
      {power && powerMult >= 2 && (
        <div
          className={`lf-rise flex items-center gap-2 rounded-md border px-3 py-1 text-[12px] font-black uppercase tracking-[0.12em] ${
            powerMult >= 25
              ? 'border-[var(--lf-warn)] bg-[var(--lf-warn)] text-black'
              : 'border-[var(--lf-warn)]/60 text-[var(--lf-warn)]'
          }`}
        >
          <StormIcon size={14} />
          {isPerfectStorm ? `Perfect storm — payouts ×${powerMult}` : `×${powerMult} round`}
        </div>
      )}

      {/* Liability cap disclosure — never silent (A3) */}
      {lastLandfall.powerCapped && (
        <div className="lf-rise lf-surface rounded-md px-3 py-1 text-[12px] font-semibold text-[var(--lf-dim)]">
          Maximum round payout reached — the multiplier was capped
        </div>
      )}

      {/* Jackpot — the rarest moment in the game */}
      {surge && surge.winnerName && (
        <div
          className={`lf-rise flex items-center gap-3 rounded-md border px-4 py-2 ${
            iWonSurge
              ? 'border-[var(--lf-warn)] bg-[var(--lf-warn)] text-black'
              : 'border-[var(--lf-warn)]/60 text-[var(--lf-warn)]'
          }`}
        >
          <SurgeIcon size={20} />
          <div>
            <div className="text-[13px] font-black uppercase leading-tight tracking-[0.16em]">
              Jackpot
            </div>
            <div className="text-[12px] font-semibold leading-tight">
              {iWonSurge ? 'You win the whole jackpot' : `${surge.winnerName} wins the jackpot`}: +
              {fmt(surge.potMinor)}
            </div>
          </div>
        </div>
      )}
      {surge && !surge.winnerName && (
        <div className="lf-rise rounded-md border border-[var(--lf-warn)]/50 px-3 py-1 text-[12px] font-semibold text-[var(--lf-warn)]">
          No one was safe — the {fmt(surge.potMinor)} jackpot rolls over
        </div>
      )}

      {/* the personal verdict */}
      {r.outcome === 'SPECTATOR' ? (
        <div className="lf-rise lf-surface rounded-md px-4 py-2 text-[12px] font-semibold text-[var(--lf-dim)]">
          The storm hit {struckZone} — players there lost; everyone else shared its pool
        </div>
      ) : r.outcome === 'WRECKED' ? (
        /*
         * §2.8 — a loss is short, exact and calm. White figure on the standard
         * card, one red hairline on the leading edge for the storm, and the
         * odds restated so the player leaves with the true frame: this was a
         * 1-in-6 that landed, not a thing that was done to them.
         */
        <div className="lf-rise lf-surface rounded-md border-l-2 !border-l-[var(--lf-accent)] px-6 py-2.5 text-center">
          <div className="lf-display lf-settle text-[30px] text-[var(--lf-text)]">
            −{fmt(-r.netMinor)}
          </div>
          <div className="mt-1.5 text-[12px] font-semibold text-[var(--lf-dim)]">
            {struckZone} was hit — a 1-in-6 chance. Its pool went to the other players.
          </div>
        </div>
      ) : (
        <div
          className={`lf-rise rounded-md border px-6 py-2.5 text-center ${
            r.netMinor >= 0
              ? 'border-[var(--lf-win)]/55 bg-[var(--lf-win-soft)]'
              : 'lf-surface'
          }`}
        >
          <div
            className={`lf-display lf-settle text-[30px] ${
              r.netMinor >= 0 ? 'text-[var(--lf-win)]' : 'text-[var(--lf-text)]'
            }`}
          >
            {r.netMinor >= 0 ? '+' : '−'}
            {fmt(Math.abs(r.netMinor))}
          </div>
          <div className="mt-1.5 text-[12px] font-semibold text-[var(--lf-dim)]">
            {r.outcome === 'SPLIT'
              ? `Half your bet was in ${struckZone}`
              : powerMult >= 2
                ? `You're safe — ${struckZone}'s pool, ×${powerMult} this round`
                : `You're safe — ${struckZone}'s pool was shared`}
          </div>
        </div>
      )}

      {/* replay strip: the round retold in one line + one-tap fairness */}
      <div className="lf-rise lf-surface pointer-events-auto flex max-w-[min(94vw,620px)] items-center gap-3 rounded-md px-3 py-1.5 text-[11px] text-[var(--lf-mute)]">
        <span className="font-semibold text-[var(--lf-dim)]">{replay.headline}</span>
        <span className="hidden sm:inline">
          {replay.fogMoves} last moves · hit pool {fmt(replay.struckPoolMinor)}
        </span>
        {/* E3 first-loss trust moment: the stamp draws attention once on the
            first loss ≥ 10× min stake — fairness offered exactly when doubt is
            felt (ux-redesign-v2.md §6.3). White, never red. */}
        <button
          onClick={() => openVerify(lastLandfall.roundId)}
          className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--lf-line)] px-2 py-1 font-bold text-[var(--lf-dim)] transition-colors hover:border-[var(--lf-line-2)] hover:text-[var(--lf-text)] ${
            verifyGlow ? 'lf-verify-glow' : ''
          }`}
          title="Verify this round cryptographically"
        >
          <ShieldCheckIcon size={13} />
          Verify
        </button>
      </div>
    </div>
  );
}
