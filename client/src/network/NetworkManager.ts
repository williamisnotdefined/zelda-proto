import { pack, unpack } from 'msgpackr';
import { PROTOCOL_VERSION, SERVER_MESSAGE_TYPES } from '@gelehka/shared';
import { WS_MAX_BUFFERED_BYTES } from '@gelehka/shared/constants';
import type {
  ClientMessage,
  EnemySnapshot,
  BossSnapshot,
  DropSnapshot,
  PortalSnapshot,
  HazardSnapshot,
  PlayerSnapshot,
  ServerMessage,
  SnapshotDeltaMessage,
  SnapshotMessage,
} from '@gelehka/shared';

type MessageHandler = (msg: ServerMessage) => void;
type ErrorHandler = (error: string) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${window.location.host}/ws`;
const MAX_CONNECTION_TIMEOUT = 30000;

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

interface SnapshotCache {
  instanceId: SnapshotMessage['instanceId'];
  players: Map<string, PlayerSnapshot>;
  enemies: Map<string, EnemySnapshot>;
  bosses: Map<string, BossSnapshot>;
  drops: Map<string, DropSnapshot>;
  portals: Map<string, PortalSnapshot>;
  hazards: Map<string, HazardSnapshot>;
  iceZones: SnapshotMessage['iceZones'];
  aoeIndicators: SnapshotMessage['aoeIndicators'];
}

function toEntityMap<T extends { id: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}

function toSnapshotCache(snapshot: SnapshotMessage): SnapshotCache {
  return {
    instanceId: snapshot.instanceId,
    players: toEntityMap(snapshot.players),
    enemies: toEntityMap(snapshot.enemies),
    bosses: toEntityMap(snapshot.bosses),
    drops: toEntityMap(snapshot.drops),
    portals: toEntityMap(snapshot.portals),
    hazards: toEntityMap(snapshot.hazards),
    iceZones: snapshot.iceZones,
    aoeIndicators: snapshot.aoeIndicators,
  };
}

function toSnapshotMessage(cache: SnapshotCache): SnapshotMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: SERVER_MESSAGE_TYPES.SNAPSHOT,
    instanceId: cache.instanceId,
    players: Array.from(cache.players.values()),
    enemies: Array.from(cache.enemies.values()),
    bosses: Array.from(cache.bosses.values()),
    drops: Array.from(cache.drops.values()),
    portals: Array.from(cache.portals.values()),
    hazards: Array.from(cache.hazards.values()),
    iceZones: cache.iceZones,
    aoeIndicators: cache.aoeIndicators,
  };
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];
  private openCallbacks: (() => void)[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private snapshotCache: SnapshotCache | null = null;
  private connectionState: ConnectionState = 'DISCONNECTED';
  private lastSnapshotTick = -1;

  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);
      this.snapshotCache = null;
      this.lastSnapshotTick = -1;
    } catch (error) {
      const errorMsg = `Failed to create WebSocket: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.notifyError(errorMsg);
      this.setConnectionState('ERROR');
      return;
    }

    this.setConnectionState('CONNECTING');

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    this.connectionTimeout = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        this.notifyError('Connection timeout - server may be unreachable');
        this.setConnectionState('ERROR');
        this.ws.close();
      }
    }, MAX_CONNECTION_TIMEOUT);

    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      for (const cb of this.openCallbacks) cb();
      this.openCallbacks = [];
      this.snapshotCache = null;
      this.lastSnapshotTick = -1;
      this.setConnectionState('CONNECTED');
    };

    this.ws.onmessage = (event) => {
      const message = this.decodeServerMessage(event.data);
      if (!message) return;

      if (message.protocolVersion !== PROTOCOL_VERSION) {
        this.notifyError('Protocol version mismatch with server');
        this.disconnect();
        return;
      }

      if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA) {
        if (message.tick <= this.lastSnapshotTick) {
          return;
        }
        this.lastSnapshotTick = message.tick;
      }

      const normalized = this.normalizeMessage(message);
      for (const handler of this.handlers) {
        handler(normalized);
      }
    };

    this.ws.onclose = (event) => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      this.openCallbacks = [];

      if (event.code === 1006) {
        this.notifyError('Connection closed abnormally - check your internet connection');
      } else if (event.code >= 1002 && event.code <= 1003) {
        this.notifyError('Connection closed due to protocol error');
      } else if (!event.wasClean && event.code !== 1000) {
        this.notifyError(`Connection lost unexpectedly (code: ${event.code})`);
      }

      this.ws = null;
      this.setConnectionState('DISCONNECTED');
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 2000);
      }
    };

    this.ws.onerror = () => {
      this.notifyError('WebSocket error occurred - connection may have failed');
      this.setConnectionState('ERROR');
    };
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (this.ws.bufferedAmount > WS_MAX_BUFFERED_BYTES) {
      return;
    }
    this.ws.send(pack(msg));
  }

  onceOpen(cb: () => void): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      cb();
      return;
    }
    this.openCallbacks.push(cb);
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      this.errorHandlers = this.errorHandlers.filter((h) => h !== handler);
    };
  }

  onConnectionState(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.push(handler);
    handler(this.connectionState);
    return () => {
      this.connectionStateHandlers = this.connectionStateHandlers.filter((h) => h !== handler);
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.snapshotCache = null;
    this.lastSnapshotTick = -1;
    this.setConnectionState('DISCONNECTED');
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  private notifyError(error: string): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    for (const handler of this.connectionStateHandlers) {
      handler(state);
    }
  }

  private decodeServerMessage(raw: unknown): ServerMessage | null {
    try {
      if (raw instanceof ArrayBuffer) {
        return unpack(new Uint8Array(raw)) as ServerMessage;
      }
      if (raw instanceof Blob) {
        return null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private normalizeMessage(message: ServerMessage): ServerMessage {
    if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT) {
      this.snapshotCache = toSnapshotCache(message);
      return toSnapshotMessage(this.snapshotCache);
    }

    if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA) {
      const normalized = this.applyDelta(message);
      return normalized;
    }

    return message;
  }

  private applyDelta(delta: SnapshotDeltaMessage): SnapshotMessage {
    if (delta.full || !this.snapshotCache || this.snapshotCache.instanceId !== delta.instanceId) {
      this.snapshotCache = {
        instanceId: delta.instanceId,
        players: toEntityMap(delta.players),
        enemies: toEntityMap(delta.enemies),
        bosses: toEntityMap(delta.bosses),
        drops: toEntityMap(delta.drops),
        portals: toEntityMap(delta.portals),
        hazards: toEntityMap(delta.hazards),
        iceZones: delta.iceZones,
        aoeIndicators: delta.aoeIndicators,
      };
      return toSnapshotMessage(this.snapshotCache);
    }

    const cache = this.snapshotCache;

    for (const player of delta.players) cache.players.set(player.id, player);
    for (const enemy of delta.enemies) cache.enemies.set(enemy.id, enemy);
    for (const boss of delta.bosses) cache.bosses.set(boss.id, boss);
    for (const drop of delta.drops) cache.drops.set(drop.id, drop);
    for (const portal of delta.portals) cache.portals.set(portal.id, portal);
    for (const hazard of delta.hazards) cache.hazards.set(hazard.id, hazard);

    for (const id of delta.removedPlayerIds) cache.players.delete(id);
    for (const id of delta.removedEnemyIds) cache.enemies.delete(id);
    for (const id of delta.removedBossIds) cache.bosses.delete(id);
    for (const id of delta.removedDropIds) cache.drops.delete(id);
    for (const id of delta.removedPortalIds) cache.portals.delete(id);
    for (const id of delta.removedHazardIds) cache.hazards.delete(id);

    cache.instanceId = delta.instanceId;
    cache.iceZones = delta.iceZones;
    cache.aoeIndicators = delta.aoeIndicators;

    return toSnapshotMessage(cache);
  }
}
