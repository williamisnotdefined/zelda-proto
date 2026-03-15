import { pack, unpack } from 'msgpackr';
import { resolveWebSocketUrl } from '@gelehka/game-core/network';
import { PROTOCOL_VERSION, SERVER_MESSAGE_TYPES } from '@gelehka/shared';
import { WS_MAX_BUFFERED_BYTES } from '@gelehka/shared/constants';
import type { ClientMessage, InstanceId, ServerMessage } from '@gelehka/shared';
import { logError } from '../monitoring/errorLogger';

type MessageHandler = (msg: ServerMessage) => void;
type ErrorHandler = (error: string) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;

const WS_URL = resolveWebSocketUrl({
  explicitUrl: import.meta.env.VITE_WS_URL,
  location: typeof window !== 'undefined' ? window.location : null,
});
const MAX_CONNECTION_TIMEOUT = 30000;

const NETWORK_STATS_WINDOW_MS = 1000;

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface NetworkPerformanceStats {
  incomingBytesPerSecond: number;
  incomingMessagesPerSecond: number;
  outgoingBytesPerSecond: number;
  outgoingMessagesPerSecond: number;
  bufferedAmount: number;
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];
  private openCallbacks: (() => void)[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionState: ConnectionState = 'DISCONNECTED';
  private shouldReconnect = true;
  private snapshotInstanceId: InstanceId | null = null;
  private lastSnapshotTick = -1;
  private hasSnapshotBase = false;
  private networkStatsWindowStartedAt = performance.now();
  private incomingBytesThisWindow = 0;
  private incomingMessagesThisWindow = 0;
  private outgoingBytesThisWindow = 0;
  private outgoingMessagesThisWindow = 0;
  private readonly networkStats: NetworkPerformanceStats = {
    incomingBytesPerSecond: 0,
    incomingMessagesPerSecond: 0,
    outgoingBytesPerSecond: 0,
    outgoingMessagesPerSecond: 0,
    bufferedAmount: 0,
  };

  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.shouldReconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      this.ws = new WebSocket(WS_URL);
      this.resetSnapshotTracking();
    } catch (error) {
      const errorMsg = `Failed to create WebSocket: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logError({
        category: 'network',
        type: 'websocket.create-failed',
        message: errorMsg,
        error,
        context: {
          url: WS_URL,
        },
      });
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
        logError({
          category: 'network',
          type: 'websocket.connection-timeout',
          message: 'WebSocket connection timed out',
          handled: true,
          context: {
            url: WS_URL,
            timeoutMs: MAX_CONNECTION_TIMEOUT,
          },
        });
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
      this.resetSnapshotTracking();
      this.resetNetworkStats();
      this.setConnectionState('CONNECTED');
    };

    this.ws.onmessage = (event) => {
      this.recordIncomingTraffic(event.data);
      const message = this.decodeServerMessage(event.data);
      if (!message) return;

      if (message.protocolVersion !== PROTOCOL_VERSION) {
        logError({
          category: 'network',
          type: 'websocket.protocol-version-mismatch',
          message: 'Protocol version mismatch with server',
          handled: true,
          context: {
            clientProtocolVersion: PROTOCOL_VERSION,
            serverProtocolVersion: message.protocolVersion,
          },
        });
        this.notifyError('Protocol version mismatch with server');
        this.disconnect();
        return;
      }

      const filtered = this.filterSnapshotMessage(message);
      if (!filtered) {
        return;
      }
      for (const handler of this.handlers) {
        handler(filtered);
      }
    };

    this.ws.onclose = (event) => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      this.openCallbacks = [];

      if (event.code === 1006) {
        logError({
          category: 'network',
          type: 'websocket.closed-abnormally',
          message: 'WebSocket closed abnormally',
          handled: true,
          context: {
            code: event.code,
            wasClean: event.wasClean,
            reason: event.reason,
          },
        });
        this.notifyError('Connection closed abnormally - check your internet connection');
      } else if (event.code >= 1002 && event.code <= 1003) {
        logError({
          category: 'network',
          type: 'websocket.protocol-close',
          message: 'WebSocket closed due to protocol error',
          handled: true,
          context: {
            code: event.code,
            wasClean: event.wasClean,
            reason: event.reason,
          },
        });
        this.notifyError('Connection closed due to protocol error');
      } else if (!event.wasClean && event.code !== 1000) {
        logError({
          category: 'network',
          type: 'websocket.unexpected-close',
          message: `WebSocket connection lost unexpectedly (code: ${event.code})`,
          handled: true,
          context: {
            code: event.code,
            wasClean: event.wasClean,
            reason: event.reason,
          },
        });
        this.notifyError(`Connection lost unexpectedly (code: ${event.code})`);
      }

      this.ws = null;
      this.setConnectionState('DISCONNECTED');
      if (this.shouldReconnect && !this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 2000);
      }
    };

    this.ws.onerror = () => {
      logError({
        category: 'network',
        type: 'websocket.error',
        message: 'WebSocket error occurred',
        handled: true,
        context: {
          url: WS_URL,
          readyState: this.ws?.readyState,
        },
      });
      this.notifyError('WebSocket error occurred - connection may have failed');
      this.setConnectionState('ERROR');
    };
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logError({
        category: 'network',
        type: 'websocket.send-skipped-not-open',
        level: 'warn',
        message: 'Skipped WebSocket send because the socket is not open',
        handled: true,
        context: {
          readyState: this.ws?.readyState ?? null,
          messageType: msg.type,
        },
      });
      return;
    }
    if (this.ws.bufferedAmount > WS_MAX_BUFFERED_BYTES) {
      logError({
        category: 'network',
        type: 'websocket.send-skipped-buffer-limit',
        level: 'warn',
        message: 'Skipped WebSocket send because bufferedAmount exceeded the safety limit',
        handled: true,
        context: {
          bufferedAmount: this.ws.bufferedAmount,
          maxBufferedBytes: WS_MAX_BUFFERED_BYTES,
          messageType: msg.type,
        },
      });
      return;
    }
    const encoded = pack(msg);
    this.recordOutgoingTraffic(encoded.byteLength);
    this.ws.send(encoded);
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
    this.shouldReconnect = false;
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
    this.resetSnapshotTracking();
    this.resetNetworkStats();
    this.setConnectionState('DISCONNECTED');
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getPerformanceStats(): NetworkPerformanceStats {
    this.flushNetworkStatsWindow();
    this.networkStats.bufferedAmount = this.ws?.bufferedAmount ?? 0;
    return this.networkStats;
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

  private resetSnapshotTracking(): void {
    this.snapshotInstanceId = null;
    this.lastSnapshotTick = -1;
    this.hasSnapshotBase = false;
  }

  private resetNetworkStats(): void {
    this.networkStatsWindowStartedAt = performance.now();
    this.incomingBytesThisWindow = 0;
    this.incomingMessagesThisWindow = 0;
    this.outgoingBytesThisWindow = 0;
    this.outgoingMessagesThisWindow = 0;
    this.networkStats.incomingBytesPerSecond = 0;
    this.networkStats.incomingMessagesPerSecond = 0;
    this.networkStats.outgoingBytesPerSecond = 0;
    this.networkStats.outgoingMessagesPerSecond = 0;
    this.networkStats.bufferedAmount = this.ws?.bufferedAmount ?? 0;
  }

  private recordIncomingTraffic(raw: unknown): void {
    const byteLength =
      raw instanceof ArrayBuffer ? raw.byteLength : raw instanceof Blob ? raw.size : 0;
    this.incomingBytesThisWindow += byteLength;
    this.incomingMessagesThisWindow += 1;
    this.flushNetworkStatsWindow();
  }

  private recordOutgoingTraffic(byteLength: number): void {
    this.outgoingBytesThisWindow += byteLength;
    this.outgoingMessagesThisWindow += 1;
    this.flushNetworkStatsWindow();
  }

  private flushNetworkStatsWindow(): void {
    const now = performance.now();
    const elapsedMs = now - this.networkStatsWindowStartedAt;
    this.networkStats.bufferedAmount = this.ws?.bufferedAmount ?? 0;
    if (elapsedMs < NETWORK_STATS_WINDOW_MS) {
      return;
    }

    const scale = 1000 / elapsedMs;
    this.networkStats.incomingBytesPerSecond = Math.round(this.incomingBytesThisWindow * scale);
    this.networkStats.incomingMessagesPerSecond = Math.round(
      this.incomingMessagesThisWindow * scale
    );
    this.networkStats.outgoingBytesPerSecond = Math.round(this.outgoingBytesThisWindow * scale);
    this.networkStats.outgoingMessagesPerSecond = Math.round(
      this.outgoingMessagesThisWindow * scale
    );

    this.networkStatsWindowStartedAt = now;
    this.incomingBytesThisWindow = 0;
    this.incomingMessagesThisWindow = 0;
    this.outgoingBytesThisWindow = 0;
    this.outgoingMessagesThisWindow = 0;
  }

  private filterSnapshotMessage(message: ServerMessage): ServerMessage | null {
    if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT) {
      this.snapshotInstanceId = message.instanceId;
      this.lastSnapshotTick = -1;
      this.hasSnapshotBase = true;
      return message;
    }

    if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA) {
      if (message.full) {
        this.snapshotInstanceId = message.instanceId;
        this.lastSnapshotTick = message.tick;
        this.hasSnapshotBase = true;
        return message;
      }

      if (!this.hasSnapshotBase || this.snapshotInstanceId !== message.instanceId) {
        return null;
      }

      if (message.tick <= this.lastSnapshotTick) {
        return null;
      }

      this.lastSnapshotTick = message.tick;
    }

    return message;
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
    } catch (error) {
      logError({
        category: 'network',
        type: 'websocket.decode-failed',
        message: 'Failed to decode server message payload',
        error,
      });
      return null;
    }
  }
}
