/**
 * Provably-fair verification — recomputes everything in the browser using the
 * same @landfall/core functions the server runs
 * (docs/04-architecture/rng-provably-fair-spec.md §6).
 */
import { useEffect, useId, useRef, useState } from 'react';
import {
  verifyRound,
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
  zoneCount: number;
  surgeProb: number;
  surge: { winnerStakeId: string | null; amountMinor: number } | null;
  stormPower: { label: string; mNum: number; mDen: number };
  weather: WeatherPattern;
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
            stakes: data.lockSnapshot,
            surgeProb: data.surgeProb,
            announcedSurge: data.surge !== null,
            announcedSurgeWinnerStakeId: data.surge ? data.surge.winnerStakeId : null,
            announcedPowerLabel: data.stormPower.label,
            announcedWeatherId: data.weather.id,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) openVerify(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--lf-line)] bg-[var(--lf-panel)] p-4 text-sm sm:max-h-[80vh] sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-bold">
            Verify Round #{roundId}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => openVerify(null)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--lf-dim)] hover:text-[var(--lf-text)]"
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
            <div className="space-y-1 break-all text-xs text-[var(--lf-dim)]">
              <div>Revealed seed: {rec.seedHex}</div>
              <div>Prior chain value: {rec.prevChainValue}</div>
              {chainCommitment && <div>Season commitment: {chainCommitment}</div>}
            </div>
            <div className="space-y-1">
              <Check ok={result.chainOk} label="SHA-256(seed) matches the pre-committed chain" />
              <Check
                ok={result.drawOk}
                label={`HMAC → u=${result.u.toFixed(6)} → Harbor ${result.recomputedZone + 1} struck (matches announcement)`}
              />
              <div className="text-[var(--lf-dim)]">
                Storm feints derived from the same digest: Harbors{' '}
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
              {result.weatherOk !== null && (
                <Check
                  ok={result.weatherOk}
                  label={`Weather Pattern recomputed: ${result.recomputedWeather.label} — matches announcement`}
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
            <div className="border-t border-[var(--lf-line)] pt-2 text-xs text-[var(--lf-dim)]">
              Lock snapshot ({rec.lockSnapshot.length} stakes):{' '}
              {Array.from({ length: rec.zoneCount }, (_, z) => {
                const total = rec.lockSnapshot
                  .filter((s) => s.zone === z)
                  .reduce((a, s) => a + s.amountMinor, 0);
                return `H${z + 1} ${(total / 100).toFixed(0)}`;
              }).join(' · ')}
            </div>
            <div
              className={`rounded-md px-3 py-2 font-semibold ${
                result.allOk ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'
              }`}
            >
              {result.allOk
                ? 'All checks passed — this outcome was fixed before anchoring opened, and the strike is uniform across harbors.'
                : 'VERIFICATION FAILED — this would indicate a real integrity breach.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
