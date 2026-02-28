import { pack, unpack } from 'msgpackr';
import type {
  ClientMessage,
  ServerMessage,
  SnapshotDeltaMessage,
  SnapshotMessage,
} from '@gelehka/shared';

type MessageHandler = (msg: ServerMessage) => void;
type ErrorHandler = (error: string) => void;

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${window.location.host}/ws`;
const MAX_CONNECTION_TIMEOUT = 30000;
const MAX_BUFFERED_BYTES = 512 * 1024;

type SnapshotCache = Omit<SnapshotMessage, 'type'>;

function toSnapshotCache(snapshot: SnapshotMessage): SnapshotCache {
  return {
    players: snapshot.players,
    enemies: snapshot.enemies,
    bosses: snapshot.bosses,
    drops: snapshot.drops,
    iceZones: snapshot.iceZones,
    aoeIndicators: snapshot.aoeIndicators,
  };
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private openCallbacks: (() => void)[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private snapshotCache: SnapshotCache | null = null;

  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (error) {
      const errorMsg = `Failed to create WebSocket: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.notifyError(errorMsg);
      return;
    }

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    this.connectionTimeout = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        this.notifyError('Connection timeout - server may be unreachable');
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
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 2000);
      }
    };

    this.ws.onerror = () => {
      this.notifyError('WebSocket error occurred - connection may have failed');
    };
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (this.ws.bufferedAmount > MAX_BUFFERED_BYTES) {
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
  }

  getConnectionState(): string {
    if (!this.ws) return 'DISCONNECTED';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'OPEN';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
        return 'CLOSED';
      default:
        return 'UNKNOWN';
    }
  }

  private notifyError(error: string): void {
    for (const handler of this.errorHandlers) {
      handler(error);
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
    if (message.type === 'snapshot') {
      this.snapshotCache = toSnapshotCache(message);
      return message;
    }

    if (message.type === 'snapshot_delta') {
      const normalized = this.applyDelta(message);
      return normalized;
    }

    return message;
  }

  private applyDelta(delta: SnapshotDeltaMessage): SnapshotMessage {
    if (delta.full || !this.snapshotCache) {
      this.snapshotCache = {
        players: delta.players,
        enemies: delta.enemies,
        bosses: delta.bosses,
        drops: delta.drops,
        iceZones: delta.iceZones,
        aoeIndicators: delta.aoeIndicators,
      };
      return { type: 'snapshot', ...this.snapshotCache };
    }

    const enemiesMap = new Map(this.snapshotCache.enemies.map((e) => [e.id, e]));
    const bossesMap = new Map(this.snapshotCache.bosses.map((b) => [b.id, b]));
    const dropsMap = new Map(this.snapshotCache.drops.map((d) => [d.id, d]));

    for (const enemy of delta.enemies) enemiesMap.set(enemy.id, enemy);
    for (const boss of delta.bosses) bossesMap.set(boss.id, boss);
    for (const drop of delta.drops) dropsMap.set(drop.id, drop);

    for (const id of delta.removedEnemyIds) enemiesMap.delete(id);
    for (const id of delta.removedBossIds) bossesMap.delete(id);
    for (const id of delta.removedDropIds) dropsMap.delete(id);

    this.snapshotCache = {
      players: delta.players,
      enemies: Array.from(enemiesMap.values()),
      bosses: Array.from(bossesMap.values()),
      drops: Array.from(dropsMap.values()),
      iceZones: delta.iceZones,
      aoeIndicators: delta.aoeIndicators,
    };

    return { type: 'snapshot', ...this.snapshotCache };
  }
}
