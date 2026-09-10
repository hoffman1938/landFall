import { lazy, Suspense, useEffect, useState } from 'react';
import { audio } from '../../audio/engine';
import { resolveStakeLimit } from '../../stakeLimits';
import { deriveSimplePhase, personalResult } from '../../simpleGameModel';
import { harborOutcomes, outcomeRange } from '../../payoutPreview';
import { isBigMoment, loudness } from '../../revealStages';
import { useRevealStage } from '../../useRevealStage';
import { fmt, useStore, type LandfallInfo } from '../../store';
import { LimitsModal } from '../LimitsModal';
import { RealityCheck } from '../RealityCheck';
import { RulesModal } from '../RulesModal';
import { BigMoment } from './BigMoment';
import { GameBoard } from './GameBoard';
import { GameDock } from './GameDock';
import { LiveRail } from './LiveRail';
import { GameGuide, GameMenu, GUIDE_SEEN, ReceiptDialog } from './GameDialogs';
import './dashboard.css';

const VerifyModal = lazy(() => import('../VerifyModal').then((m) => ({ default: m.VerifyModal })));
const WreckLogSheet = lazy(() =>
  import('../WreckLogSheet').then((m) => ({ default: m.WreckLogSheet })),
);
const STEPS = ['Choose & bet', 'Watch the storm', 'Your result'];

function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
}

export function GameDashboard({ onAdvanced }: { onAdvanced(): void }) {
  const connected = useStore((s) => s.connected);
  const phase = useStore((s) => s.phase);
  const round = useStore((s) => s.round);
  const selected = useStore((s) => s.selectedZone);
  const fleet = useStore((s) => s.myFleet);
  const stake = useStore((s) => s.stakeInputMinor);
  const balance = useStore((s) => s.balanceMinor);
  const finalOrderUsed = useStore((s) => s.finalOrderUsed);
  const pending = useStore((s) => s.orderPending);
  const lastLandfall = useStore((s) => s.lastLandfall);
  const lastPersonal = useStore((s) => s.lastPersonalLandfall);
  const session = useStore((s) => s.sessionSeries);
  const pools = useStore((s) => s.pools);
  const tideReport = useStore((s) => s.tideReport);
  const rakeBp = useStore((s) => s.rakeBp);
  const landfallAt = useStore((s) => s.lastLandfallAt);
  const rooms = useStore((s) => s.rooms);
  const roomId = useStore((s) => s.roomId);
  const min = useStore((s) => s.roomMinStakeMinor);
  const max = useStore((s) => s.roomMaxStakeMinor);
  const liquidity = useStore((s) => s.roomLiquidityFloorMinor);
  const whaleCap = useStore((s) => s.whaleCapFraction);
  const limits = useStore((s) => s.limits);
  const welcomeOpen = useStore((s) => s.welcomeOpen);
  const toast = useStore((s) => s.toast);
  const toastTone = useStore((s) => s.toastTone);
  const verifyRoundId = useStore((s) => s.verifyRoundId);
  const historyOpen = useStore((s) => s.wreckLogOpen);
  const selectZone = useStore((s) => s.selectSimpleZone);
  const dismissWelcome = useStore((s) => s.dismissWelcome);
  const dismissToast = useStore((s) => s.dismissToast);
  const [now, setNow] = useState(Date.now);
  const [menu, setMenu] = useState(false);
  const [guide, setGuide] = useState(false);
  const [receipt, setReceipt] = useState<LandfallInfo | null>(null);
  const [guideSeen] = useState(() => {
    try {
      return localStorage.getItem(GUIDE_SEEN) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (guideSeen && welcomeOpen && connected && roomId) dismissWelcome(roomId);
  }, [guideSeen, welcomeOpen, connected, roomId, dismissWelcome]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismissToast, 6000);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  const model = deriveSimplePhase({
    connected,
    phase,
    roundId: round?.roundId ?? null,
    result: lastLandfall,
    now,
    finalOrderUsed,
    orderPending: pending,
  });
  const step = model.stage === 'choose' ? 0 : model.stage === 'storm' ? 1 : 2;
  const table = rooms.find((r) => r.roomId === roomId);
  const net = session.at(-1)?.cumulativeMinor ?? 0;
  const roundsPlayed = session.filter((p) => p.played).length;
  const available = balance + (fleet?.stakeMinor ?? 0);
  const stakeLimit = resolveStakeLimit({
    balanceMinor: available,
    roomMinStakeMinor: min,
    roomMaxStakeMinor: max,
    whaleCapFraction: whaleCap,
    liquidityFloorMinor: liquidity,
    houseSeedMinor: round?.houseSeedMinor ?? 0,
  });
  const maxMinor = Math.min(
    stakeLimit.maxMinor,
    available,
    limits?.stakePerRoundCapMinor ?? Infinity,
  );
  const excluded = !!limits?.excludedUntil && limits.excludedUntil > now;
  const showGuide = guide || (welcomeOpen && !guideSeen);
  const anyOverlay = showGuide || menu || receipt !== null || verifyRoundId !== null || historyOpen;
  const canBet = model.canBet && !anyOverlay && !excluded;
  const placed = fleet
    ? [
        fleet.primaryZone,
        ...(fleet.mode === 'SPLIT' && fleet.secondaryZone !== null ? [fleet.secondaryZone] : []),
      ]
    : [];
  const selectedLabel =
    selected !== null
      ? `Harbor ${selected + 1}`
      : fleet
        ? `Harbor ${fleet.primaryZone + 1}${fleet.mode === 'SPLIT' ? ` + ${fleet.secondaryZone! + 1}` : ''}`
        : 'Not selected';
  const dirty =
    !!fleet &&
    ((selected !== null && selected !== fleet.primaryZone) || stake !== fleet.stakeMinor);
  const closeGuide = () => {
    setGuide(false);
    if (welcomeOpen && roomId) dismissWelcome(roomId);
  };
  const record = lastPersonal ? personalResult(lastPersonal) : null;

  // The reveal walks its beats from the moment LANDFALL arrived; the board and
  // the dock read the same beat so they can never disagree about what has been
  // shown. Only the round currently on screen animates.
  const reveal = useRevealStage(model.result ? landfallAt : null);

  // What this round can still pay you. Exact once the lock snapshot publishes
  // pools; a Share × bonus can only raise it, so "at least" is literal.
  const outcomes = harborOutcomes({ pools, fleet, rakeBp });
  const range = fleet ? outcomeRange(outcomes) : null;

  const bigMoment =
    model.stage === 'result' &&
    model.result &&
    record &&
    isBigMoment({
      played: record.played,
      netMinor: record.netMinor,
      multiplier: record.multiplier,
      jackpotMinor: record.jackpotMinor,
      loudness: loudness(model.result.eventTier?.id ?? null),
    }) &&
    lastPersonal?.roundId === model.result.roundId
      ? {
          roundId: model.result.roundId,
          netMinor: record.netMinor,
          headline:
            record.jackpotMinor > 0
              ? 'JACKPOT'
              : record.multiplier > 1
                ? `SHARE ×${record.multiplier}`
                : 'TEMPEST',
          detail:
            record.jackpotMinor > 0
              ? `Storm Surge pot: ${fmt(record.jackpotMinor)} credits`
              : record.multiplier > 1
                ? 'The bonus multiplied your bank share'
                : 'You came through a Tempest round ahead',
        }
      : null;

  return (
    <div className="gd-app">
      <header className="gd-topbar">
        <div className="gd-brand">
          <span aria-hidden="true">L</span>
          <b>LANDFALL</b>
        </div>
        <span className="gd-demo">DEMO · VIRTUAL CREDITS</span>
        <div className="gd-balance" aria-label={`Balance ${fmt(balance)} credits`}>
          <small>BALANCE</small>
          <strong>{fmt(balance)}</strong>
        </div>
        <button type="button" onClick={() => setGuide(true)} className="gd-help-button">
          How to play
        </button>
        <button type="button" onClick={() => setMenu(true)} className="gd-menu-button">
          Menu{' '}
          <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2 5h16M2 10h16M2 15h16" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </header>
      <nav className="gd-steps" aria-label="Round progress">
        {STEPS.map((name, i) => (
          <div
            key={name}
            className={i === step ? 'is-active' : i < step ? 'is-complete' : ''}
            aria-current={i === step ? 'step' : undefined}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            <b>{name}</b>
          </div>
        ))}
      </nav>
      <main className="gd-layout">
        <aside className="gd-rail gd-round-rail" aria-label="Your round and session">
          <h2>YOUR ROUND</h2>
          <div className="gd-rail-section">
            <span className="gd-label">{fleet ? 'YOUR HARBOR' : 'SELECTED HARBOR'}</span>
            <strong className="gd-rail-value">{selectedLabel}</strong>
            <span className="gd-label">BET · CREDITS</span>
            <strong className="gd-rail-value">{fmt(stake)}</strong>
            <span className="gd-draft-status">
              {pending
                ? 'Confirming with the server…'
                : fleet
                  ? dirty
                    ? `Draft · accepted ${fmt(fleet.stakeMinor)}`
                    : 'Accepted for this round'
                  : 'Draft · not placed'}
            </span>
          </div>
          <div className="gd-rail-section gd-playing-for">
            <span className="gd-label">PLAYING FOR</span>
            {range && fleet ? (
              <>
                <strong className="gd-rail-value positive">
                  {signed(range.best)}
                  <em>best of the five safe harbors</em>
                </strong>
                <p>
                  If the storm hits your harbor you lose {fmt(fleet.stakeMinor)}. Any other harbor
                  returns your bet plus a share of its bank.
                </p>
              </>
            ) : (
              <p>
                The storm hits one of six harbors. If yours is safe, your bet returns with a share
                of the hit harbor&apos;s bank. If yours is hit, your bet is lost.
              </p>
            )}
            <span className="gd-table-caption">
              {table?.name ?? 'Joining table…'}
              {round ? ` · #${round.roundId}` : ''}
            </span>
          </div>
          <div className="gd-session">
            <h2>SESSION</h2>
            <dl>
              <dt>Net result</dt>
              <dd className={net > 0 ? 'positive' : ''}>{signed(net)}</dd>
              <dt title="Rounds you played within the last 60 completed rounds">Recent bets</dt>
              <dd>{roundsPlayed}</dd>
            </dl>
          </div>
        </aside>
        <div className="gd-main-panel">
          <GameBoard
            stage={model.stage}
            seconds={model.secondsLeft}
            connected={connected}
            roundId={round?.roundId ?? null}
            selected={selected}
            placed={placed}
            canSelect={canBet}
            betLocked={finalOrderUsed}
            result={model.result}
            pools={pools}
            tideReport={tideReport}
            fleet={fleet}
            rakeBp={rakeBp}
            reveal={reveal}
            onSelect={(zone) => {
              audio.click('tap');
              selectZone(zone);
            }}
          />
          {bigMoment && (
            <BigMoment
              roundId={bigMoment.roundId}
              headline={bigMoment.headline}
              netMinor={bigMoment.netMinor}
              detail={bigMoment.detail}
            />
          )}
          {round?.surgeRound && (
            <div className="gd-event-note">
              JACKPOT ROUND · One eligible safe player receives {fmt(round.surgePotMinor)} extra
              credits.{' '}
              <button type="button" onClick={() => useStore.getState().setRulesOpen(true)}>
                Details
              </button>
            </div>
          )}
          {excluded && (
            <div className="gd-event-note gd-neutral-note">
              Your play break is active. You can watch without betting.
            </div>
          )}
          <GameDock
            stage={model.stage}
            canBet={canBet}
            maxMinor={maxMinor}
            result={model.result}
            reveal={reveal}
          />
        </div>
        <LiveRail />
      </main>
      <footer className="gd-last-result">
        <span className="gd-label">YOUR LAST RESULT</span>
        {record && lastPersonal ? (
          <div className="gd-last-summary">
            <b className={record.netMinor > 0 ? 'positive' : ''}>{signed(record.netMinor)}</b>
            <span>
              #{lastPersonal.roundId} · Harbor {lastPersonal.struckZone + 1} hit
              {record.totalReturnMinor !== null
                ? ` · returned ${fmt(record.totalReturnMinor)}`
                : ''}
            </span>
          </div>
        ) : (
          <span>No bet placed yet</span>
        )}
        <button
          type="button"
          onClick={() => {
            if (lastPersonal) setReceipt(lastPersonal);
            else useStore.getState().setWreckLogOpen(true);
          }}
        >
          {lastPersonal ? 'View receipt' : 'View history'}
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12h16m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </footer>
      {toast && (
        <div
          className={`gd-toast ${toastTone === 'error' ? 'is-error' : ''}`}
          role={toastTone === 'error' ? 'alert' : 'status'}
        >
          <span>{toast}</span>
          <button type="button" onClick={dismissToast}>
            Dismiss
          </button>
        </div>
      )}
      {showGuide && <GameGuide onClose={closeGuide} />}
      {menu && (
        <GameMenu
          onClose={() => setMenu(false)}
          onGuide={() => setGuide(true)}
          onAdvanced={onAdvanced}
        />
      )}
      {receipt && <ReceiptDialog result={receipt} onClose={() => setReceipt(null)} />}
      {verifyRoundId !== null && (
        <Suspense fallback={null}>
          <VerifyModal />
        </Suspense>
      )}
      {historyOpen && (
        <Suspense fallback={null}>
          <WreckLogSheet />
        </Suspense>
      )}
      <RulesModal />
      <LimitsModal />
      <RealityCheck />
    </div>
  );
}
