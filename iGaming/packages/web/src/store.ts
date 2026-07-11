/**
 * Client state + WebSocket wiring. The client renders server-authoritative
 * state and sends requests only — it never computes outcomes
 * (docs/05-security/security-review.md §0); verification recomputation is
 * read-only via @landfall/core.
 */
import { create } from 'zustand';
import { MAX_STAKE_MINOR, MIN_STAKE_MINOR, ZONE_COUNT } from '@landfall/core';
import type {
  ActionReceipt,
  ChatEntry,
  FleetMode,
  FleetPlanPublic,
  LimitsState,
  RoomInfo,
  PhaseInfo,
  PlayerPublic,
  PoolsState,
  RoundHeader,
  SignalKind,
  SignalPublic,
  SkipperRecordPublic,
  TideReport,
  WreckWakeReplay,
} from '@landfall/core';
import { audio } from './audio/engine';

export interface LandfallInfo {
  roundId: number;
  struckZone: number;
  seedHex: string;
  prevChainValue: string;
  results: { name: string; outcome: 'SAFE' | 'WRECKED' | 'SPLIT'; netMinor: number }[];
  yourResult: { outcome: 'SAFE' | 'WRECKED' | 'SPLIT' | 'SPECTATOR'; netMinor: number };
  replay: WreckWakeReplay;
  surge?: { potMinor: number; winnerName: string | null; winnerStakeMinor: number | null };
  stormPower?: { label: string; mNum: number; mDen: number };
  /** True when the per-round liability cap clamped the Storm Power payout. */
  powerCapped?: boolean;
}

/**
 * One Wreck Wake Replay card (E2): everything needed to retell a settled round,
 * built from the public LANDFALL payload only — no private data ever enters
 * the stack or the exported image.
 */
export interface ReplayCard {
  roundId: number;
  struckZone: number;
  replay: WreckWakeReplay;
  stormPower?: { label: string; mNum: number; mDen: number };
  powerCapped: boolean;
  surge?: { potMinor: number; winnerName: string | null; winnerStakeMinor: number | null };
  at: number;
}

export interface StormInfo {
  feints: [number, number];
  endsAt: number;
}

interface State {
  connected: boolean;
  playerId: string | null;
  name: string | null;
  balanceMinor: number;
  chainCommitment: string | null;
  /** Current room + lobby (C1/C2). */
  roomId: string | null;
  rooms: RoomInfo[];
  roomMinStakeMinor: number;
  roomMaxStakeMinor: number;
  whaleCapFraction: number;
  /** Last known exact handle (from lock snapshots) — whale-cap pre-check estimate (B5). */
  lastKnownHandleMinor: number | null;
  /** Rounds in which this client flew a flag — mirrors the B4 cooldown for the UI. */
  myFlagRounds: number[];
  round: RoundHeader | null;
  phase: PhaseInfo | null;
  pools: PoolsState | null;
  tideReport: TideReport | null;
  anchors: PlayerPublic[];
  signals: SignalPublic[];
  myAnchor: { zone: number; stakeMinor: number } | null;
  myFleet: FleetPlanPublic | null;
  fleetMode: FleetMode;
  /** True until a submitted fleet order receives an authoritative ACK or error. */
  orderPending: boolean;
  finalOrderUsed: boolean;
  stakeInputMinor: number;
  wreckLog: number[];
  /** Player conversation only. */
  chat: ChatEntry[];
  /** Wins & events feed (salvage, Golden Anchor, surge announcements) — separate panel. */
  events: { text: string; at: number; kind: 'salvage' | 'golden' | 'surge' | 'info' }[];
  storm: StormInfo | null;
  lastLandfall: LandfallInfo | null;
  toast: string | null;
  verifyRoundId: number | null; // open verify modal for this round
  rulesOpen: boolean;
  /** Signal-flag picker anchor point (opened via long-press/right-click on a cove or the dock). */
  flagPickerAt: { zone: number; x: number; y: number } | null;
  /** Last placed anchor (zone+stake) — for one-click Rebet in the next round. */
  lastAnchor: { zone: number; stakeMinor: number } | null;
  /** Last placed fleet order — preserves Focus/Split for one-click Rebet. */
  lastFleet: FleetPlanPublic | null;
  /**
   * Signed action receipts (B1), newest last, capped. Proof of exactly what the
   * server accepted/rejected and when — shown in the Verify sheet per round.
   */
  receipts: ActionReceipt[];
  /** Wreck Wake Replay card stack (E2), newest last, capped at 20. */
  replayCards: ReplayCard[];
  /** The Wreck Log card-stack sheet (E2). */
  wreckLogOpen: boolean;
  /** Skipper profile card (E1): open lookup, or null. */
  skipperCard: { name: string; record: SkipperRecordPublic | null; loading: boolean } | null;
  /** Responsible-gambling state (F1/F2), server-authoritative. */
  limits: LimitsState | null;
  /** Epoch ms this connection began — session clock (F2) + reality checks. */
  sessionStartAt: number | null;
  /** Pending reality check (F1) — calm, dismissible, never amber. */
  realityCheck: { elapsedMinutes: number; sessionNetMinor: number; at: number } | null;
  /** Play-limits settings sheet (F1/F2). */
  limitsOpen: boolean;
  /** E3: the verify stamp glows once on the first loss ≥ 10× min stake. */
  verifyGlow: boolean;

  sendAnchor(zone: number): void;
  /** Withdraw the active fleet order before lock; the full stake is refunded. */
  cancelOrder(): void;
  /** Switch rooms (C1). */
  joinRoom(roomId: string): void;
  sendSignal(kind: SignalKind, zone?: number): void;
  sendChat(text: string): void;
  setFleetMode(mode: FleetMode): void;
  setStakeInput(minor: number): void;
  openVerify(roundId: number | null): void;
  setRulesOpen(open: boolean): void;
  openFlagPicker(zone: number, x: number, y: number): void;
  closeFlagPicker(): void;
  rebet(): void;
  doubleStake(): void;
  dismissToast(): void;
  /** E1: request a skipper's record by display name and open the card. */
  openSkipper(name: string): void;
  closeSkipper(): void;
  /** E2: open/close the Wreck Log replay-card stack. */
  setWreckLogOpen(open: boolean): void;
  /** F1: patch self-set limits (omitted = unchanged, null = clear). */
  sendLimits(patch: {
    sessionLossLimitMinor?: number | null;
    dailyLossLimitMinor?: number | null;
    stakePerRoundCapMinor?: number | null;
    realityCheckMinutes?: number | null;
  }): void;
  /** F2: demo-grade self-exclusion — the lockout only ever extends. */
  sendExclusion(minutes: number): void;
  setLimitsOpen(open: boolean): void;
  dismissRealityCheck(): void;
}

let ws: WebSocket | null = null;

function oppositeZone(zone: number): number {
  return (zone + Math.floor(ZONE_COUNT / 2)) % ZONE_COUNT;
}

function focusFleet(zone: number, stakeMinor: number): FleetPlanPublic {
  return { mode: 'FOCUS', primaryZone: zone, secondaryZone: null, stakeMinor };
}

function anchorFromFleet(
  fleet: FleetPlanPublic | null,
): { zone: number; stakeMinor: number } | null {
  return fleet ? { zone: fleet.primaryZone, stakeMinor: fleet.stakeMinor } : null;
}

function fleetOrderMessage(fleet: FleetPlanPublic): unknown {
  return {
    type: 'FLEET_ORDER',
    mode: fleet.mode,
    primaryZone: fleet.primaryZone,
    ...(fleet.mode === 'SPLIT'
      ? { secondaryZone: fleet.secondaryZone ?? oppositeZone(fleet.primaryZone) }
      : {}),
    stakeMinor: fleet.stakeMinor,
  };
}

export const useStore = create<State>((set, get) => {
  function send(msg: unknown): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      const saved = localStorage.getItem('landfall.playerId') ?? undefined;
      send({ type: 'HELLO', ...(saved ? { playerId: saved } : {}) });
    };
    ws.onclose = () => {
      set({ connected: false, orderPending: false });
      setTimeout(connect, 1_000);
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string);
      switch (msg.type) {
        case 'WELCOME': {
          const fleet =
            msg.yourFleet ??
            (msg.yourAnchor ? focusFleet(msg.yourAnchor.zone, msg.yourAnchor.stakeMinor) : null);
          localStorage.setItem('landfall.playerId', msg.playerId);
          set({
            connected: true,
            playerId: msg.playerId,
            name: msg.name,
            balanceMinor: msg.balanceMinor,
            chainCommitment: msg.chainCommitment,
            roomId: msg.roomId,
            rooms: msg.rooms,
            roomMinStakeMinor: msg.minStakeMinor,
            roomMaxStakeMinor: msg.maxStakeMinor,
            whaleCapFraction: msg.whaleCapFraction,
            lastKnownHandleMinor: null,
            round: msg.round,
            phase: msg.phase,
            pools: msg.pools ?? null,
            tideReport: msg.tideReport,
            anchors: msg.anchors,
            signals: msg.signals,
            myAnchor: anchorFromFleet(fleet),
            myFleet: fleet,
            fleetMode: fleet?.mode ?? get().fleetMode,
            orderPending: false,
            finalOrderUsed: false,
            wreckLog: msg.wreckLog,
            chat: msg.chatTail,
            storm: null,
            limits: msg.limits ?? null,
            sessionStartAt: msg.sessionStartAt ?? Date.now(),
          });
          break;
        }
        case 'ROUND_HEADER':
          set({
            round: msg.round,
            phase: msg.phase,
            pools: null,
            tideReport: msg.tideReport,
            anchors: [],
            signals: [],
            myAnchor: null,
            myFleet: null,
            orderPending: false,
            finalOrderUsed: false,
            storm: null,
            verifyGlow: false, // the E3 glow lives only on the loss card itself
            lastLandfall: get().lastLandfall, // keep last result visible until next landfall
          });
          if (msg.round.surgeRound) audio.surgeCall();
          else audio.foghorn();
          break;
        case 'TIDE_REPORT':
          set({ tideReport: msg.tideReport, anchors: msg.anchors, signals: msg.signals });
          break;
        case 'FOG_STARTED':
          set({ tideReport: msg.tideReport, phase: msg.phase });
          audio.tick();
          break;
        case 'ANCHOR_ACK': {
          const fleet = msg.fleet ?? focusFleet(msg.zone, msg.stakeMinor);
          set({
            myAnchor: anchorFromFleet(fleet),
            myFleet: fleet,
            fleetMode: fleet.mode,
            orderPending: false,
            balanceMinor: msg.balanceMinor,
            lastAnchor: anchorFromFleet(fleet),
            lastFleet: fleet,
            finalOrderUsed: msg.finalOrderUsed ? true : get().finalOrderUsed,
            ...(msg.receipt ? { receipts: [...get().receipts.slice(-59), msg.receipt] } : {}),
          });
          audio.splash();
          break;
        }
        case 'CANCEL_ACK':
          set({
            myAnchor: null,
            myFleet: null,
            orderPending: false,
            balanceMinor: msg.balanceMinor,
            finalOrderUsed: msg.finalOrderUsed ? true : get().finalOrderUsed,
            ...(msg.receipt ? { receipts: [...get().receipts.slice(-59), msg.receipt] } : {}),
          });
          audio.click('down');
          break;
        case 'SIGNAL_UPDATE':
          set({ signals: msg.signals });
          break;
        case 'LOCK_SNAPSHOT':
          set({
            pools: msg.pools,
            anchors: msg.anchors,
            phase: msg.phase,
            orderPending: false,
            // B5 pre-check estimate: the last exact handle this room published.
            lastKnownHandleMinor: msg.pools.totalsMinor.reduce(
              (a: number, n: number) => a + n,
              0,
            ),
          });
          break;
        case 'ROOM_LIST':
          set({ rooms: msg.rooms });
          break;
        case 'STORM_PATH':
          set({ storm: { feints: msg.feints, endsAt: msg.phase.endsAt }, phase: msg.phase });
          audio.wind(Math.max(500, msg.phase.endsAt - Date.now()));
          break;
        case 'LANDFALL': {
          // E3 first-loss trust moment: the verify stamp glows ONCE per profile
          // on the first loss ≥ 10× the room min stake (ux-redesign-v2.md §6.3).
          let verifyGlow = get().verifyGlow;
          if (
            msg.yourResult.outcome === 'WRECKED' &&
            -msg.yourResult.netMinor >= 10 * get().roomMinStakeMinor &&
            localStorage.getItem('landfall.firstLossGlow') !== '1'
          ) {
            localStorage.setItem('landfall.firstLossGlow', '1');
            verifyGlow = true;
          }
          const card: ReplayCard = {
            roundId: msg.roundId,
            struckZone: msg.struckZone,
            replay: msg.replay,
            ...(msg.stormPower ? { stormPower: msg.stormPower } : {}),
            powerCapped: msg.powerCapped ?? false,
            ...(msg.surge ? { surge: msg.surge } : {}),
            at: Date.now(),
          };
          set({
            phase: msg.phase,
            orderPending: false,
            balanceMinor: msg.balanceMinor,
            wreckLog: msg.wreckLog,
            verifyGlow,
            // E2: the Wreck Log is a stack of the last 20 replay cards.
            replayCards: [...get().replayCards.slice(-19), card],
            lastLandfall: {
              roundId: msg.roundId,
              struckZone: msg.struckZone,
              seedHex: msg.seedHex,
              prevChainValue: msg.prevChainValue,
              results: msg.results,
              yourResult: msg.yourResult,
              replay: msg.replay,
              ...(msg.surge ? { surge: msg.surge } : {}),
              ...(msg.stormPower ? { stormPower: msg.stormPower } : {}),
              powerCapped: msg.powerCapped ?? false,
            },
          });
          // Audio sequencing: thunder scaled by Storm Power; reveal arpeggio for
          // Cat 3+; personal outcome cue after the blast clears.
          {
            const powerMult = msg.stormPower ? msg.stormPower.mNum / msg.stormPower.mDen : 1;
            audio.thunder(powerMult);
            const mine = msg.yourResult as { outcome: string; netMinor: number };
            const surge = msg.surge as { winnerName: string | null } | undefined;
            const myName = get().name;
            window.setTimeout(() => {
              if (powerMult >= 2) audio.powerReveal(powerMult);
              if (surge?.winnerName) {
                audio.fanfare(surge.winnerName === myName);
              }
              if (mine.outcome === 'SAFE') {
                audio.salvageBell(mine.netMinor >= 50_00 || powerMult >= 5);
              } else if (mine.outcome === 'WRECKED') {
                audio.wreckThud();
              }
            }, 750);
          }
          break;
        }
        case 'PHASE':
          set({
            phase: msg.phase,
            ...(msg.phase.phase === 'ANCHOR_OPEN' ? {} : { orderPending: false }),
          });
          break;
        case 'CHAT_MESSAGE':
          set({ chat: [...get().chat.slice(-99), msg.entry] });
          break;
        case 'SKIPPER_RECORD': {
          // E1: fill the open card only if it's still the record the user asked for.
          const open = get().skipperCard;
          if (open && open.name === msg.name) {
            set({ skipperCard: { name: msg.name, record: msg.record, loading: false } });
          }
          break;
        }
        case 'LIMITS_STATE':
          set({ limits: msg.limits });
          break;
        case 'REALITY_CHECK':
          // Calm by design (F1): no sound, no amber — just the facts.
          set({
            realityCheck: {
              elapsedMinutes: msg.elapsedMinutes,
              sessionNetMinor: msg.sessionNetMinor,
              at: msg.at,
            },
          });
          break;
        case 'SYSTEM_MESSAGE': {
          const kind = msg.text.includes('GOLDEN ANCHOR')
            ? ('golden' as const)
            : msg.text.includes('SURGE')
              ? ('surge' as const)
              : msg.text.includes('salvaged')
                ? ('salvage' as const)
                : ('info' as const);
          set({ events: [...get().events.slice(-99), { text: msg.text, at: msg.at, kind }] });
          break;
        }
        case 'ERROR':
          set({
            toast: msg.message,
            orderPending: false,
            // Signed rejection receipts (B1) join the order history too.
            ...(msg.receipt ? { receipts: [...get().receipts.slice(-59), msg.receipt] } : {}),
            // A rejected flag did not consume the B4 cooldown — undo the mirror.
            // (Only signal-specific codes: generic codes may belong to anchors.)
            ...(msg.code.startsWith('SIGNAL') || msg.code === 'FLAG_COOLDOWN'
              ? {
                  myFlagRounds: get().myFlagRounds.filter(
                    (r) => r !== get().round?.roundId,
                  ),
                }
              : {}),
          });
          break;
      }
    };
  }

  connect();

  return {
    connected: false,
    playerId: null,
    name: null,
    balanceMinor: 0,
    chainCommitment: null,
    round: null,
    phase: null,
    pools: null,
    tideReport: null,
    anchors: [],
    signals: [],
    myAnchor: null,
    myFleet: null,
    fleetMode: 'FOCUS',
    orderPending: false,
    finalOrderUsed: false,
    // D3: small default so a first-session player anchors a visible, low-risk stake.
    stakeInputMinor: 5_00,
    wreckLog: [],
    chat: [],
    events: [],
    storm: null,
    lastLandfall: null,
    toast: null,
    verifyRoundId: null,
    rulesOpen: false,
    flagPickerAt: null,
    lastAnchor: null,
    lastFleet: null,
    receipts: [],
    roomId: null,
    rooms: [],
    roomMinStakeMinor: MIN_STAKE_MINOR,
    roomMaxStakeMinor: MAX_STAKE_MINOR,
    whaleCapFraction: 1,
    lastKnownHandleMinor: null,
    myFlagRounds: [],
    replayCards: [],
    wreckLogOpen: false,
    skipperCard: null,
    limits: null,
    sessionStartAt: null,
    realityCheck: null,
    limitsOpen: false,
    verifyGlow: false,

    sendAnchor(zone) {
      const s = get();
      if (
        !s.connected ||
        s.phase?.phase !== 'ANCHOR_OPEN' ||
        s.finalOrderUsed ||
        s.orderPending
      ) {
        return;
      }
      // B5 whale-cap pre-check: estimate the room handle from the last exact
      // lock snapshot; warn locally before the server ever rejects. The server
      // stays authoritative — this only prevents surprise rejects.
      if (s.lastKnownHandleMinor !== null && s.whaleCapFraction < 1) {
        const othersEstimate = Math.max(
          0,
          s.lastKnownHandleMinor - (s.myFleet?.stakeMinor ?? 0),
        );
        const capEstimate = Math.floor(
          (s.whaleCapFraction / (1 - s.whaleCapFraction)) * othersEstimate,
        );
        if (s.stakeInputMinor > capEstimate) {
          set({
            toast: `A single fleet is capped at ${Math.round(s.whaleCapFraction * 100)}% of the round — about ${fmt(capEstimate)} in this room right now.`,
          });
          return;
        }
      }
      if (s.fleetMode === 'SPLIT') {
        const current = s.myFleet;
        let primaryZone = zone;
        let secondaryZone = oppositeZone(zone);
        if (current?.mode === 'SPLIT') {
          primaryZone = current.primaryZone;
          secondaryZone =
            zone === primaryZone ? (current.secondaryZone ?? oppositeZone(primaryZone)) : zone;
        } else if (current?.mode === 'FOCUS') {
          primaryZone = current.primaryZone;
          secondaryZone = zone === primaryZone ? oppositeZone(primaryZone) : zone;
        }
        if (secondaryZone === primaryZone) secondaryZone = oppositeZone(primaryZone);
        const sent = send(
          fleetOrderMessage({
            mode: 'SPLIT',
            primaryZone,
            secondaryZone,
            stakeMinor: s.stakeInputMinor,
          }),
        );
        if (sent) set({ orderPending: true });
        return;
      }
      if (send(fleetOrderMessage(focusFleet(zone, s.stakeInputMinor)))) {
        set({ orderPending: true });
      }
    },
    cancelOrder() {
      const s = get();
      if (
        !s.connected ||
        s.phase?.phase !== 'ANCHOR_OPEN' ||
        !s.myFleet ||
        s.finalOrderUsed ||
        s.orderPending
      ) {
        return;
      }
      if (send({ type: 'CANCEL_ORDER' })) set({ orderPending: true });
    },
    sendSignal(kind, zone) {
      const s = get();
      const target = zone ?? s.myFleet?.primaryZone ?? s.myAnchor?.zone;
      if (target === undefined) return;
      if (send({ type: 'SIGNAL', zone: target, kind })) {
        // Optimistic B4 cooldown mirror; reverted if the server rejects.
        const roundId = s.round?.roundId;
        if (roundId !== undefined && !s.myFlagRounds.includes(roundId)) {
          set({ myFlagRounds: [...s.myFlagRounds.slice(-9), roundId] });
        }
      }
    },
    /** Switch rooms (C1); any live order is refunded server-side first. */
    joinRoom(roomId) {
      const s = get();
      if (!s.connected || roomId === s.roomId) return;
      send({ type: 'JOIN_ROOM', roomId });
    },
    sendChat(text) {
      const trimmed = text.trim();
      if (trimmed) send({ type: 'CHAT', text: trimmed });
    },
    setFleetMode(mode) {
      set({ fleetMode: mode });
    },
    setStakeInput(minor) {
      set({ stakeInputMinor: minor });
    },
    openVerify(roundId) {
      set({ verifyRoundId: roundId, verifyGlow: false });
    },
    setRulesOpen(open) {
      set({ rulesOpen: open });
    },
    openFlagPicker(zone, x, y) {
      set({ flagPickerAt: { zone, x, y } });
    },
    closeFlagPicker() {
      set({ flagPickerAt: null });
    },
    /** Repeat last round's anchor (roulette-style rebet). */
    rebet() {
      const s = get();
      if (
        !s.connected ||
        s.phase?.phase !== 'ANCHOR_OPEN' ||
        s.finalOrderUsed ||
        s.orderPending
      ) {
        return;
      }
      const fallback = s.lastAnchor;
      const last =
        s.lastFleet ?? (fallback ? focusFleet(fallback.zone, fallback.stakeMinor) : null);
      if (!last) return;
      set({ stakeInputMinor: last.stakeMinor, fleetMode: last.mode });
      if (send(fleetOrderMessage(last))) set({ orderPending: true });
    },
    /** Roulette-style double: 2× the input; if already anchored, re-anchor same zone at 2×. */
    doubleStake() {
      const { stakeInputMinor, myFleet, roomMaxStakeMinor } = get();
      const base = myFleet?.stakeMinor ?? stakeInputMinor;
      const doubled = Math.min(roomMaxStakeMinor, base * 2);
      set({ stakeInputMinor: doubled });
    },
    dismissToast() {
      set({ toast: null });
    },
    /** E1: cosmetic record lookup — display only, never gameplay. */
    openSkipper(name) {
      set({ skipperCard: { name, record: null, loading: true } });
      send({ type: 'GET_SKIPPER', name });
    },
    closeSkipper() {
      set({ skipperCard: null });
    },
    setWreckLogOpen(open) {
      set({ wreckLogOpen: open });
    },
    sendLimits(patch) {
      send({ type: 'SET_LIMITS', ...patch });
    },
    sendExclusion(minutes) {
      send({ type: 'SET_EXCLUSION', minutes });
    },
    setLimitsOpen(open) {
      set({ limitsOpen: open });
    },
    dismissRealityCheck() {
      set({ realityCheck: null });
    },
  };
});

export const fmt = (minor: number) => (minor / 100).toFixed(2);
