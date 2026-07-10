import { MAX_STAKE_MINOR, MIN_STAKE_MINOR, SPLIT_PRIMARY_PERCENT } from '@landfall/core';
import { audio } from '../audio/engine';
import { fmt, useStore } from '../store';

const PRESETS = [10_00, 50_00, 200_00, 500_00, 1000_00, 2500_00, 5000_00];

export function StakeBar() {
  const {
    stakeInputMinor,
    setStakeInput,
    myFleet,
    fleetMode,
    setFleetMode,
    finalOrderUsed,
    phase,
    round,
    balanceMinor,
    lastFleet,
    rebet,
    doubleStake,
    sendSignal,
  } = useStore();
  const open = phase?.phase === 'ANCHOR_OPEN';
  const fogActive = open && round?.fogStartsAt != null && Date.now() >= round.fogStartsAt;

  const clamp = (v: number) => Math.min(MAX_STAKE_MINOR, Math.max(MIN_STAKE_MINOR, v));
  const bump = (delta: number) => {
    audio.click(delta > 0 ? 'up' : 'down');
    setStakeInput(clamp(stakeInputMinor + delta));
  };

  const btn =
    'rounded-md bg-[var(--lf-panel)] px-2.5 py-1.5 text-sm font-semibold hover:bg-[var(--lf-line)] disabled:opacity-40 disabled:cursor-not-allowed';
  const modeBtn = (active: boolean) =>
    `rounded-md px-2.5 py-1.5 text-sm font-extrabold disabled:opacity-40 disabled:cursor-not-allowed ${
      active
        ? 'bg-[var(--lf-amber)] text-black'
        : 'bg-[var(--lf-panel)] text-[var(--lf-dim)] hover:bg-[var(--lf-line)] hover:text-[var(--lf-text)]'
    }`;

  const planText =
    myFleet?.mode === 'SPLIT' && myFleet.secondaryZone !== null
      ? `Split Harbor ${myFleet.primaryZone + 1} ${SPLIT_PRIMARY_PERCENT}% / Harbor ${
          myFleet.secondaryZone + 1
        } ${100 - SPLIT_PRIMARY_PERCENT}% · ${fmt(myFleet.stakeMinor)}`
      : myFleet
        ? `Focus Harbor ${myFleet.primaryZone + 1} · ${fmt(myFleet.stakeMinor)}`
        : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--lf-line)] px-4 py-3">
      <div className="flex items-center gap-1.5">
        <button onClick={() => bump(-10_00)} className={btn} title="−10">
          −
        </button>
        <div className="w-24 text-center text-xl font-bold tabular-nums">
          {fmt(stakeInputMinor)}
        </div>
        <button onClick={() => bump(10_00)} className={btn} title="+10">
          +
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            audio.click('tap');
            setFleetMode('FOCUS');
          }}
          disabled={!!myFleet && finalOrderUsed}
          className={modeBtn(fleetMode === 'FOCUS')}
          title="Focus your full stake in one harbor."
        >
          Focus
        </button>
        <button
          onClick={() => {
            audio.click('tap');
            setFleetMode('SPLIT');
          }}
          disabled={!!myFleet && finalOrderUsed}
          className={modeBtn(fleetMode === 'SPLIT')}
          title={`Split one stake across two harbors: ${SPLIT_PRIMARY_PERCENT}% primary, ${
            100 - SPLIT_PRIMARY_PERCENT
          }% secondary.`}
        >
          Split
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            audio.click('tap');
            sendSignal('RALLY');
          }}
          disabled={!open || !myFleet}
          className={btn}
          title="Signal others to gather at your current harbor. Signals do not confirm your final order."
        >
          Rally
        </button>
        <button
          onClick={() => {
            audio.click('tap');
            sendSignal('FLEE');
          }}
          disabled={!open || !myFleet}
          className={btn}
          title="Signal that your current harbor looks dangerous. Signals can be bluffs."
        >
          Flee
        </button>
        <button
          onClick={() => {
            audio.click('tap');
            sendSignal('HOLD');
          }}
          disabled={!open || !myFleet}
          className={btn}
          title="Signal that you intend to hold your current harbor."
        >
          Hold
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            audio.click('up');
            doubleStake();
          }}
          disabled={!open}
          className={`${btn} text-[var(--lf-amber)]`}
          title={myFleet ? 'Double your placed fleet stake' : 'Double the stake input'}
        >
          ×2
        </button>
        <button
          onClick={() => {
            audio.click('down');
            setStakeInput(clamp(Math.floor(stakeInputMinor / 2 / 100) * 100));
          }}
          className={btn}
        >
          ½
        </button>
        <button
          onClick={() => {
            audio.click('up');
            setStakeInput(clamp(Math.min(balanceMinor, MAX_STAKE_MINOR)));
          }}
          className={btn}
          title="Bet the maximum (your balance, capped at table limit)"
        >
          MAX
        </button>
        <button
          onClick={() => {
            audio.click('tap');
            rebet();
          }}
          disabled={!open || !lastFleet || !!myFleet}
          className={btn}
          title={
            lastFleet
              ? lastFleet.mode === 'SPLIT' && lastFleet.secondaryZone !== null
                ? `Repeat split: H${lastFleet.primaryZone + 1}/H${lastFleet.secondaryZone + 1} for ${fmt(
                    lastFleet.stakeMinor,
                  )}`
                : `Repeat focus: ${fmt(lastFleet.stakeMinor)} on Harbor ${lastFleet.primaryZone + 1}`
              : 'No previous bet'
          }
        >
          ↻ Rebet
        </button>
      </div>

      <div className="hidden items-center gap-1 lg:flex">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => {
              audio.click('tap');
              setStakeInput(p);
            }}
            className="rounded-md bg-[var(--lf-panel)] px-2 py-1 text-xs text-[var(--lf-dim)] hover:bg-[var(--lf-line)]"
          >
            {(p / 100).toLocaleString('en-US')}
          </button>
        ))}
      </div>

      <div className="basis-full text-left text-xs leading-snug text-[var(--lf-dim)] sm:min-w-0 sm:flex-1 sm:basis-auto sm:text-right sm:text-sm">
        {open
          ? fogActive
            ? finalOrderUsed
              ? 'Blind Fog: final order committed — wait for lock reveal'
              : 'Blind Fog: public tide is frozen — one final fleet order remains'
            : planText
              ? `${planText} — signals may bluff; fog hides final moves`
              : fleetMode === 'SPLIT'
                ? 'Split mode: tap a harbor to set the 70% side; tap another to redirect the 30% side'
                : 'Focus mode: tap a harbor to commit the full stake'
          : 'anchors locked — wait for the next round'}
      </div>
    </div>
  );
}
