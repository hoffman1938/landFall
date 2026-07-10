import { useEffect, useRef } from 'react';
import { SPLIT_PRIMARY_PERCENT } from '@landfall/core';
import { audio } from '../audio/engine';
import { HarborMapScene, type MapState } from '../pixi/HarborMapScene';
import { useStore } from '../store';

function selectMapState(): MapState {
  const s = useStore.getState();
  const myFleet = s.myFleet;
  const myZones =
    myFleet?.mode === 'SPLIT' && myFleet.secondaryZone !== null
      ? [
          { zone: myFleet.primaryZone, label: `you ${SPLIT_PRIMARY_PERCENT}%`, primary: true },
          {
            zone: myFleet.secondaryZone,
            label: `you ${100 - SPLIT_PRIMARY_PERCENT}%`,
            primary: false,
          },
        ]
      : myFleet
        ? [{ zone: myFleet.primaryZone, label: 'you 100%', primary: true }]
        : [];
  return {
    phase: s.phase?.phase ?? null,
    totalsMinor: s.pools?.totalsMinor ?? [],
    boatCounts: s.pools?.boatCounts ?? [],
    tideReport: s.tideReport,
    weatherId: s.round?.weather.id ?? null,
    myZones,
    fogActive:
      s.phase?.phase === 'ANCHOR_OPEN' &&
      s.round?.fogStartsAt != null &&
      Date.now() >= s.round.fogStartsAt,
    storm: s.storm ? { feints: s.storm.feints, endsAt: s.storm.endsAt } : null,
    struckZone:
      s.phase?.phase === 'RESOLVED' || s.phase?.phase === 'COOLDOWN'
        ? (s.lastLandfall?.struckZone ?? null)
        : null,
    anchors: s.anchors,
    signals: s.signals,
    myName: s.name,
    surgeRound: s.round?.surgeRound ?? false,
  };
}

export function HarborMap() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new HarborMapScene();
    let unsub = () => {};
    void scene
      .init(host, (zone) => {
        audio.click('tap');
        useStore.getState().sendAnchor(zone);
      })
      .then(() => {
        scene.update(selectMapState());
        unsub = useStore.subscribe(() => scene.update(selectMapState()));
      });
    return () => {
      unsub();
      scene.destroy();
    };
  }, []);

  return <div ref={hostRef} className="h-full w-full overflow-hidden rounded-xl" />;
}
