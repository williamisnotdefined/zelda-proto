import { pack, unpack } from 'msgpackr';
import { RawData, WebSocket } from 'ws';
import { ClientMessage, ServerMessage } from './MessageTypes.js';

const MAX_BUFFERED_BYTES = 512 * 1024;

export class NetworkManager {
  decodeClientMessage(data: RawData): ClientMessage | null {
    if (typeof data === 'string') {
      return this.tryParseJson(data);
    }

    if (data instanceof Buffer) {
      const asBinary = this.tryUnpack(data);
      if (asBinary) return asBinary;
      return this.tryParseJson(data.toString());
    }

    if (Array.isArray(data)) {
      const merged = Buffer.concat(data);
      const asBinary = this.tryUnpack(merged);
      if (asBinary) return asBinary;
      return this.tryParseJson(merged.toString());
    }

    if (data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(data);
      const asBinary = this.tryUnpack(bytes);
      if (asBinary) return asBinary;
      return this.tryParseJson(Buffer.from(bytes).toString());
    }

    return null;
  }

  send(ws: WebSocket, message: ServerMessage): boolean {
    if (ws.readyState !== WebSocket.OPEN) return false;

    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      return false;
    }

    ws.send(pack(message));
    return true;
  }

  private tryParseJson(data: string): ClientMessage | null {
    try {
      return JSON.parse(data) as ClientMessage;
    } catch {
      return null;
    }
  }

  private tryUnpack(data: Uint8Array): ClientMessage | null {
    try {
      return unpack(data) as ClientMessage;
    } catch {
      return null;
    }
  }
}
