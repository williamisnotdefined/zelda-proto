import { WS_MAX_BUFFERED_BYTES } from '@gelehka/shared/constants';
import { pack, unpack } from 'msgpackr';
import { RawData, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from './MessageTypes.js';

export class NetworkManager {
  decodeClientMessage(data: RawData): ClientMessage | null {
    if (data instanceof Buffer) {
      return this.tryUnpack(data);
    }

    if (Array.isArray(data)) {
      const merged = Buffer.concat(data);
      return this.tryUnpack(merged);
    }

    if (data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(data);
      return this.tryUnpack(bytes);
    }

    return null;
  }

  send(ws: WebSocket, message: ServerMessage): boolean {
    if (ws.readyState !== WebSocket.OPEN) return false;

    if (ws.bufferedAmount > WS_MAX_BUFFERED_BYTES) {
      return false;
    }

    ws.send(pack(message));
    return true;
  }

  private tryUnpack(data: Uint8Array): ClientMessage | null {
    try {
      return unpack(data) as ClientMessage;
    } catch {
      return null;
    }
  }
}
