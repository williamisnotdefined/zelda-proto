import { pack, unpack } from 'msgpackr';
import { SERVER_MESSAGE_TYPES } from '@gelehka/shared';
import { WS_MAX_BUFFERED_BYTES } from '@gelehka/shared/constants';
import type {
  ClientMessage,
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

type SnapshotCache = Omit<SnapshotMessage, 'type'>;

function toSnapshotCache(snapshot: SnapshotMessage): SnapshotCache {
  return {
    instanceId: snapshot.instanceId,
    players: snapshot.players,
    enemies: snapshot.enemies,
    bosses: snapshot.bosses,
    drops: snapshot.drops,
    portals: snapshot.portals,
    hazards: snapshot.hazards,
    iceZones: snapshot.iceZones,
    aoeIndicators: snapshot.aoeIndicators,
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
      this.setConnectionState('CONNECTED');
    };

    this.ws.onmessage = (event) => {
      const message = this.decodeServerMessage(event.data);
      if (!message) return;

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
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as ServerMessage;
      } catch {
        return null;
      }
    }

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
      return message;
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
        players: delta.players,
        enemies: delta.enemies,
        bosses: delta.bosses,
        drops: delta.drops,
        portals: delta.portals,
        hazards: delta.hazards,
        iceZones: delta.iceZones,
        aoeIndicators: delta.aoeIndicators,
      };
      return { type: SERVER_MESSAGE_TYPES.SNAPSHOT, ...this.snapshotCache };
    }

    const playersMap = new Map(this.snapshotCache.players.map((p) => [p.id, p]));
    const enemiesMap = new Map(this.snapshotCache.enemies.map((e) => [e.id, e]));
    const bossesMap = new Map(this.snapshotCache.bosses.map((b) => [b.id, b]));
    const dropsMap = new Map(this.snapshotCache.drops.map((d) => [d.id, d]));
    const portalsMap = new Map(this.snapshotCache.portals.map((p) => [p.id, p]));
    const hazardsMap = new Map(this.snapshotCache.hazards.map((h) => [h.id, h]));

    for (const player of delta.players) playersMap.set(player.id, player);
    for (const enemy of delta.enemies) enemiesMap.set(enemy.id, enemy);
    for (const boss of delta.bosses) bossesMap.set(boss.id, boss);
    for (const drop of delta.drops) dropsMap.set(drop.id, drop);
    for (const portal of delta.portals) portalsMap.set(portal.id, portal);
    for (const hazard of delta.hazards) hazardsMap.set(hazard.id, hazard);

    for (const id of delta.removedPlayerIds) playersMap.delete(id);
    for (const id of delta.removedEnemyIds) enemiesMap.delete(id);
    for (const id of delta.removedBossIds) bossesMap.delete(id);
    for (const id of delta.removedDropIds) dropsMap.delete(id);
    for (const id of delta.removedPortalIds) portalsMap.delete(id);
    for (const id of delta.removedHazardIds) hazardsMap.delete(id);

    this.snapshotCache = {
      instanceId: delta.instanceId,
      players: Array.from(playersMap.values()),
      enemies: Array.from(enemiesMap.values()),
      bosses: Array.from(bossesMap.values()),
      drops: Array.from(dropsMap.values()),
      portals: Array.from(portalsMap.values()),
      hazards: Array.from(hazardsMap.values()),
      iceZones: delta.iceZones,
      aoeIndicators: delta.aoeIndicators,
    };

    return { type: SERVER_MESSAGE_TYPES.SNAPSHOT, ...this.snapshotCache };
  }
}
