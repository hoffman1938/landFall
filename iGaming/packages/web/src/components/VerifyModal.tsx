/**
 * Provably-fair verification — recomputes everything in the browser using the
 * same @landfall/core functions the server runs
 * (docs/04-architecture/rng-provably-fair-spec.md §6).
 */
import { useEffect, useId, useRef, useState } from 'react';
import {
  verifyRound,
  type EnvironmentSpec,
  type EventTierSpec,
  type RoundVerificationResult,
  type StakeEntry,
  type WeatherPattern,
} from '@landfall/core';
import { useStore } from '../store';
import { XIcon } from './icons';

interface RoundRecord {
  roundId: number;
  chainIndex: number;
  prevChainValue: string;
  seedHex: string;
  struckZone: number;
  lockSnapshot: StakeEntry[];
  rake: number;
  maxPayoutMultiple: number;
  powerCapped: boolean;
  zoneCount: number;
  surgeProb: number;
  surge: { winnerStakeId: string | null; amountMinor: number; flatOdds?: boolean } | null;
  stormPower: { label: string; mNum: number; mDen: number };
  weather: WeatherPattern;
  /** v4 presentation domains, present on rounds settled since the redesign. */
  eventTier?: EventTierSpec;
  environment?: EnvironmentSpec;
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={ok ? 'text-emerald-400' : 'text-[var(--lf-danger)]'}>
      {ok ? '✓' : '✗'} {label}
    </div>
  );
}

export function VerifyModal() {
  const roundId = useStore((s) => s.verifyRoundId);
  const openVerify = useStore((s) => s.openVerify);
  const chainCommitment = useStore((s) => s.chainCommitment);
  const receipts = useStore((s) => s.receipts);
  const [rec, setRec] = useState<RoundRecord | null>(null);
  const [result, setResult] = useState<RoundVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (roundId === null) return;
    const controller = new AbortController();
    setRec(null);
    setResult(null);
    setError(null);
    fetch(`/api/round/${roundId}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Verification record unavailable (${response.status})`);
        return response.json();
      })
      .then((data: RoundRecord | { error: string }) => {
        if ('error' in data) throw new Error(data.error);
        setRec(data);
        setResult(
          verifyRound({
            roundId: data.roundId,
            seedHex: data.seedHex,
            prevChainValue: data.prevChainValue,
            announcedStruckZone: data.struckZone,
            zoneCount: data.zoneCount,
            rake: data.rake,
            maxPayoutMultiple: data.maxPayoutMultiple,
            stakes: data.lockSnapshot,
            surgeProb: data.surgeProb,
            announcedSurge: data.surge !== null,
            announcedSurgeWinnerStakeId: data.surge ? data.surge.winnerStakeId : null,
            surgeFlatOdds: data.surge?.flatOdds ?? false,
            announcedPowerLabel: data.stormPower.label,
            announcedWeatherId: data.weather.id,
            ...(data.eventTier ? { announcedEventTierId: data.eventTier.id } : {}),
            ...(data.environment ? { announcedEnvironmentId: data.environment.id } : {}),
          }),
        );
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setError(error.message);
      });
    return () => controller.abort();
  }, [roundId]);

  useEffect(() => {
    if (roundId === null) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      openVerify(null);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [roundId, openVerify]);

  if (roundId === null) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--lf-z-modal)] flex items-center justify-center bg-black/80 p-3 sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) openVerify(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="lf-overlay max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-lg p-4 text-sm sm:max-h-[80vh] sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2
            id={titleId}
            className="text-base font-black uppercase tracking-[0.08em] text-[var(--lf-mute)]"
          >
            Verify Round #{roundId}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => openVerify(null)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-[var(--lf-dim)] hover:text-[var(--lf-text)]"
            aria-label={`Close verification for round ${roundId}`}
          >
            <XIcon size={18} />
          </button>
        </div>

        {error && (
          <div role="alert" className="text-[var(--lf-danger)]">
            {error}
          </div>
        )}
        {!error && !result && (
          <div role="status" className="text-[var(--lf-dim)]">
            Recomputing…
          </div>
        )}

        {rec && result && (
          <div className="space-y-3">
            {/*
              The receipt, first and in plain words. A player who opens this
              sheet wants one thing answered before any hexadecimal appears:
              did the round I just watched actually happen the way it was
              announced? Everything below this block is the working.
            */}
            <div
              className={`rounded-md border px-4 py-3 ${
                result.allOk
                  ? 'border-[var(--lf-win)]/50 bg-[var(--lf-win-soft)]'
                  : 'border-[var(--lf-accent)] bg-[var(--lf-accent-soft)]'
              }`}
            >
              <div className="lf-label">Round #{rec.roundId}</div>
              <div className="lf-display mt-1 text-[26px] text-[var(--lf-text)]">
                HARBOR {rec.struckZone + 1}
              </div>
              <div
                className={`mt-1.5 text-[13px] font-bold uppercase tracking-[0.1em] ${
                  result.allOk ? 'text-[var(--lf-win)]' : 'text-[var(--lf-accent)]'
                }`}
              >
                {result.allOk ? 'Verified ✓' : 'Verification failed'}
              </div>
              <p className="mt-1.5 text-[12px] leading-snug text-[var(--lf-dim)]">
                {result.allOk
                  ? 'Recomputed in your browser from the revealed seed. Every harbor had exactly the same 1-in-6 chance, and the result was fixed before betting opened.'
                  : 'The recomputation disagrees with what was announced. This would indicate a real integrity breach.'}
              </p>
            </div>

            <details className="group">
              <summary className="min-h-[44px] cursor-pointer list-none rounded-md border border-[var(--lf-line)] px-3 py-2.5 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--lf-dim)] hover:border-[var(--lf-line-2)] hover:text-[var(--lf-text)]">
                Show the working
              </summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-1 break-all text-xs text-[var(--lf-dim)]">
                  <div>Revealed seed: {rec.seedHex}</div>
                  <div>Prior chain value: {rec.prevChainValue}</div>
                  {chainCommitment && <div>Season commitment: {chainCommitment}</div>}
                </div>
                <div className="space-y-1">
                  <Check
                    ok={result.chainOk}
                    label="SHA-256(seed) matches the pre-committed chain"
                  />
                  <Check
                    ok={result.drawOk}
                    label={`HMAC → u=${result.u.toFixed(6)} → Zone ${result.recomputedZone + 1} struck (matches announcement)`}
                  />
                  <div className="text-[var(--lf-dim)]">
                    Storm feints derived from the same digest: harbors{' '}
                    {result.feints.map((f) => f + 1).join(', ')}
                  </div>
                  {result.powerOk !== null && (
                    <Check
                      ok={result.powerOk}
                      label={`Storm Power recomputed: ${result.recomputedPower.label} (salvage ×${
                        result.recomputedPower.mNum / result.recomputedPower.mDen
                      }) — matches announcement`}
                    />
                  )}
                  {rec.powerCapped && (
                    <div className="text-[var(--lf-dim)]">
                      Liability cap applied: total salvage clamped to {rec.maxPayoutMultiple}× the
                      round handle (recomputed from the public snapshot).
                    </div>
                  )}
                  {result.weatherOk !== null && (
                    <Check
                      ok={result.weatherOk}
                      label={`Weather Pattern recomputed: ${result.recomputedWeather.label} — matches announcement`}
                    />
                  )}
                  {/*
                The presentation domains. They are worth verifying for exactly
                one reason: they are recomputed from DIFFERENT HMAC messages
                over the same seed, so a passing check here is the evidence that
                the reveal's drama and the board's weather are drawn separately
                from the harbor — not merely asserted to be.
              */}
                  {result.eventTierOk !== null && (
                    <Check
                      ok={result.eventTierOk}
                      label={`Reveal tier from HMAC(seed, "landfall:event:${rec.roundId}"): ${result.recomputedEventTier.label} — matches announcement`}
                    />
                  )}
                  {result.environmentOk !== null && (
                    <Check
                      ok={result.environmentOk}
                      label={`Sea from HMAC(seed, "landfall:environment:${rec.roundId}"): ${result.recomputedEnvironment.label} — matches announcement`}
                    />
                  )}
                  {result.surgeOk !== null && (
                    <Check
                      ok={result.surgeOk}
                      label={
                        result.recomputedSurge
                          ? `Storm Surge triggered — Golden Anchor winner recomputed${
                              result.recomputedSurgeWinnerStakeId
                                ? ' (matches announcement)'
                                : ': pot rolled over'
                            }`
                          : 'No Storm Surge this round (trigger roll above threshold — matches)'
                      }
                    />
                  )}
                </div>
                {receipts.some((r) => r.roundId === roundId) && (
                  <div className="border-t border-[var(--lf-line)] pt-2">
                    <div className="mb-1 text-xs font-semibold text-[var(--lf-text)]">
                      Your order history (server-signed receipts)
                    </div>
                    <div className="space-y-1 text-xs text-[var(--lf-dim)]">
                      {receipts
                        .filter((r) => r.roundId === roundId)
                        .map((r) => (
                          <div key={r.seq}>
                            {r.verdict === 'ACCEPTED' ? '✓' : '✗'} {r.action.replace('_', ' ')} —{' '}
                            {r.msBeforeLock >= 0
                              ? `received ${(r.msBeforeLock / 1000).toFixed(2)}s before lock`
                              : `refused ${(-r.msBeforeLock / 1000).toFixed(2)}s after lock`}
                            {r.reason ? ` (${r.reason})` : ''} · seq #{r.seq} · sig{' '}
                            {r.sigHex.slice(0, 8)}…
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                <div className="border-t border-[var(--lf-line)] pt-2 text-xs text-[var(--lf-dim)]">
                  Lock snapshot ({rec.lockSnapshot.length} stakes):{' '}
                  {Array.from({ length: rec.zoneCount }, (_, z) => {
                    const total = rec.lockSnapshot
                      .filter((s) => s.zone === z)
                      .reduce((a, s) => a + s.amountMinor, 0);
                    return `Z${z + 1} ${(total / 100).toFixed(0)}`;
                  }).join(' · ')}
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
