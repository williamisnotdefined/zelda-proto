import { Server } from 'node:http';
import { nanoid } from 'nanoid';
import { WebSocket, WebSocketServer } from 'ws';
import { World } from '../game/World.js';
import { ClientMessage, ServerChatMessage, ServerMessage } from './MessageTypes.js';
import { NetworkManager } from './NetworkManager.js';
import { diffSnapshot, SnapshotState } from './SnapshotSerializer.js';

const MAX_PAYLOAD_BYTES = 1024;
const MAX_CONNECTIONS = 200;
const INPUT_RATE_LIMIT = 65;
const CHAT_RATE_LIMIT = 5;
const RATE_WINDOW_MS = 1000;
const MAX_NICKNAME_LENGTH = 16;
const MAX_CHAT_LENGTH = 100;
const FORCE_FULL_SNAPSHOT_EVERY_TICKS = 40;

function formatDateTime(): string {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export class WebSocketHandler {
  private wss: WebSocketServer;
  readonly clients: Map<string, WebSocket> = new Map();
  private readonly networkManager: NetworkManager;
  private readonly previousSnapshots: Map<string, SnapshotState> = new Map();
  private snapshotTick = 0;

  constructor(httpServer: Server) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      maxPayload: MAX_PAYLOAD_BYTES,
    });
    this.networkManager = new NetworkManager();
  }

  start(world: World): void {
    this.wss.on('connection', (ws) => {
      if (this.clients.size >= MAX_CONNECTIONS) {
        ws.close(1013, 'Server full');
        return;
      }

      const playerId = nanoid(12);
      let hasJoined = false;
      let inputCount = 0;
      let chatCount = 0;
      let rateWindowStart = Date.now();

      this.clients.set(playerId, ws);

      ws.on('message', (data) => {
        try {
          const now = Date.now();
          if (now - rateWindowStart > RATE_WINDOW_MS) {
            inputCount = 0;
            chatCount = 0;
            rateWindowStart = now;
          }

          const msg = this.networkManager.decodeClientMessage(data) as ClientMessage | null;
          if (!msg) return;

          if (msg.type === 'join' && !hasJoined) {
            const nickname =
              msg.nickname
                .replace(/[^a-zA-Z0-9 ]/g, '')
                .slice(0, MAX_NICKNAME_LENGTH)
                .trim() || 'Player';

            world.addPlayer(playerId, nickname);
            hasJoined = true;

            console.log(
              `[Game] Player connected: ${nickname} | ${formatDateTime()} | ${world.players.size} player(s) online`
            );

            const welcome: ServerMessage = {
              type: 'welcome',
              id: playerId,
              mapWidth: 0,
              mapHeight: 0,
            };
            this.networkManager.send(ws, welcome);
          } else if (msg.type === 'input' && hasJoined) {
            if (++inputCount > INPUT_RATE_LIMIT) return;
            world.handleInput(playerId, msg);
          } else if (msg.type === 'chat' && hasJoined) {
            if (++chatCount > CHAT_RATE_LIMIT) return;
            this.handleChat(world, playerId, msg.text);
          }
        } catch (err) {
          console.error(`[WebSocket] Error parsing message from ${playerId}:`, err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(playerId);
        this.previousSnapshots.delete(playerId);
        if (hasJoined) {
          const nickname = world.players.get(playerId)?.nickname ?? 'Unknown';
          world.removePlayer(playerId);
          console.log(
            `[Game] Player disconnected: ${nickname} | ${formatDateTime()} | ${world.players.size} player(s) online`
          );
        }
      });

      ws.on('error', (error) => {
        console.error(`[WebSocket] Error on connection ${playerId}:`, error.message);
      });
    });
  }

  private handleChat(world: World, playerId: string, rawText: unknown): void {
    const player = world.players.get(playerId);
    if (!player) return;

    const text = String(rawText ?? '')
      .trim()
      .slice(0, MAX_CHAT_LENGTH);
    if (text.length === 0) return;

    const chatMsg: ServerChatMessage = {
      type: 'chat',
      id: playerId,
      nickname: player.nickname,
      text,
      timestamp: Date.now(),
    };
    for (const ws of this.clients.values()) {
      if (ws.readyState === WebSocket.OPEN) this.networkManager.send(ws, chatMsg);
    }
  }

  broadcastSnapshots(world: World): void {
    this.snapshotTick += 1;
    world.cachePlayerSnapshots();
    for (const [playerId, ws] of this.clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        const snapshot = world.getSnapshotForPlayer(playerId);
        const previous = this.previousSnapshots.get(playerId) ?? null;
        const full = this.snapshotTick % FORCE_FULL_SNAPSHOT_EVERY_TICKS === 0;
        const { message, nextState } = diffSnapshot(previous, snapshot, this.snapshotTick, full);
        this.previousSnapshots.set(playerId, nextState);
        this.networkManager.send(ws, message);
      }
    }
  }
}
