/**
 * WebSocket hub — session management + message routing, room-scoped (C1).
 * Every inbound frame is Zod-validated reject-by-default (security-review.md §1.18).
 * Each session belongs to exactly one room; broadcasts, tide reports, chat and
 * landfall payloads never cross rooms.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { WebSocket, WebSocketServer } from 'ws';
import {
  STARTING_BALANCE_MINOR,
  clientMessage,
  type ActionReceipt,
  type ChatEntry,
  type RoomInfo,
  type ServerMessage,
} from '@landfall/core';
import type { ChatService } from './chat.js';
import type { RoundCoordinator } from './coordinator.js';
import type { Db } from './db/index.js';
import type { RoomManager } from './rooms.js';
import { chatMessages, players } from './db/schema.js';
import { randomName } from './names.js';

interface Session {
  ws: WebSocket;
  playerId: string | null;
  name: string | null;
  roomId: string | null;
}

export class Hub {
  private sessions = new Set<Session>();

  constructor(
    private db: Db,
    private chat: ChatService,
    private chainCommitment: string,
  ) {}

  /** Wired after construction (hub and rooms reference each other). */
  rooms!: RoomManager;

  attach(wss: WebSocketServer): void {
    wss.on('connection', (ws) => {
      const session: Session = { ws, playerId: null, name: null, roomId: null };
      this.sessions.add(session);
      ws.on('message', (raw) => this.onMessage(session, raw.toString()));
      ws.on('close', () => {
        this.sessions.delete(session);
        this.broadcastRoomList();
      });
      ws.on('error', () => this.sessions.delete(session));
    });
  }

  /** Room-scoped broadcast: only sessions in `roomId` receive it. */
  broadcastToRoom(roomId: string, msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const s of this.sessions) {
      if (s.playerId && s.roomId === roomId && s.ws.readyState === s.ws.OPEN) s.ws.send(data);
    }
  }

  sendToPlayerInRoom(roomId: string, playerId: string, msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const s of this.sessions) {
      if (
        s.playerId === playerId &&
        s.roomId === roomId &&
        s.ws.readyState === s.ws.OPEN
      ) {
        s.ws.send(data);
      }
    }
  }

  broadcastLandfallToRoom(roomId: string, build: (playerId: string) => unknown): void {
    for (const s of this.sessions) {
      if (s.playerId && s.roomId === roomId && s.ws.readyState === s.ws.OPEN) {
        s.ws.send(JSON.stringify(build(s.playerId)));
      }
    }
  }

  systemMessageToRoom(roomId: string, text: string): void {
    this.broadcastToRoom(roomId, {
      type: 'SYSTEM_MESSAGE',
      text,
      at: Date.now(),
    } satisfies ServerMessage);
  }

  /** Lobby data (C1/C2): real human counts only — bots are never population. */
  roomList(): RoomInfo[] {
    const counts = new Map<string, number>();
    for (const s of this.sessions) {
      if (s.playerId && s.roomId) counts.set(s.roomId, (counts.get(s.roomId) ?? 0) + 1);
    }
    return [...this.rooms.rooms.values()].map((room) => ({
      roomId: room.cfg.roomId,
      name: room.cfg.name,
      minStakeMinor: room.cfg.minStakeMinor,
      maxStakeMinor: room.cfg.maxStakeMinor,
      humanCount: counts.get(room.cfg.roomId) ?? 0,
      botsAllowed: room.cfg.botsAllowed,
    }));
  }

  private broadcastRoomList(): void {
    const msg = JSON.stringify({ type: 'ROOM_LIST', rooms: this.roomList() } satisfies ServerMessage);
    for (const s of this.sessions) {
      if (s.playerId && s.ws.readyState === s.ws.OPEN) s.ws.send(msg);
    }
  }

  private roomOf(session: Session): RoundCoordinator | null {
    return session.roomId ? (this.rooms.get(session.roomId) ?? null) : null;
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
    const room = this.roomOf(session);
    if (!room) return this.error(session, 'NO_ROOM', 'Not in a room.');

    switch (msg.type) {
      case 'JOIN_ROOM': {
        this.joinRoom(session, msg.roomId);
        break;
      }
      case 'ANCHOR': {
        const r = room.anchor(session.playerId, session.name, msg.zone, msg.stakeMinor);
        if (r.ok) {
          this.send(session, {
            type: 'ANCHOR_ACK',
            zone: msg.zone,
            stakeMinor: msg.stakeMinor,
            balanceMinor: r.balanceMinor,
            finalOrderUsed: r.finalOrderUsed,
            fleet: r.fleet,
            receipt: r.receipt,
          });
        } else {
          this.error(session, r.code, r.message, r.receipt);
        }
        break;
      }
      case 'FLEET_ORDER': {
        const r = room.fleetOrder(
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
            receipt: r.receipt,
          });
        } else {
          this.error(session, r.code, r.message, r.receipt);
        }
        break;
      }
      case 'CANCEL_ORDER': {
        const r = room.cancelOrder(session.playerId);
        if (r.ok) {
          this.send(session, {
            type: 'CANCEL_ACK',
            balanceMinor: r.balanceMinor,
            finalOrderUsed: r.finalOrderUsed,
            refundMinor: r.refundMinor,
            receipt: r.receipt,
          });
        } else {
          this.error(session, r.code, r.message, r.receipt);
        }
        break;
      }
      case 'SIGNAL': {
        const r = room.signal(session.playerId, session.name, msg.zone, msg.kind);
        if (!r.ok) this.error(session, r.code, r.message);
        break;
      }
      case 'CHAT': {
        const r = this.chat.submit(session.playerId, session.name, msg.text, session.roomId);
        if (r.ok) {
          this.broadcastToRoom(session.roomId!, {
            type: 'CHAT_MESSAGE',
            entry: r.entry,
          } satisfies ServerMessage);
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
    if (player?.isHouse || player?.isBot) player = undefined; // nobody resumes the house or a bot

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
        isBot: false,
        lastRoomId: null,
        createdAt: Date.now(),
      };
      this.db.insert(players).values(player).run();
    }

    session.playerId = player.id;
    session.name = player.name;
    // Reconnect restores the player to their room (C1); unknown/stale rooms
    // fall back to the default (first configured) room.
    const roomId =
      player.lastRoomId && this.rooms.get(player.lastRoomId)
        ? player.lastRoomId
        : this.rooms.defaultRoomId;
    this.enterRoom(session, roomId);
  }

  private joinRoom(session: Session, roomId: string): void {
    if (!this.rooms.get(roomId)) {
      return this.error(session, 'NO_SUCH_ROOM', 'That room does not exist.');
    }
    if (session.roomId === roomId) return;
    // Any live order in the old room is withdrawn and refunded before switching.
    const oldRoom = this.roomOf(session);
    if (oldRoom && session.playerId) {
      oldRoom.cancelOrder(session.playerId); // best-effort; rejections are fine
    }
    this.enterRoom(session, roomId);
  }

  private enterRoom(session: Session, roomId: string): void {
    if (!session.playerId || !session.name) return;
    session.roomId = roomId;
    this.db
      .update(players)
      .set({ lastRoomId: roomId })
      .where(eq(players.id, session.playerId))
      .run();
    const room = this.rooms.get(roomId)!;
    const phase = room.phaseInfo();
    const player = this.db.select().from(players).where(eq(players.id, session.playerId)).get()!;

    const chatTail: ChatEntry[] = this.db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.roomId, roomId)))
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
      houseSeedMinor: room.roundHeader().houseSeedMinor,
      roomId,
      rooms: this.roomList(),
      minStakeMinor: room.cfg.minStakeMinor,
      maxStakeMinor: room.cfg.maxStakeMinor,
      whaleCapFraction: room.cfg.whaleCapFraction,
      round: room.roundHeader(),
      phase,
      ...(phase.phase === 'ANCHOR_OPEN' ? {} : { pools: room.poolsState() }),
      tideReport: room.tideReportState(),
      anchors: room.anchorsPublic(phase.phase !== 'ANCHOR_OPEN'),
      signals: room.signalsPublic(),
      yourAnchor: room.yourAnchor(player.id),
      yourFleet: room.yourFleet(player.id),
      wreckLog: room.wreckLogState(),
      chatTail,
    });
    this.broadcastRoomList();
  }

  private send(session: Session, msg: ServerMessage): void {
    if (session.ws.readyState === session.ws.OPEN) session.ws.send(JSON.stringify(msg));
  }

  private error(session: Session, code: string, message: string, receipt?: ActionReceipt): void {
    this.send(session, { type: 'ERROR', code, message, ...(receipt ? { receipt } : {}) });
  }
}
