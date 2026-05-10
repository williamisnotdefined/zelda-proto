import type { ClientMessage, ServerMessage } from '@/shared';
import type { ConnectionState, NetworkPerformanceStats } from './NetworkManager';
import {
  connect,
  disconnect,
  disposeConnection,
  getNetworkStats,
  hasDesiredNickname,
  onConnectionState,
  onError,
  onMessage,
  restoreConnectionIfNeeded,
  send,
  sendJoin,
  onceOpen,
  canSend,
} from './socket';

export type GameConnectionEvent =
  | { type: 'connection_state'; state: ConnectionState }
  | { type: 'error'; error: string }
  | { type: 'message'; message: ServerMessage };

export interface GameConnection {
  connect(): void;
  restoreIfNeeded(): void;
  disconnect(): void;
  dispose(): void;
  onceOpen(callback: () => void): void;
  send(message: ClientMessage): boolean;
  canSend(): boolean;
  sendJoin(nickname: string): void;
  getNetworkStats(): NetworkPerformanceStats;
  hasDesiredNickname(): boolean;
  onEvent(handler: (event: GameConnectionEvent) => void): () => void;
}

class SocketGameConnection implements GameConnection {
  connect(): void {
    connect();
  }

  restoreIfNeeded(): void {
    restoreConnectionIfNeeded();
  }

  disconnect(): void {
    disconnect();
  }

  dispose(): void {
    disposeConnection();
  }

  onceOpen(callback: () => void): void {
    onceOpen(callback);
  }

  send(message: ClientMessage): boolean {
    return send(message);
  }

  canSend(): boolean {
    return canSend();
  }

  sendJoin(nickname: string): void {
    sendJoin(nickname);
  }

  getNetworkStats(): NetworkPerformanceStats {
    return getNetworkStats();
  }

  hasDesiredNickname(): boolean {
    return hasDesiredNickname();
  }

  onEvent(handler: (event: GameConnectionEvent) => void): () => void {
    const removeConnectionStateHandler = onConnectionState((state) => {
      handler({ type: 'connection_state', state });
    });
    const removeErrorHandler = onError((error) => {
      handler({ type: 'error', error });
    });
    const removeMessageHandler = onMessage((message) => {
      handler({ type: 'message', message });
    });

    return () => {
      removeConnectionStateHandler();
      removeErrorHandler();
      removeMessageHandler();
    };
  }
}

export const gameConnection = new SocketGameConnection();
