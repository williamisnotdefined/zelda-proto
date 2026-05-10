import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkManager } from './NetworkManager';

let sockets: FakeWebSocket[] = [];

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  binaryType: BinaryType = 'blob';
  bufferedAmount = 0;
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    sockets.push(this);
  }

  send(): void {}

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  emitClose(event: Partial<CloseEvent> = {}): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({
      code: 1000,
      reason: '',
      wasClean: true,
      ...event,
    } as CloseEvent);
  }
}

describe('NetworkManager', () => {
  beforeEach(() => {
    sockets = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ignores stale close events from a previous socket', () => {
    const manager = new NetworkManager();

    manager.connect();
    const firstSocket = sockets[0];
    manager.disconnect();

    manager.connect();
    const secondSocket = sockets[1];
    firstSocket.emitClose({ code: 1006, wasClean: false });

    expect(sockets).toHaveLength(2);
    expect(manager.getConnectionState()).toBe('CONNECTING');

    secondSocket.emitOpen();

    expect(manager.getConnectionState()).toBe('CONNECTED');

    manager.disconnect();
  });
});
