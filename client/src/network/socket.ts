import type { ClientMessage, ServerMessage } from '@/shared';
import {
  createJoinMessage,
  createResumeSessionMessage,
  parseNickname,
} from '@/shared/protocol';
import { ConnectionState, NetworkManager } from './NetworkManager';
import type { NetworkPerformanceStats } from './NetworkManager';
import {
  clearStoredConnectionContext,
  clearStoredSessionToken,
  persistNickname,
  persistSessionToken,
  readStoredConnectionContext,
} from './sessionContext';

type MessageHandler = (msg: ServerMessage) => void;
type ErrorHandler = (error: string) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;

const networkManager = new NetworkManager();
const storedConnectionContext = readStoredConnectionContext();
let desiredNickname: string | null = storedConnectionContext.nickname;
let sessionToken: string | null = storedConnectionContext.sessionToken;

networkManager.onConnectionState((state) => {
  if (state !== 'CONNECTED') {
    return;
  }

  if (sessionToken) {
    networkManager.send(createResumeSessionMessage(sessionToken));
    return;
  }

  if (!desiredNickname) {
    return;
  }

  networkManager.send(createJoinMessage(desiredNickname));
});

networkManager.onMessage((msg) => {
  if (msg.type === 'resume_rejected') {
    if (msg.reason === 'session_in_use') return;

    sessionToken = null;
    clearStoredSessionToken();

    if (desiredNickname && getConnectionState() === 'CONNECTED') {
      networkManager.send(createJoinMessage(desiredNickname));
    }
    return;
  }

  if (msg.type !== 'welcome') {
    return;
  }

  sessionToken = msg.sessionToken;
  persistSessionToken(msg.sessionToken);
});

export function connect(): void {
  networkManager.connect();
}

export function restoreConnectionIfNeeded(): void {
  if (!desiredNickname && !sessionToken) {
    return;
  }

  connect();
}

export function send(msg: ClientMessage): boolean {
  return networkManager.send(msg);
}

export function canSend(): boolean {
  return networkManager.canSend();
}

export function sendJoin(nickname: string): void {
  const parsed = parseNickname(nickname);
  if (!parsed.ok) {
    return;
  }

  desiredNickname = parsed.value;
  sessionToken = null;
  persistNickname(parsed.value);
  clearStoredSessionToken();

  if (getConnectionState() === 'CONNECTED') {
    send(createJoinMessage(parsed.value));
  }
}

export function onceOpen(cb: () => void): void {
  networkManager.onceOpen(cb);
}

export function onMessage(handler: MessageHandler): () => void {
  return networkManager.onMessage(handler);
}

export function onError(handler: ErrorHandler): () => void {
  return networkManager.onError(handler);
}

export function onConnectionState(handler: ConnectionStateHandler): () => void {
  return networkManager.onConnectionState(handler);
}

export function getConnectionState(): ConnectionState {
  return networkManager.getConnectionState();
}

export function getNetworkStats(): NetworkPerformanceStats {
  return networkManager.getPerformanceStats();
}

export function disconnect(): void {
  desiredNickname = null;
  sessionToken = null;
  clearStoredConnectionContext();
  networkManager.disconnect();
}

export function disposeConnection(): void {
  networkManager.disconnect();
}

export function hasDesiredNickname(): boolean {
  return desiredNickname !== null;
}
