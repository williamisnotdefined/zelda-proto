import { Server } from 'node:http';
import {
  CLIENT_MESSAGE_TYPES,
  INSTANCE_IDS,
  PROTOCOL_VERSION,
  SERVER_MESSAGE_TYPES,
} from '@gelehka/shared';
import {
  SERVER_LEADERBOARD_TICK_RATE,
  SERVER_NET_TICK_RATE,
  WS_MAX_PAYLOAD_BYTES,
} from '@gelehka/shared/constants';
import { nanoid } from 'nanoid';
import { WebSocket, WebSocketServer } from 'ws';
import { InstanceManager } from '../game/InstanceManager.js';
import type { ClientMessage, ServerChatMessage, ServerMessage } from './MessageTypes.js';
import type { InstanceId } from '@gelehka/shared';
import { SnapshotSystem } from '../game/systems/SnapshotSystem.js';
import {
  MAX_CHAT_LENGTH,
  MAX_NICKNAME_LENGTH,
  validateClientMessage,
} from './MessageValidation.js';
import { NetworkManager } from './NetworkManager.js';
import { diffSnapshot, SnapshotState } from './SnapshotSerializer.js';

const MAX_CONNECTIONS = 200;
const INPUT_RATE_LIMIT = 65;
const CHAT_RATE_LIMIT = 5;
const RATE_WINDOW_MS = 1000;
const MAX_RATE_LIMIT_VIOLATIONS_PER_WINDOW = 15;
const MAX_INVALID_MESSAGES_PER_WINDOW = 8;
const FORCE_FULL_SNAPSHOT_EVERY_TICKS = 40;
const LEADERBOARD_INTERVAL_TICKS = Math.max(
  1,
  Math.round(SERVER_NET_TICK_RATE / SERVER_LEADERBOARD_TICK_RATE)
);

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
  private readonly snapshotSystem: SnapshotSystem;
  private readonly previousSnapshots: Map<string, SnapshotState> = new Map();
  private readonly forceFullSnapshotFor: Set<string> = new Set();
  private readonly lastInstanceByPlayer: Map<string, string> = new Map();
  private snapshotTick = 0;

  constructor(httpServer: Server) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      maxPayload: WS_MAX_PAYLOAD_BYTES,
    });
    this.networkManager = new NetworkManager();
    this.snapshotSystem = new SnapshotSystem();
  }

  start(instances: InstanceManager): void {
    this.wss.on('connection', (ws) => {
      if (this.clients.size >= MAX_CONNECTIONS) {
        ws.close(1013, 'Server full');
        return;
      }

      const playerId = nanoid(12);
      let hasJoined = false;
      let inputCount = 0;
      let chatCount = 0;
      let rateLimitViolations = 0;
      let invalidMessages = 0;
      let rateWindowStart = Date.now();

      const resetWindow = (now: number) => {
        if (now - rateWindowStart <= RATE_WINDOW_MS) {
          return;
        }
        inputCount = 0;
        chatCount = 0;
        rateLimitViolations = 0;
        invalidMessages = 0;
        rateWindowStart = now;
      };

      const closeForPolicyViolation = (reason: string) => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1008, reason);
        }
      };

      const registerInvalidMessage = () => {
        invalidMessages += 1;
        if (invalidMessages > MAX_INVALID_MESSAGES_PER_WINDOW) {
          closeForPolicyViolation('Too many invalid messages');
        }
      };

      const registerRateViolation = () => {
        rateLimitViolations += 1;
        if (rateLimitViolations > MAX_RATE_LIMIT_VIOLATIONS_PER_WINDOW) {
          closeForPolicyViolation('Rate limit exceeded');
        }
      };

      this.clients.set(playerId, ws);

      ws.on('message', (data) => {
        try {
          const now = Date.now();
          resetWindow(now);

          const msg = this.networkManager.decodeClientMessage(data) as ClientMessage | null;
          if (!msg) {
            registerInvalidMessage();
            return;
          }

          const validation = validateClientMessage(msg, hasJoined);
          if (!validation.ok) {
            if (validation.reason === 'protocol_mismatch') {
              ws.close(1002, 'Protocol version mismatch');
              return;
            }
            registerInvalidMessage();
            return;
          }

          const validMessage = validation.message;

          if (validMessage.type === CLIENT_MESSAGE_TYPES.JOIN) {
            const nickname =
              validMessage.nickname
                .replace(/[^a-zA-Z0-9 ]/g, '')
                .slice(0, MAX_NICKNAME_LENGTH)
                .trim() || 'Player';

            instances.addPlayer(playerId, nickname);
            hasJoined = true;

            console.log(
              `[Game] Player connected: ${nickname} | ${formatDateTime()} | ${instances.getPlayersInAnyWorld().size} player(s) online`
            );

            const welcome: ServerMessage = {
              protocolVersion: PROTOCOL_VERSION,
              type: SERVER_MESSAGE_TYPES.WELCOME,
              id: playerId,
              mapWidth: 0,
              mapHeight: 0,
            };
            this.networkManager.send(ws, welcome);
            this.networkManager.send(
              ws,
              this.buildLeaderboard(
                instances,
                instances.getInstanceForPlayer(playerId) ?? INSTANCE_IDS.PHASE1
              )
            );
          } else if (validMessage.type === CLIENT_MESSAGE_TYPES.INPUT) {
            if (++inputCount > INPUT_RATE_LIMIT) {
              registerRateViolation();
              return;
            }
            instances.handleInput(playerId, validMessage);
          } else if (validMessage.type === CLIENT_MESSAGE_TYPES.CHAT) {
            if (++chatCount > CHAT_RATE_LIMIT) {
              registerRateViolation();
              return;
            }
            this.handleChat(instances, playerId, validMessage.text);
          } else {
            registerInvalidMessage();
          }
        } catch (err) {
          console.error(`[WebSocket] Error parsing message from ${playerId}:`, err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(playerId);
        this.previousSnapshots.delete(playerId);
        this.forceFullSnapshotFor.delete(playerId);
        this.lastInstanceByPlayer.delete(playerId);
        if (hasJoined) {
          const nickname = instances.getPlayersInAnyWorld().get(playerId)?.nickname ?? 'Unknown';
          instances.removePlayer(playerId);
          console.log(
            `[Game] Player disconnected: ${nickname} | ${formatDateTime()} | ${instances.getPlayersInAnyWorld().size} player(s) online`
          );
        }
      });

      ws.on('error', (error) => {
        console.error(`[WebSocket] Error on connection ${playerId}:`, error.message);
      });
    });
  }

  private handleChat(instances: InstanceManager, playerId: string, rawText: unknown): void {
    const player = instances.getPlayersInAnyWorld().get(playerId);
    if (!player) return;

    const text = String(rawText ?? '')
      .trim()
      .slice(0, MAX_CHAT_LENGTH);
    if (text.length === 0) return;

    const chatMsg: ServerChatMessage = {
      protocolVersion: PROTOCOL_VERSION,
      type: SERVER_MESSAGE_TYPES.CHAT,
      id: playerId,
      nickname: player.nickname,
      text,
      timestamp: Date.now(),
    };
    const senderInstance = instances.getInstanceForPlayer(playerId);
    for (const [peerId, ws] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (senderInstance && instances.getInstanceForPlayer(peerId) !== senderInstance) continue;
      this.networkManager.send(ws, chatMsg);
    }
  }

  broadcastSnapshots(instances: InstanceManager): void {
    this.snapshotTick += 1;

    if (this.snapshotTick % LEADERBOARD_INTERVAL_TICKS === 0) {
      const phase1Leaderboard = this.buildLeaderboard(instances, INSTANCE_IDS.PHASE1);
      const phase2Leaderboard = this.buildLeaderboard(instances, INSTANCE_IDS.PHASE2);
      const phase3Leaderboard = this.buildLeaderboard(instances, INSTANCE_IDS.PHASE3);

      for (const [playerId, ws] of this.clients.entries()) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        const instanceId = instances.getInstanceForPlayer(playerId);
        if (!instanceId) continue;
        const leaderboard =
          instanceId === INSTANCE_IDS.PHASE1
            ? phase1Leaderboard
            : instanceId === INSTANCE_IDS.PHASE2
              ? phase2Leaderboard
              : phase3Leaderboard;
        this.networkManager.send(ws, leaderboard);
      }
    }

    for (const [playerId, ws] of this.clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        const world = instances.getWorldForPlayer(playerId);
        if (!world) {
          continue;
        }
        const snapshot = this.snapshotSystem.getSnapshotForPlayer(world, playerId);
        const lastInstance = this.lastInstanceByPlayer.get(playerId);
        if (lastInstance && lastInstance !== snapshot.instanceId) {
          this.forceFullSnapshotFor.add(playerId);
        }
        const previous = this.previousSnapshots.get(playerId) ?? null;
        const full =
          this.forceFullSnapshotFor.has(playerId) ||
          this.snapshotTick % FORCE_FULL_SNAPSHOT_EVERY_TICKS === 0;
        const { message, nextState } = diffSnapshot(previous, snapshot, this.snapshotTick, full);
        const sent = this.networkManager.send(ws, message);
        if (sent) {
          this.previousSnapshots.set(playerId, nextState);
          this.forceFullSnapshotFor.delete(playerId);
          this.lastInstanceByPlayer.set(playerId, snapshot.instanceId);
        } else {
          this.forceFullSnapshotFor.add(playerId);
        }
      }
    }
  }

  private buildLeaderboard(instances: InstanceManager, instanceId: InstanceId): ServerMessage {
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: SERVER_MESSAGE_TYPES.LEADERBOARD,
      players: Array.from(instances.getPlayersInInstance(instanceId).values()).map((player) =>
        player.toSnapshot()
      ),
    };
  }
}
