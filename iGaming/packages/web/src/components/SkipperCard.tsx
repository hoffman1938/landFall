/**
 * Skipper Record card (remediation E1) — cosmetic reputation on tap of a name.
 * Identity, not Skinner box: no XP, no rewards, nothing here touches odds.
 * Opens from chat names and from Settings → "My skipper record".
 */
import { useEffect } from 'react';
import { audio } from '../audio/engine';
import { fmt, useStore } from '../store';
import { AnchorIcon, BoatIcon, CrateIcon, RallyFlagIcon, SurgeIcon, XIcon } from './icons';

export function SkipperCard() {
  const skipperCard = useStore((s) => s.skipperCard);
  const closeSkipper = useStore((s) => s.closeSkipper);
  const myName = useStore((s) => s.name);

  useEffect(() => {
    if (!skipperCard) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSkipper();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [skipperCard, closeSkipper]);

  if (!skipperCard) return null;
  const { name, record, loading } = skipperCard;
  const mine = myName !== null && name === myName;

  const stats = record
    ? [
        {
          label: 'Survival streak',
          value: `${record.currentStreak}`,
          sub: `best ${record.bestStreak}`,
          icon: <BoatIcon size={16} />,
        },
        {
          label: 'Rounds played',
          value: `${record.roundsSailed}`,
          sub: null,
          icon: <AnchorIcon size={16} />,
        },
        {
          label: 'Biggest win',
          value: record.biggestSalvageMinor > 0 ? `+${fmt(record.biggestSalvageMinor)}` : '—',
          sub: null,
          icon: <CrateIcon size={16} />,
        },
        {
          label: 'Bluffs called',
          value: `${record.bluffsCalled}`,
          sub: null,
          icon: <RallyFlagIcon size={16} />,
        },
        {
          label: 'Jackpots won',
          value: `${record.surgeWins}`,
          sub: null,
          icon: <SurgeIcon size={16} />,
        },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#02070a]/72 backdrop-blur-[2px] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeSkipper();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Player stats for ${name}`}
        className="lf-rise lf-surface lf-rim w-full max-w-sm rounded-2xl p-4"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--lf-surface-2)] text-[var(--lf-focus)]">
            <BoatIcon size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold text-[var(--lf-text)]">
              {name}
              {mine ? <span className="text-[var(--lf-dim)]"> (you)</span> : null}
            </h2>
            <p className="text-xs font-semibold text-[var(--lf-dim)]">Player stats</p>
          </div>
          <button
            type="button"
            onClick={() => {
              audio.click('nav');
              closeSkipper();
            }}
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-full text-[var(--lf-dim)] hover:bg-[var(--lf-panel)] hover:text-[var(--lf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-focus)]"
            aria-label="Close player stats"
          >
            <XIcon size={18} />
          </button>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-[var(--lf-dim)]">Reading the logbook…</p>
        ) : record === null ? (
          <p className="py-6 text-center text-sm text-[var(--lf-dim)]">
            No skipper by that name sails these waters.
          </p>
        ) : record.roundsSailed === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--lf-dim)]">
            No voyages logged yet — their first tide still waits.
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {stats.map((stat) => (
              <li
                key={stat.label}
                className="rounded-xl border border-[var(--lf-line)] bg-[var(--lf-surface-2)]/60 px-3 py-2"
              >
                <div className="flex items-center gap-1.5 text-[var(--lf-dim)]">
                  {stat.icon}
                  <span className="text-[11px] font-semibold">{stat.label}</span>
                </div>
                <div className="mt-0.5 text-lg font-extrabold tabular-nums text-[var(--lf-text)]">
                  {stat.value}
                  {stat.sub ? (
                    <span className="ml-1.5 text-xs font-semibold text-[var(--lf-dim)]">
                      {stat.sub}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-[11px] leading-snug text-[var(--lf-dim)]">
          Records are for bragging rights only — they never change odds or payouts.
        </p>
      </div>
    </div>
  );
}
