import { pack, unpack } from 'msgpackr';
import { resolveWebSocketUrl } from '@gelehka/game-core/network';
import {
  createSnapshotNormalizationState,
  normalizeServerMessage,
} from '@gelehka/game-core/snapshot';
import { PROTOCOL_VERSION } from '@gelehka/shared';
import { WS_MAX_BUFFERED_BYTES } from '@gelehka/shared/constants';
import type { ClientMessage, ServerMessage } from '@gelehka/shared';

type MessageHandler = (msg: ServerMessage) => void;
type ErrorHandler = (error: string) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;

const WS_URL = resolveWebSocketUrl({
  explicitUrl: import.meta.env.VITE_WS_URL,
  location: typeof window !== 'undefined' ? window.location : null,
});
const MAX_CONNECTION_TIMEOUT = 30000;

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export class NetworkManager {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];
  private openCallbacks: (() => void)[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionState: ConnectionState = 'DISCONNECTED';
  private normalizationState = createSnapshotNormalizationState();
  private shouldReconnect = true;

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
      this.normalizationState = createSnapshotNormalizationState();
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
      this.normalizationState = createSnapshotNormalizationState();
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

      const normalized = normalizeServerMessage(message, this.normalizationState);
      if (!normalized) {
        return;
      }
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
      if (this.shouldReconnect && !this.reconnectTimer) {
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
    this.normalizationState = createSnapshotNormalizationState();
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
}
