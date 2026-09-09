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
  CosmeticDraw,
  EnvironmentSpec,
  EventTierSpec,
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
import { resolveStakeLimit, type StakeLimitInput } from './stakeLimits';
import { liveMaxNotice } from './strings';
import { tableSwitchReset } from './tableSwitch';
import { nextWelcomeOpen } from './welcomeGate';

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
  /** v4 presentation draws, echoed so the result card can name the round. */
  eventTier?: EventTierSpec;
  environment?: EnvironmentSpec;
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
  /**
   * How loud this reveal is (v4). Drawn server-side from its own HMAC domain
   * and published with the storm; the client only ever READS it to choose how
   * many sweeps to play and how hard the board shakes. Undefined on a server
   * that predates the field, in which case the reveal runs its calm form.
   */
  eventTier?: EventTierSpec;
  /** Deterministic visual jitter. Touches the canvas and nothing else. */
  cosmetic?: CosmeticDraw;
}

/**
 * One settled round from THIS session, as it affected this player. Feeds the
 * telemetry rail's session curve.
 *
 * This exists for the player, not for the product: a running, honest session
 * P&L is the same disclosure the F1 reality check makes, shown continuously
 * instead of on a timer. It is deliberately never smoothed, never reset by a
 * win, and never hidden while it is negative.
 */
export interface SessionPoint {
  roundId: number;
  /** Signed credits this round moved for this player (0 when sitting out). */
  netMinor: number;
  /** Running session total after this round. */
  cumulativeMinor: number;
  balanceMinor: number;
  played: boolean;
}

/** Rounds kept in the session curve — roughly 20 minutes of play at 20s rounds. */
const SESSION_SERIES_MAX = 60;

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
  /** Guaranteed table liquidity — half of the publicly derivable round-share cap. */
  roomLiquidityFloorMinor: number;
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
  /**
   * v3 §8/P0-1 — the zone tapped but NOT yet committed (Focus/beginner path).
   * A tap selects; the Place Bet button commits. Null once a bet is placed or
   * the round turns over. Never sent to the server on its own.
   */
  selectedZone: number | null;
  /** v3 §7 — expert opt-in: a zone tap bets instantly (skips the select step). */
  quickBet: boolean;
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
  /**
   * This round's cosmetic board skin (v4), from `landfall:environment:<round>`.
   * Independent of the harbor draw, of `round.weather` (the MECHANICAL
   * modifier) and of everything the player does.
   */
  environment: EnvironmentSpec | null;
  lastLandfall: LandfallInfo | null;
  toast: string | null;
  /**
   * Whether the toast is a refusal or just news. A refund notice styled like a
   * rejection teaches players that the game is angry at them for switching
   * tables, which is the opposite of what happened.
   */
  toastTone: 'error' | 'info';
  verifyRoundId: number | null; // open verify modal for this round
  rulesOpen: boolean;
  /**
   * Entry gate: the welcome + table-choice screen shown before the first bet of
   * a session. Lives in the store (not local component state) because the bay's
   * 1–6 keyboard shortcuts and the table intro must both stand down while it
   * is up — otherwise a number key would place a bet behind the modal.
   */
  welcomeOpen: boolean;
  /**
   * The table the entry gate confirmed. The gate already names that table and
   * its rules on the way in, so TableIntro must not introduce it a second time
   * the moment the modal closes.
   */
  welcomeChoseRoomId: string | null;
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
  /** This session's settled rounds, oldest first — the telemetry session curve. */
  sessionSeries: SessionPoint[];
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
  /**
   * v3 P0-1 — the tap handler. Selects a zone (Focus, no bet yet) OR bets
   * immediately when a bet is already placed (Move), in Split mode, or when
   * Quick bet is on.
   */
  selectZone(zone: number): void;
  /** v3 P0-1 — commit the currently selected zone via sendAnchor. */
  commitBet(): void;
  /** v3 §7 — toggle expert quick-bet (persisted). */
  setQuickBet(on: boolean): void;
  /** Withdraw the active fleet order before lock; the full stake is refunded. */
  cancelOrder(): void;
  /** Confirm the table chosen on the entry gate and start playing. */
  dismissWelcome(roomId: string): void;
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

/** The store's view of everything ./stakeLimits needs. One place, one formula. */
export function stakeLimitInput(s: {
  balanceMinor: number;
  roomMinStakeMinor: number;
  roomMaxStakeMinor: number;
  whaleCapFraction: number;
  roomLiquidityFloorMinor: number;
  round: RoundHeader | null;
}): StakeLimitInput {
  return {
    balanceMinor: s.balanceMinor,
    roomMinStakeMinor: s.roomMinStakeMinor,
    roomMaxStakeMinor: s.roomMaxStakeMinor,
    whaleCapFraction: s.whaleCapFraction,
    liquidityFloorMinor: s.roomLiquidityFloorMinor,
    houseSeedMinor: s.round?.houseSeedMinor ?? 0,
  };
}

let ws: WebSocket | null = null;
let welcomeSettled = false; // see welcomeGate.ts for why this latch exists

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

          // Table-scoped state is dropped on a switch; see ./tableSwitch.ts for
          // the rule and the reason each field is on that list.
          const previousRoomId = get().roomId;
          const roomScopedReset =
            tableSwitchReset({
              previousRoomId,
              previousRoomName: get().rooms.find((r) => r.roomId === previousRoomId)?.name ?? null,
              nextRoomId: msg.roomId,
              nextRoomName:
                (msg.rooms as RoomInfo[]).find((r) => r.roomId === msg.roomId)?.name ?? null,
              liveStakeMinor: get().myFleet?.stakeMinor ?? 0,
              stakeInputMinor: get().stakeInputMinor,
              nextMinStakeMinor: msg.minStakeMinor,
              nextMaxStakeMinor: msg.maxStakeMinor,
              formatCredits: fmt,
            }) ?? {};

          set({
            welcomeOpen: nextWelcomeOpen({
              settled: welcomeSettled,
              hasLiveFleet: fleet !== null,
              currentlyOpen: get().welcomeOpen,
            }),
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
            roomLiquidityFloorMinor: msg.liquidityFloorMinor ?? 0,
            round: msg.round,
            phase: msg.phase,
            environment: msg.round?.environment ?? null,
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
            ...roomScopedReset,
          });
          welcomeSettled = true;
          break;
        }
        case 'ROUND_HEADER':
          set({
            round: msg.round,
            phase: msg.phase,
            environment: msg.round?.environment ?? null,
            pools: null,
            tideReport: msg.tideReport,
            anchors: [],
            signals: [],
            myAnchor: null,
            myFleet: null,
            orderPending: false,
            finalOrderUsed: false,
            selectedZone: null, // new round — nothing selected yet (P0-1)
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
            selectedZone: null, // committed — clear the pending selection (P0-1)
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
          });
          break;
        case 'ROOM_LIST':
          set({ rooms: msg.rooms });
          break;
        case 'STORM_PATH':
          set({
            storm: {
              feints: msg.feints,
              endsAt: msg.phase.endsAt,
              ...(msg.eventTier ? { eventTier: msg.eventTier } : {}),
              ...(msg.cosmetic ? { cosmetic: msg.cosmetic } : {}),
            },
            phase: msg.phase,
          });
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
          // Session curve: every settled round is a point, including the ones
          // sat out (they flatten the line, which is the truth).
          const prevSeries = get().sessionSeries;
          const prevCumulative = prevSeries.at(-1)?.cumulativeMinor ?? 0;
          const played = msg.yourResult.outcome !== 'SPECTATOR';
          const point: SessionPoint = {
            roundId: msg.roundId,
            netMinor: played ? msg.yourResult.netMinor : 0,
            cumulativeMinor: prevCumulative + (played ? msg.yourResult.netMinor : 0),
            balanceMinor: msg.balanceMinor,
            played,
          };

          set({
            phase: msg.phase,
            orderPending: false,
            balanceMinor: msg.balanceMinor,
            wreckLog: msg.wreckLog,
            verifyGlow,
            sessionSeries: [...prevSeries.slice(-(SESSION_SERIES_MAX - 1)), point],
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
              ...(msg.eventTier ? { eventTier: msg.eventTier } : {}),
              ...(msg.environment ? { environment: msg.environment } : {}),
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
            toastTone: 'error',
            orderPending: false,
            // Signed rejection receipts (B1) join the order history too.
            ...(msg.receipt ? { receipts: [...get().receipts.slice(-59), msg.receipt] } : {}),
            // A rejected flag did not consume the B4 cooldown — undo the mirror.
            // (Only signal-specific codes: generic codes may belong to anchors.)
            ...(msg.code.startsWith('SIGNAL') || msg.code === 'FLAG_COOLDOWN'
              ? {
                  myFlagRounds: get().myFlagRounds.filter((r) => r !== get().round?.roundId),
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
    environment: null,
    pools: null,
    tideReport: null,
    anchors: [],
    signals: [],
    myAnchor: null,
    myFleet: null,
    fleetMode: 'FOCUS',
    selectedZone: null,
    quickBet: (() => {
      try {
        return window.localStorage.getItem('landfall.quickBet') === '1';
      } catch {
        return false;
      }
    })(),
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
    toastTone: 'error',
    verifyRoundId: null,
    rulesOpen: false,
    welcomeOpen: false,
    welcomeChoseRoomId: null,
    flagPickerAt: null,
    lastAnchor: null,
    lastFleet: null,
    receipts: [],
    sessionSeries: [],
    roomId: null,
    rooms: [],
    roomMinStakeMinor: MIN_STAKE_MINOR,
    roomMaxStakeMinor: MAX_STAKE_MINOR,
    whaleCapFraction: 1,
    roomLiquidityFloorMinor: 0,
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
      if (!s.connected || s.phase?.phase !== 'ANCHOR_OPEN' || s.finalOrderUsed || s.orderPending) {
        return;
      }
      // B5 pre-check, derived exactly as the server derives it (./stakeLimits).
      // The server stays authoritative; this is here so the refusal is never a
      // surprise, and so the number the deck showed is the number that lands.
      const limit = resolveStakeLimit(stakeLimitInput(s));
      if (s.stakeInputMinor > limit.maxMinor) {
        set({ toastTone: 'error', toast: liveMaxNotice(limit.maxMinor) });
        return;
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
    /**
     * v3 P0-1 — the unified tap handler. A tap SELECTS a zone (the beginner
     * Focus path) so the big Place Bet button is what actually commits money.
     * It falls through to an immediate bet when there is nothing to gain from
     * the two-step flow: moving an already-placed bet, Split mode (an advanced,
     * later-unlocked feature that builds its pair server-side), or the expert
     * Quick-bet opt-in.
     */
    selectZone(zone) {
      const s = get();
      if (!s.connected || s.phase?.phase !== 'ANCHOR_OPEN' || s.orderPending) return;
      if (s.myFleet || s.quickBet || s.fleetMode === 'SPLIT') {
        s.sendAnchor(zone);
        return;
      }
      set({ selectedZone: zone });
    },
    /** v3 P0-1 — commit the pending selection. */
    commitBet() {
      const s = get();
      if (s.selectedZone === null) return;
      s.sendAnchor(s.selectedZone);
    },
    setQuickBet(on) {
      try {
        window.localStorage.setItem('landfall.quickBet', on ? '1' : '0');
      } catch {
        // storage disabled — the pref resets next session, harmless
      }
      set({ quickBet: on });
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
    /**
     * Confirm the entry gate. The server has already seated the player (in the
     * busiest room they can afford), so this only sends JOIN_ROOM when they
     * actually picked a different table.
     */
    dismissWelcome(roomId) {
      const s = get();
      if (s.connected && roomId !== s.roomId) send({ type: 'JOIN_ROOM', roomId });
      set({ welcomeOpen: false, welcomeChoseRoomId: roomId });
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
      if (!s.connected || s.phase?.phase !== 'ANCHOR_OPEN' || s.finalOrderUsed || s.orderPending) {
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
