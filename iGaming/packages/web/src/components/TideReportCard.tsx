/**
 * The Tide Report, as one readable beat.
 *
 * Old shape: six band words, six trend arrows and a frozen chip, permanently on
 * the board, competing with the harbors they describe.
 *
 * New shape: for one beat of the fog window, one headline, one direction, one
 * arrow — and a `DETAILS` disclosure that opens the full per-harbor table for
 * anyone who wants it. The card carries its own disclaimer, because a crowd
 * report shown during a betting window will be read as a tip unless it says
 * plainly that it is not one (see ../tideDirection.ts for the whole argument).
 *
 * Nothing here is new information: it is the SAME published `TideReport` the
 * board has always drawn, summarised. No extra field crosses the wire, so it
 * cannot leak anything the report did not already say.
 */
import { useState } from 'react';
import type { TideReport } from '@landfall/core';
import { TIDE_DISCLAIMER, tideDirection, tideSentence } from '../tideDirection';
import { crowdLabel, zoneName } from '../strings';
import { useStore } from '../store';

const TREND_GLYPH = { rising: '↗', stable: '→', falling: '↘' } as const;

export function TideReportCard({ report }: { report: TideReport | null }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const myFleet = useStore((s) => s.myFleet);
  if (!report) return null;

  const direction = tideDirection(report.entries);
  const mine = myFleet
    ? new Set([
        myFleet.primaryZone,
        ...(myFleet.secondaryZone !== null ? [myFleet.secondaryZone] : []),
      ])
    : new Set<number>();

  return (
    <section
      role="status"
      aria-label={`Tide report. ${tideSentence(direction)} ${TIDE_DISCLAIMER}`}
      className="lf-rise lf-overlay pointer-events-auto w-[min(92vw,26rem)] rounded-lg px-5 py-4"
    >
      <h2 className="lf-label">Tide report</h2>

      {/* The one figure of this card: a direction. */}
      <div className="mt-2.5 flex items-baseline gap-3">
        <span
          aria-hidden="true"
          className="lf-display text-[clamp(2.5rem,7vmin,3.25rem)] leading-none text-[var(--lf-text)]"
        >
          {direction.arrow}
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[var(--lf-dim)]">{direction.headline}</div>
          <div className="lf-num text-[clamp(1.25rem,4vmin,1.75rem)] leading-none text-[var(--lf-text)]">
            {direction.axis === 'EVEN' ? 'EVEN' : direction.axis}
          </div>
        </div>
      </div>

      {/* Lean, as a bar. Never a percentage: a percentage next to a betting
          window reads as a probability, and this is not one. */}
      {direction.axis !== 'EVEN' && (
        <div aria-hidden="true" className="mt-3 h-[3px] w-full bg-[var(--lf-surface-2)]">
          <span
            className="block h-full bg-[var(--lf-dim)] transition-[width] duration-300"
            style={{ width: `${Math.round(direction.strength * 100)}%` }}
          />
        </div>
      )}

      <p className="mt-3 text-[13px] leading-snug text-[var(--lf-text)]">
        {tideSentence(direction)}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-[var(--lf-mute)]">{TIDE_DISCLAIMER}</p>

      <button
        type="button"
        onClick={() => setDetailsOpen((open) => !open)}
        aria-expanded={detailsOpen}
        className="mt-3 min-h-[44px] w-full rounded-md border border-[var(--lf-line)] px-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--lf-dim)] transition-colors hover:border-[var(--lf-line-2)] hover:text-[var(--lf-text)]"
      >
        {detailsOpen ? 'Hide details' : 'Details'}
      </button>

      {detailsOpen && (
        <div className="lf-rise mt-3 border-t border-[var(--lf-line)] pt-3">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="lf-label-soft">
                <th scope="col" className="pb-1.5 font-bold">
                  Harbor
                </th>
                <th scope="col" className="pb-1.5 font-bold">
                  Crowd
                </th>
                <th scope="col" className="pb-1.5 text-right font-bold">
                  Trend
                </th>
                <th scope="col" className="pb-1.5 text-right font-bold">
                  Players
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--lf-dim)]">
              {report.entries.map((entry) => (
                <tr
                  key={entry.zone}
                  className={mine.has(entry.zone) ? 'text-[var(--lf-text)]' : undefined}
                >
                  <td className="py-1 font-semibold">
                    {zoneName(entry.zone)}
                    {mine.has(entry.zone) && (
                      <span className="ml-1.5 text-[11px] font-bold uppercase text-white/70">
                        you
                      </span>
                    )}
                  </td>
                  <td className="py-1">{crowdLabel(entry.band)}</td>
                  <td className="py-1 text-right font-bold" aria-label={entry.trend}>
                    {TREND_GLYPH[entry.trend]}
                  </td>
                  <td className="py-1 text-right tabular-nums">{entry.boatCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2.5 text-[12px] leading-snug text-[var(--lf-mute)]">
            Crowd levels are banded, not exact, and they stop updating while bets are hidden — so
            nobody can read the table by nudging a bet on and off.
            {report.frozen ? ' They are frozen right now.' : ''}
          </p>
        </div>
      )}
    </section>
  );
}
