import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetPlanPublic } from '@landfall/core';

vi.mock('../src/audio/engine', () => ({ audio: new Proxy({}, { get: () => () => {} }) }));

class MockSocket {
  static OPEN = 1;
  static instances: MockSocket[] = [];
  readyState = 1;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() {
    MockSocket.instances.push(this);
  }
  send(value: string) {
    this.sent.push(JSON.parse(value));
  }
  emit(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

const fleet: FleetPlanPublic = {
  mode: 'FOCUS',
  primaryZone: 1,
  secondaryZone: null,
  stakeMinor: 500,
};
const round = { roundId: 10, houseSeedMinor: 5_000, surgeRound: false };
const phase = { phase: 'ANCHOR_OPEN' as const, endsAt: 20_000 };
const rooms = [
  { roomId: 'a', name: 'First', minStakeMinor: 100, maxStakeMinor: 5_000 },
  { roomId: 'b', name: 'Second', minStakeMinor: 100, maxStakeMinor: 5_000 },
];

let store: typeof import('../src/store').useStore;
let socket: MockSocket;
function welcome(patch: Record<string, unknown> = {}) {
  socket.emit({
    type: 'WELCOME',
    playerId: 'p1',
    name: 'Player',
    balanceMinor: 10_000,
    roomId: 'a',
    rooms,
    minStakeMinor: 100,
    maxStakeMinor: 5_000,
    whaleCapFraction: 1,
    round,
    phase,
    tideReport: null,
    anchors: [],
    signals: [],
    wreckLog: [],
    chatTail: [],
    ...patch,
  });
}
function landfall(patch: Record<string, unknown> = {}) {
  socket.emit({
    type: 'LANDFALL',
    roundId: 10,
    struckZone: 0,
    yourResult: { outcome: 'SAFE', netMinor: 125 },
    balanceMinor: 10_125,
    wreckLog: [0],
    phase: { phase: 'RESOLVED', endsAt: 25_000 },
    results: [],
    replay: {},
    ...patch,
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  MockSocket.instances = [];
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('window', { localStorage, setTimeout });
  vi.stubGlobal('location', { protocol: 'http:', host: 'test.local' });
  vi.stubGlobal('WebSocket', MockSocket);
  store = (await import('../src/store')).useStore;
  socket = MockSocket.instances[0]!;
  welcome();
  store.setState({ welcomeOpen: false });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('explicit simple orders', () => {
  it('starts a high-tier table at its minimum instead of keeping an invalid small draft', () => {
    store.setState({ roomId: null, stakeInputMinor: 500 });
    welcome({ minStakeMinor: 500_000, maxStakeMinor: 50_000_000, balanceMinor: 5_000_000 });
    expect(store.getState().stakeInputMinor).toBe(500_000);
    expect(socket.sent).toEqual([]);
  });
  it('clamps a table-switch draft to the live liquidity cap, not just the table maximum', () => {
    store.setState({ stakeInputMinor: 500_000 });
    welcome({
      roomId: 'b',
      minStakeMinor: 100,
      maxStakeMinor: 5_000,
      whaleCapFraction: 0.25,
      liquidityFloorMinor: 9_000,
      round: { ...round, houseSeedMinor: 100 },
    });
    expect(store.getState().stakeInputMinor).toBe(3_000);
    expect(socket.sent).toEqual([]);
  });
  it.each(['quick bet', 'split', 'existing fleet'])(
    'selects without sending with %s enabled',
    (mode) => {
      store.setState({
        quickBet: mode === 'quick bet',
        fleetMode: mode === 'split' ? 'SPLIT' : 'FOCUS',
        myFleet: mode === 'existing fleet' ? fleet : null,
        myFleetRoundId: mode === 'existing fleet' ? 10 : null,
      });
      store.getState().selectSimpleZone(3);
      expect(store.getState().selectedZone).toBe(3);
      expect(socket.sent).toEqual([]);
      store.getState().commitSimpleBet();
      expect(socket.sent).toEqual([
        { type: 'FLEET_ORDER', mode: 'FOCUS', primaryZone: 3, stakeMinor: 500 },
      ]);
      store.getState().commitSimpleBet();
      expect(socket.sent).toHaveLength(1);
    },
  );
  it('requires an explicit press to update a stake and can reuse already committed credits', () => {
    welcome({ yourFleet: fleet, balanceMinor: 100 });
    store.getState().setStakeInput(600);
    expect(socket.sent).toEqual([]);
    expect(store.getState().myFleet?.stakeMinor).toBe(500);
    store.getState().commitSimpleBet();
    expect(socket.sent).toEqual([
      { type: 'FLEET_ORDER', mode: 'FOCUS', primaryZone: 1, stakeMinor: 600 },
    ]);
  });
  it('does not spend the last order on confirming an unchanged bet', () => {
    welcome({ yourFleet: fleet });
    store.getState().commitSimpleBet();
    expect(socket.sent).toEqual([]);
  });
  it('honors restored final-order use, connection state, and the exact lock deadline', () => {
    welcome({ yourFleet: fleet, finalOrderUsed: true });
    expect(store.getState().finalOrderUsed).toBe(true);
    store.setState({ selectedZone: 3 });
    store.getState().commitSimpleBet();
    store.setState({ finalOrderUsed: false, connected: false });
    store.getState().commitSimpleBet();
    store.setState({ connected: true, phase: { ...phase, endsAt: 10_000 } });
    store.getState().commitSimpleBet();
    expect(socket.sent).toEqual([]);
  });
  it.each([NaN, 0, 99, 5_001, 100.5])('refuses invalid or out-of-limit amount %s', (amount) => {
    store.getState().selectSimpleZone(3);
    store.getState().setStakeInput(amount);
    store.getState().commitSimpleBet();
    expect(socket.sent).toEqual([]);
    expect(store.getState().toast).toBeTruthy();
  });
  it('does not allow the minimum-stake floor to disguise an insufficient balance', () => {
    store.setState({ selectedZone: 3, balanceMinor: 50, stakeInputMinor: 100 });
    store.getState().commitSimpleBet();
    expect(socket.sent).toEqual([]);
  });
});

describe('settlement receipt lifecycle', () => {
  it('keeps the actual acknowledged receipt after new headers and spectator results', () => {
    socket.emit({ type: 'ANCHOR_ACK', fleet, balanceMinor: 9_500, receipt: { roundId: 10 } });
    landfall();
    const receipt = store.getState().lastPersonalLandfall;
    expect(receipt?.yourFleet).toEqual(fleet);
    socket.emit({
      type: 'ROUND_HEADER',
      round: { ...round, roundId: 11 },
      phase,
      tideReport: null,
    });
    expect(store.getState().lastLandfall).toBe(receipt);
    landfall({ roundId: 11, yourResult: { outcome: 'SPECTATOR', netMinor: 0 } });
    expect(store.getState().lastPersonalLandfall).toBe(receipt);
    expect(store.getState().lastLandfall?.yourFleet).toBeNull();
  });
  it('does not infer a stake from a prior lastFleet after reconnect', () => {
    store.setState({ lastFleet: fleet });
    landfall();
    expect(store.getState().lastLandfall?.yourFleet).toBeUndefined();
  });
  it('ignores stale acknowledged orders from another round', () => {
    socket.emit({ type: 'ANCHOR_ACK', fleet, balanceMinor: 9_500, receipt: { roundId: 9 } });
    expect(store.getState().myFleet).toBeNull();
  });
  it('blocks table switches with pending or accepted bets and clears receipts after a settled switch', () => {
    store.setState({ orderPending: true });
    store.getState().joinRoom('b');
    expect(socket.sent).toEqual([]);
    welcome({ yourFleet: fleet });
    store.getState().joinRoom('b');
    expect(socket.sent).toEqual([]);
    landfall();
    store.getState().joinRoom('b');
    expect(socket.sent).toEqual([{ type: 'JOIN_ROOM', roomId: 'b' }]);
    welcome({ roomId: 'b' });
    expect(store.getState().lastPersonalLandfall).toBeNull();
  });
});
