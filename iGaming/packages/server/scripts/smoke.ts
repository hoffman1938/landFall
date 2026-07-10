/**
 * Integration smoke test: two players anchor on different harbors, a full round
 * resolves, and the outcome is re-verified with @landfall/core's verifyRound.
 *
 * Usage: start the server with LANDFALL_FAST=1, then `pnpm exec tsx scripts/smoke.ts`.
 * Exits 0 only if: both anchors registered, chat was delivered cross-client,
 * settlement outcomes are consistent, and the cryptographic verification passes.
 */
import WebSocket from 'ws';
import { verifyRound } from '@landfall/core';

const URL = 'ws://localhost:8787/ws';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TestClient {
  ws: WebSocket;
  serverName?: string;
  playerId?: string;
  phase?: { phase: string; endsAt: number };
  roundId?: number;
  ackRound?: number;
  landfalls: any[];
  errors: any[];
  chat: any[];
}

function client(): TestClient {
  const ws = new WebSocket(URL);
  const state: TestClient = { ws, landfalls: [], errors: [], chat: [] };
  ws.on('open', () => ws.send(JSON.stringify({ type: 'HELLO' })));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    switch (msg.type) {
      case 'WELCOME':
        state.playerId = msg.playerId;
        state.serverName = msg.name;
        state.phase = msg.phase;
        state.roundId = msg.round.roundId;
        break;
      case 'ROUND_HEADER':
        state.phase = msg.phase;
        state.roundId = msg.round.roundId;
        break;
      case 'PHASE':
      case 'LOCK_SNAPSHOT':
      case 'STORM_PATH':
        state.phase = msg.phase;
        break;
      case 'ANCHOR_ACK':
        state.ackRound = state.roundId;
        break;
      case 'LANDFALL':
        state.landfalls.push(msg);
        state.phase = msg.phase;
        break;
      case 'ERROR':
        state.errors.push(msg);
        break;
      case 'CHAT_MESSAGE':
        state.chat.push(msg.entry);
        break;
    }
  });
  return state;
}

function fail(msg: string): never {
  console.error(`SMOKE TEST FAIL: ${msg}`);
  process.exit(1);
}

const a = client();
const b = client();
await sleep(800);
if (!a.playerId || !b.playerId) fail('WELCOME not received');
console.log(`players: ${a.serverName}, ${b.serverName}`);

// Anchor whenever an ANCHOR_OPEN window is live; retry each tick until acked.
for (let i = 0; i < 200 && (!a.ackRound || !b.ackRound); i++) {
  if (a.phase?.phase === 'ANCHOR_OPEN' && Date.now() < a.phase.endsAt - 500) {
    if (!a.ackRound) a.ws.send(JSON.stringify({ type: 'ANCHOR', zone: 2, stakeMinor: 2000 }));
    if (!b.ackRound) b.ws.send(JSON.stringify({ type: 'ANCHOR', zone: 5, stakeMinor: 1000 }));
  }
  await sleep(200);
}
if (!a.ackRound || !b.ackRound) fail(`anchors not acked (errors: ${JSON.stringify(a.errors)})`);
const anchoredRound = a.ackRound;
console.log(`anchored in round ${anchoredRound} (A: zone 2 / 20.00, B: zone 5 / 10.00)`);

a.ws.send(JSON.stringify({ type: 'CHAT', text: 'good luck out there' }));

// Wait for THAT round's landfall.
let lf: any;
for (let i = 0; i < 150 && !lf; i++) {
  lf = a.landfalls.find((l) => l.roundId === anchoredRound);
  await sleep(200);
}
if (!lf) fail('no LANDFALL for the anchored round');
console.log(`LANDFALL round ${lf.roundId}: struck zone ${lf.struckZone}`);
console.log(`A result: ${JSON.stringify(lf.yourResult)} | results: ${JSON.stringify(lf.results)}`);

if (lf.yourResult.outcome === 'SPECTATOR') fail('A anchored but resolved as SPECTATOR');
if (lf.results.length !== 2) fail(`expected 2 player results, got ${lf.results.length}`);

// Outcome consistency: wrecked iff on struck zone.
const aExpected = lf.struckZone === 2 ? 'WRECKED' : 'SAFE';
if (lf.yourResult.outcome !== aExpected) fail(`A outcome ${lf.yourResult.outcome} != ${aExpected}`);
if (aExpected === 'WRECKED' && lf.yourResult.netMinor !== -2000) fail('wrong wrecked net');
if (aExpected === 'SAFE' && lf.yourResult.netMinor <= 0) fail('SAFE should net positive salvage');

// Chat delivered cross-client (b must see a's message).
if (!b.chat.some((c) => c.text === 'good luck out there')) fail('chat not delivered to B');

// Cryptographic + arithmetic verification from the public record.
const rec = await (await fetch(`http://localhost:8787/api/round/${anchoredRound}`)).json();
const v = verifyRound({
  roundId: rec.roundId,
  seedHex: rec.seedHex,
  prevChainValue: rec.prevChainValue,
  announcedStruckZone: rec.struckZone,
  zoneCount: rec.zoneCount,
  rake: rec.rake,
  stakes: rec.lockSnapshot,
});
console.log(`verifyRound: chainOk=${v.chainOk} drawOk=${v.drawOk} (u=${v.u.toFixed(6)})`);
if (!v.allOk) fail('cryptographic verification failed');

const handle = rec.lockSnapshot.reduce((s: number, e: any) => s + e.amountMinor, 0);
console.log(
  `handle ${handle} minor units across ${rec.lockSnapshot.length} stakes — conserved by core assert`,
);

console.log('SMOKE TEST PASS');
a.ws.close();
b.ws.close();
process.exit(0);
