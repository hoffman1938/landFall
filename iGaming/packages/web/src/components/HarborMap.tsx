import { useEffect, useRef } from 'react';
import { SPLIT_PRIMARY_PERCENT } from '@landfall/core';
import { audio } from '../audio/engine';
import { BayScene, type BayState } from '../pixi/BayScene';
import { useStore } from '../store';
import { BayAccessibilityLayer } from './BayAccessibilityLayer';

function pickZone(zone: number): void {
  audio.click('tap');
  useStore.getState().sendAnchor(zone);
}

function flagZone(zone: number, x: number, y: number): void {
  const state = useStore.getState();
  const myZone = state.myFleet?.primaryZone ?? state.myFleet?.secondaryZone;
  if (
    myZone === undefined ||
    !state.connected ||
    state.phase?.phase !== 'ANCHOR_OPEN' ||
    state.finalOrderUsed
  ) {
    return;
  }
  state.openFlagPicker(zone, x, y);
}

function selectBayState(): BayState {
  const s = useStore.getState();
  const myFleet = s.myFleet;
  const myZones =
    myFleet?.mode === 'SPLIT' && myFleet.secondaryZone !== null
      ? [
          { zone: myFleet.primaryZone, share: `${SPLIT_PRIMARY_PERCENT}%`, primary: true },
          { zone: myFleet.secondaryZone, share: `${100 - SPLIT_PRIMARY_PERCENT}%`, primary: false },
        ]
      : myFleet
        ? [{ zone: myFleet.primaryZone, share: null, primary: true }]
        : [];
  const resolved = s.phase?.phase === 'RESOLVED' || s.phase?.phase === 'COOLDOWN';
  return {
    phase: s.phase?.phase ?? null,
    totalsMinor: s.pools?.totalsMinor ?? [],
    boatCounts: s.pools?.boatCounts ?? [],
    tideReport: s.tideReport,
    weatherId: s.round?.weather.id ?? null,
    myZones,
    fogActive: s.phase?.phase === 'ANCHOR_OPEN' && (s.tideReport?.frozen ?? false),
    finalOrderUsed: s.finalOrderUsed,
    storm: s.storm ? { feints: s.storm.feints, endsAt: s.storm.endsAt } : null,
    struckZone: resolved ? (s.lastLandfall?.struckZone ?? null) : null,
    resolvedRoundId: resolved ? (s.lastLandfall?.roundId ?? null) : null,
    signals: s.signals,
    surgeRound: s.round?.surgeRound ?? false,
  };
}

export function HarborMap() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BayScene();
    let unsub = () => {};
    void scene
      .init(host, {
        onPick: pickZone,
        onFlag: (zone, x, y) => {
          const s = useStore.getState();
          // flags fly from your own cove only — mirror the server rule client-side
          const myZone = s.myFleet?.primaryZone ?? s.myFleet?.secondaryZone;
          if (myZone === undefined || s.phase?.phase !== 'ANCHOR_OPEN') return;
          s.openFlagPicker(zone, x, y);
        },
      })
      .then(() => {
        scene.update(selectBayState());
        unsub = useStore.subscribe(() => scene.update(selectBayState()));
      });
    return () => {
      unsub();
      scene.destroy();
    };
  }, []);

  // The bay is full-bleed; ticks/fog cues remain driven by the store.
  return (
    <div className="lf-bay relative h-full w-full overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />
      <BayAccessibilityLayer onPick={pickZone} onFlag={flagZone} />
    </div>
  );
}
