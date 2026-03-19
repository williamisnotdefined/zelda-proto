import { Server } from 'node:http';
import {
  CLIENT_MESSAGE_TYPES,
  INSTANCE_IDS,
  PROTOCOL_VERSION,
  SESSION_RESUME_REJECT_REASONS,
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
import { validateClientMessage } from './MessageValidation.js';
import { NetworkManager } from './NetworkManager.js';
import { SessionManager } from './SessionManager.js';
import { diffSnapshot, SnapshotState } from './SnapshotSerializer.js';
import { getRequestIp, isAllowedWebSocketOrigin } from './requestPolicy.js';

const HEARTBEAT_INTERVAL_MS = 15000;
const JOIN_TIMEOUT_MS = 5000;
const MAX_CONNECTIONS = 200;
const MAX_CONNECTIONS_PER_IP = 12;
const INPUT_RATE_LIMIT = 65;
const CHAT_RATE_LIMIT = 5;
const RATE_WINDOW_MS = 1000;
const MAX_RATE_LIMIT_VIOLATIONS_PER_WINDOW = 15;
const MAX_INVALID_MESSAGES_PER_WINDOW = 8;
const MAX_CONSECUTIVE_BLOCKED_SENDS = SERVER_NET_TICK_RATE * 3;
const FORCE_FULL_SNAPSHOT_EVERY_TICKS = SERVER_NET_TICK_RATE * 5;
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
  private instances: InstanceManager | null = null;
  private readonly networkManager: NetworkManager;
  private readonly snapshotSystem: SnapshotSystem;
  private readonly sessionManager: SessionManager;
  private readonly previousSnapshots: Map<string, SnapshotState> = new Map();
  private readonly forceFullSnapshotFor: Set<string> = new Set();
  private readonly lastInstanceByPlayer: Map<string, string> = new Map();
  private readonly blockedSendStreakByPlayer: Map<string, number> = new Map();
  private readonly joinTimeoutByPlayer: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly playerIpById: Map<string, string> = new Map();
  private readonly connectionsByIp: Map<string, number> = new Map();
  private snapshotTick = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(httpServer: Server) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      maxPayload: WS_MAX_PAYLOAD_BYTES,
    });
    this.networkManager = new NetworkManager();
    this.snapshotSystem = new SnapshotSystem();
    this.sessionManager = new SessionManager({
      onSessionExpired: (playerId) => {
        const instances = this.instances;
        if (!instances) {
          return;
        }

        const nickname = instances.getPlayerById(playerId)?.nickname ?? 'Unknown';
        instances.removePlayer(playerId);
        this.previousSnapshots.delete(playerId);
        this.forceFullSnapshotFor.delete(playerId);
        this.lastInstanceByPlayer.delete(playerId);
        this.blockedSendStreakByPlayer.delete(playerId);

        console.log(
          `[Game] Session expired: ${nickname} | ${formatDateTime()} | ${instances.getPlayersInAnyWorld().size} player(s) online`
        );
      },
    });
  }

  start(instances: InstanceManager): void {
    this.instances = instances;

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        for (const ws of this.clients.values()) {
          const heartbeatSocket = ws as WebSocket & { isAlive?: boolean };
          if (heartbeatSocket.readyState !== WebSocket.OPEN) {
            continue;
          }

          if (heartbeatSocket.isAlive === false) {
            heartbeatSocket.terminate();
            continue;
          }

          heartbeatSocket.isAlive = false;
          heartbeatSocket.ping();
        }
      }, HEARTBEAT_INTERVAL_MS);

      this.wss.once('close', () => {
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
      });
    }

    this.wss.on('connection', (ws, req) => {
      if (!isAllowedWebSocketOrigin(req)) {
        ws.close(1008, 'Origin not allowed');
        return;
      }

      const ip = getRequestIp(req);
      if (this.clients.size >= MAX_CONNECTIONS) {
        ws.close(1013, 'Server full');
        return;
      }

      if ((this.connectionsByIp.get(ip) ?? 0) >= MAX_CONNECTIONS_PER_IP) {
        ws.close(1008, 'Too many connections from IP');
        return;
      }

      let playerId = nanoid(12);
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

      this.connectionsByIp.set(ip, (this.connectionsByIp.get(ip) ?? 0) + 1);
      this.playerIpById.set(playerId, ip);
      this.clients.set(playerId, ws);
      this.blockedSendStreakByPlayer.set(playerId, 0);
      (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
      this.joinTimeoutByPlayer.set(
        playerId,
        setTimeout(() => {
          if (!hasJoined && ws.readyState === WebSocket.OPEN) {
            ws.close(1008, 'Join timeout');
          }
        }, JOIN_TIMEOUT_MS)
      );
      ws.on('pong', () => {
        (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
      });

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
            const nickname = validMessage.nickname;
            const { token: sessionToken } = this.sessionManager.createSession(playerId, nickname);

            instances.addPlayer(playerId, nickname);
            hasJoined = true;
            this.clearJoinTimeout(playerId);

            console.log(
              `[Game] Player connected: ${nickname} | ${formatDateTime()} | ${instances.getPlayersInAnyWorld().size} player(s) online`
            );

            const welcome: ServerMessage = {
              protocolVersion: PROTOCOL_VERSION,
              type: SERVER_MESSAGE_TYPES.WELCOME,
              id: playerId,
              sessionToken,
              resumed: false,
              mapWidth: 0,
              mapHeight: 0,
            };
            if (!this.trySendToPlayer(playerId, ws, welcome, true)) {
              return;
            }
            this.trySendToPlayer(
              playerId,
              ws,
              this.buildLeaderboard(
                instances,
                instances.getInstanceForPlayer(playerId) ?? INSTANCE_IDS.PHASE1
              )
            );
          } else if (validMessage.type === CLIENT_MESSAGE_TYPES.RESUME_SESSION) {
            const resumeResult = this.sessionManager.tryResume(validMessage.sessionToken);
            if (!resumeResult.ok) {
              this.trySendToPlayer(playerId, ws, {
                protocolVersion: PROTOCOL_VERSION,
                type: SERVER_MESSAGE_TYPES.RESUME_REJECTED,
                reason:
                  resumeResult.reason === 'session_in_use'
                    ? SESSION_RESUME_REJECT_REASONS.SESSION_IN_USE
                    : SESSION_RESUME_REJECT_REASONS.INVALID_SESSION,
              });
              return;
            }

            const resumedPlayerId = resumeResult.session.playerId;
            const resumedPlayer = instances.getPlayerById(resumedPlayerId);
            if (!resumedPlayer) {
              this.sessionManager.invalidatePlayer(resumedPlayerId);
              this.trySendToPlayer(playerId, ws, {
                protocolVersion: PROTOCOL_VERSION,
                type: SERVER_MESSAGE_TYPES.RESUME_REJECTED,
                reason: SESSION_RESUME_REJECT_REASONS.INVALID_SESSION,
              });
              return;
            }

            this.clearJoinTimeout(playerId);
            this.rekeyConnection(playerId, resumedPlayerId, ws);
            playerId = resumedPlayerId;
            hasJoined = true;
            this.previousSnapshots.delete(playerId);
            this.forceFullSnapshotFor.add(playerId);
            this.lastInstanceByPlayer.delete(playerId);
            this.blockedSendStreakByPlayer.set(playerId, 0);

            console.log(
              `[Game] Player resumed: ${resumedPlayer.nickname} | ${formatDateTime()} | ${instances.getPlayersInAnyWorld().size} player(s) online`
            );

            const welcome: ServerMessage = {
              protocolVersion: PROTOCOL_VERSION,
              type: SERVER_MESSAGE_TYPES.WELCOME,
              id: playerId,
              sessionToken: resumeResult.session.token,
              resumed: true,
              mapWidth: 0,
              mapHeight: 0,
            };
            if (!this.trySendToPlayer(playerId, ws, welcome, true)) {
              return;
            }

            this.trySendToPlayer(
              playerId,
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
          } else if (validMessage.type === CLIENT_MESSAGE_TYPES.SNAPSHOT_RESYNC) {
            this.previousSnapshots.delete(playerId);
            this.forceFullSnapshotFor.add(playerId);
          } else {
            registerInvalidMessage();
          }
        } catch (err) {
          console.error(`[WebSocket] Error parsing message from ${playerId}:`, err);
        }
      });

      ws.on('close', () => {
        this.clearJoinTimeout(playerId);
        this.clients.delete(playerId);
        this.previousSnapshots.delete(playerId);
        this.forceFullSnapshotFor.delete(playerId);
        this.lastInstanceByPlayer.delete(playerId);
        this.blockedSendStreakByPlayer.delete(playerId);
        this.decrementIpConnectionCount(playerId);
        if (hasJoined) {
          const nickname = instances.getPlayerById(playerId)?.nickname ?? 'Unknown';
          instances.suspendPlayer(playerId);
          this.sessionManager.markDisconnected(playerId);
          console.log(
            `[Game] Player disconnected: ${nickname} | ${formatDateTime()} | session resumable`
          );
        }
      });

      ws.on('error', (error) => {
        console.error(`[WebSocket] Error on connection ${playerId}:`, error.message);
      });
    });
  }

  stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const timeout of this.joinTimeoutByPlayer.values()) {
      clearTimeout(timeout);
    }
    this.joinTimeoutByPlayer.clear();

    this.sessionManager.shutdown();

    for (const ws of this.clients.values()) {
      ws.terminate();
    }
    this.clients.clear();
    this.playerIpById.clear();
    this.connectionsByIp.clear();
    this.previousSnapshots.clear();
    this.forceFullSnapshotFor.clear();
    this.lastInstanceByPlayer.clear();
    this.blockedSendStreakByPlayer.clear();
    this.instances = null;

    return new Promise((resolve) => {
      this.wss.close(() => resolve());
    });
  }

  private handleChat(instances: InstanceManager, playerId: string, text: string): void {
    const player = instances.getPlayersInAnyWorld().get(playerId);
    if (!player) return;

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
      this.trySendToPlayer(peerId, ws, chatMsg);
    }
  }

  broadcastSnapshots(instances: InstanceManager): void {
    this.snapshotTick += 1;

    if (this.snapshotTick % LEADERBOARD_INTERVAL_TICKS === 0) {
      const leaderboardsByInstance = {
        [INSTANCE_IDS.PHASE1]: this.buildLeaderboard(instances, INSTANCE_IDS.PHASE1),
        [INSTANCE_IDS.PHASE2]: this.buildLeaderboard(instances, INSTANCE_IDS.PHASE2),
        [INSTANCE_IDS.PHASE3]: this.buildLeaderboard(instances, INSTANCE_IDS.PHASE3),
        [INSTANCE_IDS.PHASE4]: this.buildLeaderboard(instances, INSTANCE_IDS.PHASE4),
      };

      for (const [playerId, ws] of this.clients.entries()) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        const instanceId = instances.getInstanceForPlayer(playerId);
        if (!instanceId) continue;
        const leaderboard = leaderboardsByInstance[instanceId];
        this.trySendToPlayer(playerId, ws, leaderboard);
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
        const periodicFullSnapshotEnabled = FORCE_FULL_SNAPSHOT_EVERY_TICKS > 0;
        const full =
          this.forceFullSnapshotFor.has(playerId) ||
          (periodicFullSnapshotEnabled &&
            this.snapshotTick % FORCE_FULL_SNAPSHOT_EVERY_TICKS === 0);
        const { message, nextState } = diffSnapshot(previous, snapshot, this.snapshotTick, full, {
          viewerX: world.players.get(playerId)?.x ?? 0,
          viewerY: world.players.get(playerId)?.y ?? 0,
          relevantEnemyCount: snapshot.enemies.length,
        });
        const sent = this.trySendToPlayer(playerId, ws, message);
        if (sent) {
          this.previousSnapshots.set(playerId, nextState);
          this.forceFullSnapshotFor.delete(playerId);
          this.lastInstanceByPlayer.set(playerId, snapshot.instanceId);
        }
      }
    }
  }

  private clearJoinTimeout(playerId: string): void {
    const timeout = this.joinTimeoutByPlayer.get(playerId);
    if (timeout) {
      clearTimeout(timeout);
      this.joinTimeoutByPlayer.delete(playerId);
    }
  }

  private decrementIpConnectionCount(playerId: string): void {
    const ip = this.playerIpById.get(playerId);
    if (!ip) {
      return;
    }

    const current = this.connectionsByIp.get(ip) ?? 0;
    if (current <= 1) {
      this.connectionsByIp.delete(ip);
    } else {
      this.connectionsByIp.set(ip, current - 1);
    }

    this.playerIpById.delete(playerId);
  }

  private rekeyConnection(previousPlayerId: string, nextPlayerId: string, ws: WebSocket): void {
    if (previousPlayerId === nextPlayerId) {
      this.clients.set(nextPlayerId, ws);
      return;
    }

    const ip = this.playerIpById.get(previousPlayerId);
    const blockedStreak = this.blockedSendStreakByPlayer.get(previousPlayerId) ?? 0;

    this.clients.delete(previousPlayerId);
    this.playerIpById.delete(previousPlayerId);
    this.blockedSendStreakByPlayer.delete(previousPlayerId);

    this.clients.set(nextPlayerId, ws);
    this.blockedSendStreakByPlayer.set(nextPlayerId, blockedStreak);
    if (ip) {
      this.playerIpById.set(nextPlayerId, ip);
    }
  }

  private trySendToPlayer(
    playerId: string,
    ws: WebSocket,
    message: ServerMessage,
    closeOnFailure = false
  ): boolean {
    const sent = this.networkManager.send(ws, message);
    if (sent) {
      this.blockedSendStreakByPlayer.set(playerId, 0);
      return true;
    }

    this.forceFullSnapshotFor.add(playerId);

    const nextBlockedStreak = (this.blockedSendStreakByPlayer.get(playerId) ?? 0) + 1;
    this.blockedSendStreakByPlayer.set(playerId, nextBlockedStreak);

    if (closeOnFailure || nextBlockedStreak >= MAX_CONSECUTIVE_BLOCKED_SENDS) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1013, 'Connection overloaded');
      }
    }

    return false;
  }

  private buildLeaderboard(instances: InstanceManager, instanceId: InstanceId): ServerMessage {
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: SERVER_MESSAGE_TYPES.LEADERBOARD,
      players: Array.from(instances.getPlayersInInstance(instanceId).values()).map((player) => ({
        id: player.id,
        nickname: player.nickname,
        playerKills: player.playerKills,
        monsterKills: player.monsterKills,
        deaths: player.deaths,
      })),
    };
  }
}
