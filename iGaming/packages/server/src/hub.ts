/**
 * WebSocket hub — session management + message routing.
 * Every inbound frame is Zod-validated reject-by-default (security-review.md §1.18).
 */
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { WebSocket, WebSocketServer } from 'ws';
import {
  STARTING_BALANCE_MINOR,
  clientMessage,
  type ChatEntry,
  type ServerMessage,
} from '@landfall/core';
import type { ChatService } from './chat.js';
import type { RoundCoordinator } from './coordinator.js';
import type { Db } from './db/index.js';
import { chatMessages, players } from './db/schema.js';
import { randomName } from './names.js';

interface Session {
  ws: WebSocket;
  playerId: string | null;
  name: string | null;
}

export class Hub {
  private sessions = new Set<Session>();

  constructor(
    private db: Db,
    private chat: ChatService,
    private chainCommitment: string,
  ) {}

  /** Wired after construction (hub and coordinator reference each other). */
  coordinator!: RoundCoordinator;

  attach(wss: WebSocketServer): void {
    wss.on('connection', (ws) => {
      const session: Session = { ws, playerId: null, name: null };
      this.sessions.add(session);
      ws.on('message', (raw) => this.onMessage(session, raw.toString()));
      ws.on('close', () => this.sessions.delete(session));
      ws.on('error', () => this.sessions.delete(session));
    });
  }

  broadcast(msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const s of this.sessions) {
      if (s.playerId && s.ws.readyState === s.ws.OPEN) s.ws.send(data);
    }
  }

  sendToPlayer(playerId: string, msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const s of this.sessions) {
      if (s.playerId === playerId && s.ws.readyState === s.ws.OPEN) s.ws.send(data);
    }
  }

  broadcastLandfall(build: (playerId: string) => unknown): void {
    for (const s of this.sessions) {
      if (s.playerId && s.ws.readyState === s.ws.OPEN) {
        s.ws.send(JSON.stringify(build(s.playerId)));
      }
    }
  }

  systemMessage(text: string): void {
    this.broadcast({ type: 'SYSTEM_MESSAGE', text, at: Date.now() } satisfies ServerMessage);
  }

  private onMessage(session: Session, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.error(session, 'BAD_JSON', 'Malformed message.');
    }
    const result = clientMessage.safeParse(parsed);
    if (!result.success) {
      return this.error(session, 'BAD_SCHEMA', 'Message failed validation.');
    }
    const msg = result.data;

    if (msg.type === 'HELLO') return this.onHello(session, msg.playerId);

    if (!session.playerId || !session.name) {
      return this.error(session, 'NO_HELLO', 'Say HELLO first.');
    }

    switch (msg.type) {
      case 'ANCHOR': {
        const r = this.coordinator.anchor(session.playerId, session.name, msg.zone, msg.stakeMinor);
        if (r.ok) {
          this.send(session, {
            type: 'ANCHOR_ACK',
            zone: msg.zone,
            stakeMinor: msg.stakeMinor,
            balanceMinor: r.balanceMinor,
            finalOrderUsed: r.finalOrderUsed,
            fleet: r.fleet,
          });
        } else {
          this.error(session, r.code, r.message);
        }
        break;
      }
      case 'FLEET_ORDER': {
        const r = this.coordinator.fleetOrder(
          session.playerId,
          session.name,
          msg.mode,
          msg.primaryZone,
          msg.secondaryZone ?? null,
          msg.stakeMinor,
        );
        if (r.ok) {
          this.send(session, {
            type: 'ANCHOR_ACK',
            zone: r.fleet.primaryZone,
            stakeMinor: r.fleet.stakeMinor,
            balanceMinor: r.balanceMinor,
            finalOrderUsed: r.finalOrderUsed,
            fleet: r.fleet,
          });
        } else {
          this.error(session, r.code, r.message);
        }
        break;
      }
      case 'CANCEL_ORDER': {
        const r = this.coordinator.cancelOrder(session.playerId);
        if (r.ok) {
          this.send(session, {
            type: 'CANCEL_ACK',
            balanceMinor: r.balanceMinor,
            finalOrderUsed: r.finalOrderUsed,
            refundMinor: r.refundMinor,
          });
        } else {
          this.error(session, r.code, r.message);
        }
        break;
      }
      case 'SIGNAL': {
        const r = this.coordinator.signal(session.playerId, session.name, msg.zone, msg.kind);
        if (!r.ok) this.error(session, r.code, r.message);
        break;
      }
      case 'CHAT': {
        const r = this.chat.submit(session.playerId, session.name, msg.text);
        if (r.ok) {
          this.broadcast({ type: 'CHAT_MESSAGE', entry: r.entry } satisfies ServerMessage);
        } else {
          this.error(session, r.code, r.message);
        }
        break;
      }
    }
  }

  private onHello(session: Session, claimedId?: string): void {
    let player = claimedId
      ? this.db.select().from(players).where(eq(players.id, claimedId)).get()
      : undefined;
    if (player?.isHouse) player = undefined; // nobody resumes the house

    if (!player) {
      let name = randomName();
      while (this.db.select().from(players).where(eq(players.name, name)).get()) {
        name = `${randomName()}${Math.floor(Math.random() * 90 + 10)}`;
      }
      player = {
        id: randomUUID(),
        name,
        balanceMinor: STARTING_BALANCE_MINOR,
        isHouse: false,
        createdAt: Date.now(),
      };
      this.db.insert(players).values(player).run();
    }

    session.playerId = player.id;
    session.name = player.name;
    const phase = this.coordinator.phaseInfo();

    const chatTail: ChatEntry[] = this.db
      .select()
      .from(chatMessages)
      .orderBy(desc(chatMessages.id))
      .limit(30)
      .all()
      .reverse()
      .map((m) => ({ name: m.name, text: m.text, at: m.createdAt }));

    this.send(session, {
      type: 'WELCOME',
      playerId: player.id,
      name: player.name,
      balanceMinor: player.balanceMinor,
      chainCommitment: this.chainCommitment,
      houseSeedMinor: this.coordinator.roundHeader().houseSeedMinor,
      round: this.coordinator.roundHeader(),
      phase,
      ...(phase.phase === 'ANCHOR_OPEN' ? {} : { pools: this.coordinator.poolsState() }),
      tideReport: this.coordinator.tideReportState(),
      anchors: this.coordinator.anchorsPublic(phase.phase !== 'ANCHOR_OPEN'),
      signals: this.coordinator.signalsPublic(),
      yourAnchor: this.coordinator.yourAnchor(player.id),
      yourFleet: this.coordinator.yourFleet(player.id),
      wreckLog: this.coordinator.wreckLogState(),
      chatTail,
    });
  }

  private send(session: Session, msg: ServerMessage): void {
    if (session.ws.readyState === session.ws.OPEN) session.ws.send(JSON.stringify(msg));
  }

  private error(session: Session, code: string, message: string): void {
    this.send(session, { type: 'ERROR', code, message });
  }
}
