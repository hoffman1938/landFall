/**
 * ROUND RESULT — the answer, then the receipt, then the way out.
 *
 * Reading order is the whole design, and it is fixed:
 *
 *      1  HARBOR 4              which harbor was hit
 *      2  −2.00 / +1.35          what it did to you
 *      3  ROUND #18421 · VERIFIED ✓   the receipt
 *      4  VERIFY   NEXT ROUND    the two things you can do
 *
 * A loss and a win use the SAME card, the same size and the same motion. The
 * figure stays white on a loss and the only red is the hairline naming the
 * struck harbor, because red here is the storm's colour and not a verdict on
 * the player. That rule predates this pass; this card inherits it deliberately.
 *
 * The receipt line is new. "VERIFIED ✓" is a claim the player can check in one
 * tap and does not have to understand: the technical detail lives behind the
 * VERIFY button, where someone who wants a seed chain will go looking for one.
 */
import { ShieldCheckIcon, StormIcon, SurgeIcon } from './icons';
import { fmt, useStore } from '../store';
import { zoneName } from '../strings';
import { useSurfaces } from '../uiMode';
import { useShortViewport } from '../useShortViewport';
import type { RoundState } from '../roundMachine';

export function RoundResultCard({ state }: { state: RoundState }) {
  const lastLandfall = useStore((s) => s.lastLandfall);
  const myName = useStore((s) => s.name);
  const openVerify = useStore((s) => s.openVerify);
  const verifyGlow = useStore((s) => s.verifyGlow);
  const phaseEndsAt = useStore((s) => s.phase?.endsAt ?? 0);
  const surfaces = useSurfaces();
  const shortBoard = useShortViewport();

  if (state !== 'RESULT' && state !== 'VERIFICATION' && state !== 'RESET') return null;
  if (!lastLandfall) return null;

  const r = lastLandfall.yourResult;
  const struck = zoneName(lastLandfall.struckZone);
  const surge = lastLandfall.surge;
  const iWonSurge = surge?.winnerName != null && surge.winnerName === myName;
  const power = lastLandfall.stormPower;
  const powerMult = power ? power.mNum / power.mDen : 1;
  const tier = lastLandfall.eventTier;
  const won = r.outcome !== 'WRECKED' && r.netMinor >= 0;
  const played = r.outcome !== 'SPECTATOR';
  /*
   * The advanced board used to run a SECOND result surface (`ResultBanner`)
   * pinned to the same offset as this card — two verdicts in the same pixels
   * on every settled round. That component is gone; the two details it had
   * that this card lacked live here, behind the advanced flag, so there is one
   * result UI with one layout and one set of rules about how a loss is shown.
   */
  const detailed = surfaces.showHarborDetail && !shortBoard;
  const replay = lastLandfall.replay;

  return (
    <section
      aria-label={`Round result. ${struck} was hit.`}
      /*
       * `shrink-0` matters: the stage column is a flex column, so without it a
       * card 4px taller than the space available is silently COMPRESSED and
       * then clips its own bottom row — which is how the VERIFY button lost its
       * last four pixels on a 740x360 board. Refusing to shrink makes a card
       * that does not fit visibly not fit, which is a bug that can be found.
       */
      className="lf-appear pointer-events-none flex w-[min(94vw,27rem)] shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--lf-line-2)] bg-[var(--lf-surface)]"
    >
      {/* 1 — which harbor. The largest thing on the card, always. */}
      <div
        className={`border-l-2 border-l-[var(--lf-accent)] ${
          shortBoard ? 'px-4 py-1.5' : 'px-5 pb-2.5 pt-3 sm:pb-3 sm:pt-3.5'
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="lf-label">Round result</span>
          {tier && tier.id !== 'CALM' && (
            <span
              className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] ${
                tier.id === 'TEMPEST' ? 'text-[var(--lf-warn)]' : 'text-[var(--lf-dim)]'
              }`}
            >
              <StormIcon size={12} />
              {tier.label}
            </span>
          )}
        </div>
        <div
          className={`lf-display lf-settle mt-1 leading-none text-[var(--lf-accent)] ${
            shortBoard ? 'text-[1.35rem]' : 'text-[clamp(1.9rem,6vmin,2.6rem)]'
          }`}
        >
          {struck.toUpperCase()}
        </div>
        {/*
          Dropped on a phone. The card is anchored above the deck, so every row
          of prose pushes it further up the board and further over the harbor it
          is naming — and on a 375px screen the giant harbor name plus the red
          strike frame behind the card already say this sentence.
        */}
        {/* Dropped on a phone AND on any short board: the card is anchored
            above the deck, so every row of prose pushes it further over the
            harbors it is naming. On a 360px-tall board it covered the top bar
            and all six of them. The giant harbor name plus the red strike frame
            already say this sentence. */}
        {!shortBoard && (
          <div className="mt-1.5 hidden text-[13px] text-[var(--lf-dim)] sm:block">
            Hit by the storm. The other five harbors shared its pot.
          </div>
        )}
      </div>

      {/* 2 — what it did to you. */}
      <div
        className={`border-t border-[var(--lf-line)] ${
          shortBoard ? 'px-4 py-1.5' : 'px-5 py-2.5 sm:py-3'
        }`}
      >
        {!played ? (
          <div className="text-[14px] font-medium text-[var(--lf-dim)]">
            You sat this round out.
          </div>
        ) : (
          <div className="flex items-baseline gap-3">
            <span
              className={`lf-display lf-settle leading-none ${
                shortBoard ? 'text-[1.2rem]' : 'text-[clamp(1.6rem,5vmin,2.1rem)]'
              } ${won ? 'text-[var(--lf-win)]' : 'text-[var(--lf-text)]'}`}
            >
              {r.netMinor >= 0 ? '+' : '−'}
              {fmt(Math.abs(r.netMinor))}
            </span>
            <span className="text-[13px] font-semibold text-[var(--lf-dim)]">
              {r.outcome === 'WRECKED'
                ? 'Your harbor was hit — a 1-in-6 chance.'
                : r.outcome === 'SPLIT'
                  ? 'Part of your bet was in the hit harbor.'
                  : powerMult > 1
                    ? `Safe — your bank share was boosted ×${powerMult}.`
                    : 'Safe — you took a share of the pot.'}
            </span>
          </div>
        )}

        {/* The jackpot is the one thing allowed to interrupt this order, because
            it is the rarest event in the game and it is genuinely news. */}
        {surge?.winnerName && (
          <div
            className={`mt-2.5 flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-semibold ${
              iWonSurge
                ? 'border-[var(--lf-warn)] bg-[var(--lf-warn)] text-black'
                : 'border-[var(--lf-warn)]/60 text-[var(--lf-warn)]'
            }`}
          >
            <SurgeIcon size={15} />
            {iWonSurge
              ? `You won the whole jackpot: +${fmt(surge.potMinor)}`
              : `${surge.winnerName} won the jackpot: +${fmt(surge.potMinor)}`}
          </div>
        )}
        {lastLandfall.powerCapped && (
          <div className="mt-2 text-[12px] text-[var(--lf-mute)]">
            Maximum round payout reached — the multiplier was capped.
          </div>
        )}

        {/* Advanced only: the multiplier this round paid at, and the round in
            one line. Both were the old banner's; neither is a beginner's
            question at the moment a result lands. */}
        {detailed && powerMult > 1 && (
          <div
            className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${
              powerMult >= 25
                ? 'border-[var(--lf-warn)] bg-[var(--lf-warn)] text-black'
                : 'border-[var(--lf-warn)]/60 text-[var(--lf-warn)]'
            }`}
          >
            <StormIcon size={12} />
            {power?.label === 'PERFECT STORM'
              ? `Perfect storm — bank share ×${powerMult}`
              : `Bank share ×${powerMult}`}
          </div>
        )}
        {detailed && replay && (
          <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-[var(--lf-mute)]">
            {replay.headline}
          </p>
        )}
      </div>

      {/* 3 — the receipt, and 4 — the two things you can do. */}
      <div
        className={`flex items-center gap-2 border-t border-[var(--lf-line)] bg-[var(--lf-bg-2)] px-3 ${
          shortBoard ? 'py-1' : 'py-2'
        }`}
      >
        <span className="lf-label-soft shrink-0">#{lastLandfall.roundId}</span>
        <span className="flex shrink-0 items-center gap-1 text-[12px] font-bold text-[var(--lf-win)]">
          <ShieldCheckIcon size={13} />
          Verifiable
        </span>
        <button
          type="button"
          onClick={() => openVerify(lastLandfall.roundId)}
          className={`pointer-events-auto ml-auto shrink-0 rounded-md border border-[var(--lf-line)] px-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--lf-dim)] transition-colors hover:border-[var(--lf-line-2)] hover:text-[var(--lf-text)] ${
            shortBoard ? 'min-h-[40px]' : 'min-h-[44px]'
          } ${verifyGlow ? 'lf-verify-glow' : ''}`}
        >
          Verify
        </button>
        <NextRoundPill endsAt={phaseEndsAt} state={state} short={shortBoard} />
      </div>
    </section>
  );
}

/**
 * NEXT ROUND is a countdown, not a button.
 *
 * The round loop is a fixed table heartbeat that every player at the table
 * shares — there is no "next round" one player can start early, and a button
 * that looks pressable and is not is exactly the trap the deck's state machine
 * was written to eliminate. So it reports instead: the number of seconds until
 * harbors are live again.
 */
function NextRoundPill({
  endsAt,
  state,
  short,
}: {
  endsAt: number;
  state: RoundState;
  short: boolean;
}) {
  const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  return (
    <span
      role="timer"
      aria-label={`Next round in about ${seconds} seconds`}
      className={`flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--lf-surface-2)] px-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--lf-text)] ${
        short ? 'min-h-[40px]' : 'min-h-[44px]'
      }`}
    >
      Next
      <span className="lf-num text-[15px] tabular-nums text-[var(--lf-dim)]">
        {state === 'RESET' ? seconds : '·'}
      </span>
    </span>
  );
}
