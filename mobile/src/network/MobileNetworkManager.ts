import { pack, unpack } from 'msgpackr';
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

const MAX_CONNECTION_TIMEOUT = 30000;

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export class MobileNetworkManager {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionState: ConnectionState = 'DISCONNECTED';
  private normalizationState = createSnapshotNormalizationState();
  private url = '';

  connect(url: string): void {
    if (!url) {
      this.notifyError('Defina EXPO_PUBLIC_WS_URL para conectar o mobile.');
      this.setConnectionState('ERROR');
      return;
    }

    this.url = url;

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';
      this.normalizationState = createSnapshotNormalizationState();
    } catch (error) {
      this.notifyError(
        `Falha ao criar WebSocket: ${error instanceof Error ? error.message : 'erro desconhecido'}`
      );
      this.setConnectionState('ERROR');
      return;
    }

    this.setConnectionState('CONNECTING');

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    this.connectionTimeout = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        this.notifyError('Tempo limite de conexao atingido.');
        this.setConnectionState('ERROR');
        this.ws.close();
      }
    }, MAX_CONNECTION_TIMEOUT);

    this.ws.onopen = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      this.normalizationState = createSnapshotNormalizationState();
      this.setConnectionState('CONNECTED');
    };

    this.ws.onmessage = async (event) => {
      const message = await this.decodeServerMessage(event.data);
      if (!message) {
        return;
      }

      if (message.protocolVersion !== PROTOCOL_VERSION) {
        this.notifyError('Versao de protocolo incompativel com o servidor.');
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

      if (event.code === 1006) {
        this.notifyError('Conexao encerrada abruptamente.');
      } else if (!event.wasClean && event.code !== 1000) {
        this.notifyError(`Conexao perdida (codigo ${event.code}).`);
      }

      this.ws = null;
      this.setConnectionState('DISCONNECTED');

      if (this.url && !this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect(this.url);
        }, 2000);
      }
    };

    this.ws.onerror = () => {
      this.notifyError('Erro de WebSocket no cliente mobile.');
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

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((entry) => entry !== handler);
    };
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      this.errorHandlers = this.errorHandlers.filter((entry) => entry !== handler);
    };
  }

  onConnectionState(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.push(handler);
    handler(this.connectionState);
    return () => {
      this.connectionStateHandlers = this.connectionStateHandlers.filter(
        (entry) => entry !== handler
      );
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
    if (this.connectionState === state) {
      return;
    }
    this.connectionState = state;
    for (const handler of this.connectionStateHandlers) {
      handler(state);
    }
  }

  private async decodeServerMessage(raw: unknown): Promise<ServerMessage | null> {
    try {
      if (raw instanceof ArrayBuffer) {
        return unpack(new Uint8Array(raw)) as ServerMessage;
      }

      if (ArrayBuffer.isView(raw)) {
        return unpack(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)) as ServerMessage;
      }

      if (
        typeof raw === 'object' &&
        raw !== null &&
        'arrayBuffer' in raw &&
        typeof raw.arrayBuffer === 'function'
      ) {
        const arrayBuffer = await raw.arrayBuffer();
        return unpack(new Uint8Array(arrayBuffer)) as ServerMessage;
      }

      return null;
    } catch {
      return null;
    }
  }
}
