import { useEffect, useRef, useState } from 'react';
import { audio } from '../../audio/engine';
import { canLeaveTable, personalResult } from '../../simpleGameModel';
import { fmt, useStore, type LandfallInfo } from '../../store';
import { XIcon } from '../icons';

/** Native dialog supplies inert background, focus trapping and Escape handling. */
export function GameDialog({
  title,
  onClose,
  dismissible = true,
  children,
}: {
  title: string;
  onClose(): void;
  /**
   * False for a dialog whose question has to be answered — the entry gate's
   * table choice. A close button that does nothing is worse than no close
   * button, so it is not rendered, and Escape does not dismiss.
   */
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current!;
    const prior = document.activeElement as HTMLElement | null;
    el.showModal();
    return () => {
      el.close();
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="gd-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) close.current();
      }}
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close.current();
        }
      }}
    >
      <header>
        <h2>{title}</h2>
        {dismissible && (
          <button type="button" aria-label={`Close ${title}`} onClick={onClose}>
            <XIcon size={18} />
          </button>
        )}
      </header>
      <div className="gd-dialog-content">{children}</div>
    </dialog>
  );
}

export const GUIDE_SEEN = 'landfall.clear-loop-guide.v1';

export function GameGuide({
  onClose,
  nextLabel,
}: {
  onClose(): void;
  /** What the closing button promises — the entry gate goes on to the table. */
  nextLabel?: string | undefined;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hitMine, setHitMine] = useState(false);
  const hit = selected === null ? null : hitMine ? selected : (selected + 2) % 6;
  const finish = () => {
    try {
      localStorage.setItem(GUIDE_SEEN, '1');
    } catch {
      /* optional preference */
    }
    onClose();
  };
  return (
    <GameDialog title="One choice. One storm." onClose={finish}>
      <p className="gd-guide-intro">
        Choose one of six harbors. The storm hits one. <strong>Five stay safe.</strong>
      </p>
      <div className="gd-guide-step">
        <span className="gd-label">QUICK EXAMPLE · NO CREDITS USED</span>
        <h3>
          {revealed
            ? hitMine
              ? 'This time your harbor was hit.'
              : 'The storm hit another harbor.'
            : '1. Pick a harbor below'}
        </h3>
        <div className="gd-example-harbors">
          {[0, 1, 2, 3, 4, 5].map((zone) => (
            <button
              type="button"
              key={zone}
              aria-label={`Example harbor ${zone + 1}`}
              aria-pressed={zone === selected}
              className={`${selected === zone ? 'is-selected' : ''} ${revealed && hit === zone ? 'is-hit' : ''}`}
              onClick={() => {
                setSelected(zone);
                setRevealed(false);
              }}
            >
              <strong>{zone + 1}</strong>
              <small>
                {revealed && hit === zone ? 'HIT' : zone === selected ? 'YOU' : 'HARBOR'}
              </small>
            </button>
          ))}
        </div>
        {!revealed ? (
          <>
            <p>
              {selected === null
                ? 'Tapping a harbor only selects it. The main button confirms your bet.'
                : `Harbor ${selected + 1} selected. In the real game, you would now confirm your amount.`}
            </p>
            <button
              type="button"
              className="gd-primary is-ready"
              disabled={selected === null}
              onClick={() => setRevealed(true)}
            >
              2. Reveal example result
            </button>
          </>
        ) : (
          <>
            <div className="gd-example-result">
              <strong className={hitMine ? '' : 'positive'}>
                {hitMine ? '0.00 returned' : '6.00 returned'}
              </strong>
              <p>
                {hitMine
                  ? 'Example bet: 5.00. The whole bet is lost. Net result: −5.00.'
                  : 'Example bet: 5.00 returned + 1.00 bank share. Net result: +1.00.'}
              </p>
            </div>
            <button type="button" className="gd-text-button" onClick={() => setHitMine(!hitMine)}>
              {hitMine ? 'Show a safe example' : 'What if my harbor is hit?'}
            </button>
          </>
        )}
      </div>
      <p className="gd-help-copy">
        In live rounds the bank share varies with how the table&apos;s money is spread. Once bets
        close, every harbor shows exactly what it pays you if the storm picks it — so you can see
        what is at stake before the reveal. A revealed <strong>Share ×</strong> bonus increases that
        share, not your returned stake. Each harbor has the same 1-in-6 chance of being hit.
      </p>
      <button type="button" className="gd-primary is-ready" onClick={finish}>
        {nextLabel ?? (revealed ? 'Got it — open the game' : 'Skip example — open the game')}
      </button>
      <p className="gd-fine-print">
        Virtual credits only. No real money. You can watch any round without placing a bet.
      </p>
    </GameDialog>
  );
}

export function GameMenu({
  onClose,
  onGuide,
  onAdvanced,
}: {
  onClose(): void;
  onGuide(): void;
  onAdvanced(): void;
}) {
  const rooms = useStore((s) => s.rooms);
  const roomId = useStore((s) => s.roomId);
  const connected = useStore((s) => s.connected);
  const fleet = useStore((s) => s.myFleet);
  const pending = useStore((s) => s.orderPending);
  const phase = useStore((s) => s.phase);
  const joinRoom = useStore((s) => s.joinRoom);
  const [muted, setMuted] = useState(audio.prefs.muted);
  const canSwitch = connected && canLeaveTable({ myFleet: fleet, orderPending: pending, phase });
  return (
    <GameDialog title="Game menu" onClose={onClose}>
      <div className="gd-menu-actions">
        <button
          type="button"
          onClick={() => {
            onClose();
            onGuide();
          }}
        >
          How to play <span>Try the quick example</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMuted(!muted);
            audio.setPrefs({ muted: !muted });
          }}
          aria-pressed={!muted}
        >
          Sound <span>{muted ? 'Off' : 'On'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            useStore.getState().setLimitsOpen(true);
          }}
        >
          Play limits <span>Set your own limits</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            useStore.getState().setRulesOpen(true);
          }}
        >
          Full rules & fairness <span>How results are calculated</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            useStore.getState().setWreckLogOpen(true);
          }}
        >
          Round history <span>Results and verification</span>
        </button>
      </div>
      <section className="gd-menu-tables">
        <h3>Choose a table</h3>
        <p>Each table has its own rounds and bet range.</p>
        {!canSwitch && (
          <p role="status">Wait for your accepted bet to settle before changing tables.</p>
        )}
        {rooms.map((room) => (
          <button
            key={room.roomId}
            type="button"
            disabled={!canSwitch || room.roomId === roomId}
            onClick={() => {
              joinRoom(room.roomId);
              onClose();
            }}
          >
            <span>
              {room.name}
              {room.roomId === roomId ? ' · Current' : ''}
            </span>
            <small>
              {fmt(room.minStakeMinor)}–{fmt(room.maxStakeMinor)} credits
            </small>
          </button>
        ))}
      </section>
      <button
        type="button"
        className="gd-advanced-link"
        onClick={() => {
          onClose();
          onAdvanced();
        }}
      >
        Advanced controls <span>Split bets, crowd reports and signals</span>
      </button>
    </GameDialog>
  );
}

export function ReceiptDialog({ result, onClose }: { result: LandfallInfo; onClose(): void }) {
  const r = personalResult(result);
  return (
    <GameDialog title={`Your result · round #${result.roundId}`} onClose={onClose}>
      <div className="gd-receipt-head">
        <span>NET RESULT</span>
        <strong className={r.netMinor > 0 ? 'positive' : ''}>
          {r.netMinor >= 0 ? '+' : '−'}
          {fmt(Math.abs(r.netMinor))}
        </strong>
        <p>Harbor {result.struckZone + 1} was hit.</p>
      </div>
      {r.receiptKnown ? (
        <dl className="gd-receipt-rows">
          <dt>Your bet</dt>
          <dd>{fmt(r.stakeMinor!)}</dd>
          <dt>Stake returned</dt>
          <dd>{fmt(r.returnedStakeMinor!)}</dd>
          <dt>Bank share{r.multiplier > 1 ? ` · ×${r.multiplier}` : ''}</dt>
          <dd>{fmt(r.shareMinor!)}</dd>
          {r.jackpotMinor > 0 && (
            <>
              <dt>Jackpot</dt>
              <dd>{fmt(r.jackpotMinor)}</dd>
            </>
          )}
          <dt>Total returned</dt>
          <dd>{fmt(r.totalReturnMinor!)}</dd>
        </dl>
      ) : (
        <p>
          Detailed receipt unavailable after reconnect. The net result above comes from the server.
        </p>
      )}
      <p className="gd-help-copy">
        Net result = total returned − your bet.
        {r.multiplier > 1 ? ' The multiplier applies to the bank share only.' : ''}
        {r.powerCapped ? ' The round payout cap applied.' : ''}
      </p>
      <button
        type="button"
        className="gd-primary"
        onClick={() => {
          onClose();
          useStore.getState().openVerify(result.roundId);
        }}
      >
        Verify this round
      </button>
    </GameDialog>
  );
}
