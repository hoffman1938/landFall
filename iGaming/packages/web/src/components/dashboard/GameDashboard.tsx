import { lazy, Suspense, useEffect, useState } from 'react';
import { audio } from '../../audio/engine';
import { resolveStakeLimit } from '../../stakeLimits';
import { deriveSimplePhase, personalResult } from '../../simpleGameModel';
import { harborOutcomes, outcomeRange } from '../../payoutPreview';
import { isBigMoment, loudness } from '../../revealStages';
import { useRevealStage } from '../../useRevealStage';
import { MALFUNCTION_NOTICE, stormPowerRange } from '@landfall/core';
import { fmt, useStore, type LandfallInfo } from '../../store';
import { LimitsModal } from '../LimitsModal';
import { RealityCheck } from '../RealityCheck';
import { RulesModal } from '../RulesModal';
import { BigMoment } from './BigMoment';
import { GameBoard } from './GameBoard';
import { JackpotMeter } from './JackpotMeter';
import { GameDock } from './GameDock';
import { LiveRail } from './LiveRail';
import { GameGuide, GameMenu, GUIDE_SEEN, ReceiptDialog } from './GameDialogs';
import { GameInfoDialog } from './GameInfoDialog';
import { TableChooser } from './TableChooser';
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
  const [tablePicker, setTablePicker] = useState(false);
  const [gameInfo, setGameInfo] = useState(false);
  const [receipt, setReceipt] = useState<LandfallInfo | null>(null);
  const [guideSeen] = useState(() => {
    try {
      return localStorage.getItem(GUIDE_SEEN) === '1';
    } catch {
      return false;
    }
  });
  /**
   * The entry gate runs how-to-play (first visit only) and then the table
   * choice, which every visit gets. The stake tier decides what a round costs
   * and whose money a payout is made of; it used to be settled silently by the
   * server's seating rule and a returning player's last room, so nobody ever
   * actually chose it. The current table is preselected, so a refresh is one tap.
   */
  const [entryStep, setEntryStep] = useState<'guide' | 'table' | null>(() =>
    guideSeen ? 'table' : 'guide',
  );
  // Both entry dialogs are gated on `welcomeOpen`, which starts false and is
  // only raised by a handshake that decided this is a NEW session. That is what
  // keeps a resumed session (the handshake carried a live fleet) and a later
  // table switch from re-asking, and it is why the step must not be cleared on
  // a timer or an effect: before the first WELCOME arrives there is nothing to
  // distinguish "not asked yet" from "already settled".

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
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
  const showGuide = guide || (welcomeOpen && entryStep === 'guide');
  const showTablePicker = tablePicker || (welcomeOpen && entryStep === 'table');
  const anyOverlay =
    showGuide ||
    showTablePicker ||
    menu ||
    gameInfo ||
    receipt !== null ||
    verifyRoundId !== null ||
    historyOpen;
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
    // From the entry gate the guide hands over to the table choice rather than
    // dropping the player into whichever table the server picked.
    if (welcomeOpen && entryStep === 'guide') setEntryStep('table');
  };
  const chooseTable = (chosenRoomId: string) => {
    dismissWelcome(chosenRoomId);
    // A refused switch (a bet still in play) deliberately leaves the gate open;
    // the store's toast says why, so the step must not be marked done. Reading
    // the store back is the only way to tell the two outcomes apart.
    if (!useStore.getState().welcomeOpen) setEntryStep(null);
    setTablePicker(false);
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
        <button
          type="button"
          className="gd-table-button"
          onClick={() => setTablePicker(true)}
          aria-label={
            table
              ? `Table ${table.name}, ${fmt(min)} to ${fmt(max)} per round. Change table.`
              : 'Choose a table'
          }
        >
          <small>TABLE</small>
          <strong>{table?.name ?? 'Joining…'}</strong>
          <em>
            {fmt(min)} – {fmt(max)}
          </em>
        </button>
        {round && (
          <JackpotMeter
            potMinor={round.surgePotMinor}
            live={round.surgeRound}
            tableName={table?.name ?? null}
            roomId={roomId}
            onExplain={() => useStore.getState().setRulesOpen(true)}
          />
        )}
        <div className="gd-balance" aria-label={`Balance ${fmt(balance)} credits`}>
          <small>BALANCE</small>
          <strong>{fmt(balance)}</strong>
        </div>
        <button type="button" onClick={() => setGuide(true)} className="gd-help-button">
          How to play
        </button>
        {/*
          GLI-19 §4.7.3 — the actual odds of the highest advertised award must be
          PROMINENTLY DISPLAYED, because ×500 at ~1 in 1,048,576 is far more
          frequent than the 1-in-100,000,000 the clause lets go undisclosed. A
          collapsed accordion inside a rules modal is not prominent; a permanent
          control on the game surface, labelled with the number itself, is (G9).
        */}
        <button type="button" onClick={() => setGameInfo(true)} className="gd-odds-button">
          <small>STORM ODDS</small>
          <strong>
            {stormPowerRange().minMultiplier}–{stormPowerRange().maxMultiplier}
          </strong>
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
          {round && round.houseSeedMinor > 0 && (
            <div className="gd-rail-section gd-house-seed">
              <span className="gd-label">HOUSE MONEY THIS ROUND</span>
              <strong className="gd-rail-value">
                {fmt(round.houseSeedMinor)} <em>on every harbour</em>
              </strong>
              <p>
                The same amount on all six, fixed before betting opened — it cannot take a side or
                change which harbour is hit.{' '}
                <button type="button" onClick={() => setGameInfo(true)}>
                  Why it is there
                </button>
              </p>
            </div>
          )}
          <div className="gd-rail-section gd-playing-for">
            <span className="gd-label">PLAYING FOR</span>
            {range && fleet ? (
              <>
                <strong className="gd-rail-value positive">
                  {signed(range.best)}
                  <em>best of the five safe harbors</em>
                </strong>
                {/*
                  Short on purpose. The full rule now reads at 13px across the
                  deck, so repeating it here in a 190px column pushed the
                  session figures off the bottom of the rail. What belongs here
                  is the one number the rule does not carry: yours.
                */}
                <p>
                  If it is hit you lose <b>{fmt(fleet.stakeMinor)}</b>.
                </p>
              </>
            ) : (
              <p>
                The storm hits one of six harbors. If yours is safe, your bet returns with a share
                of the hit harbor&apos;s bank. If yours is hit, your bet is lost.
              </p>
            )}
            <span className="gd-table-caption">{round ? `Round #${round.roundId}` : ''}</span>
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
            <div className="gd-event-note" role="status">
              <b>BONUS ROUND IN PROGRESS</b> · Survive this one and you are in the draw for the
              whole {fmt(round.surgePotMinor)} pot. One safe player at this table takes it.{' '}
              <span className="gd-eligibility">
                {fleet
                  ? 'You have a bet in this round, so you are in the draw if your harbour is safe.'
                  : 'You have no bet in this round, so you are not in the draw.'}
              </span>{' '}
              <button type="button" onClick={() => useStore.getState().setRulesOpen(true)}>
                How the winner is picked
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
      {/*
        Order 222 Annex 1 Art. 8.1(b) requires this notice CLEARLY AND LEGIBLY on
        the game surface — not in a modal a player may never open (G12). It sits
        in the permanent legal strip with the demo statement and the version, so
        it is always on screen while a bet can be placed.
      */}
      <div className="gd-legal-strip">
        <b>{MALFUNCTION_NOTICE}</b>
        <span>Virtual credits · no real money · no deposits or withdrawals</span>
        <button type="button" onClick={() => setGameInfo(true)}>
          Game information, odds &amp; limits
        </button>
      </div>
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
      {showGuide && (
        <GameGuide
          onClose={closeGuide}
          {...(welcomeOpen && entryStep === 'guide'
            ? { nextLabel: 'Next: choose your table' }
            : {})}
        />
      )}
      {showTablePicker && !showGuide && (
        <TableChooser
          rooms={rooms}
          currentRoomId={roomId}
          balanceMinor={balance}
          onChoose={chooseTable}
          {...(tablePicker && !welcomeOpen ? { onBack: () => setTablePicker(false) } : {})}
        />
      )}
      {menu && (
        <GameMenu
          onClose={() => setMenu(false)}
          onGuide={() => setGuide(true)}
          onGameInfo={() => setGameInfo(true)}
          onAdvanced={onAdvanced}
        />
      )}
      {gameInfo && <GameInfoDialog onClose={() => setGameInfo(false)} />}
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
