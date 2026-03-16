import type { ClientMessage, ServerMessage } from '@gelehka/shared';
import {
  createChatMessage,
  createJoinMessage,
  parseChatText,
  parseNickname,
} from '@gelehka/shared/protocol';
import { ConnectionState, NetworkManager } from './NetworkManager';
import type { NetworkPerformanceStats } from './NetworkManager';
import { useGameStore } from '../ui/store';

type MessageHandler = (msg: ServerMessage) => void;
type ErrorHandler = (error: string) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;

const networkManager = new NetworkManager();
let desiredNickname: string | null = null;

networkManager.onConnectionState((state) => {
  useGameStore.getState().setConnectionState(state);
  useGameStore.getState().setConnected(state === 'CONNECTED');
  if (state === 'CONNECTING') {
    useGameStore.getState().setLastConnectionAttempt(Date.now());
  }

  if (state !== 'CONNECTED' || !desiredNickname) {
    return;
  }

  networkManager.send(createJoinMessage(desiredNickname));
});

networkManager.onError((error) => {
  useGameStore.getState().setConnectionError(error);
});

networkManager.onMessage((msg) => {
  if (msg.type !== 'welcome') {
    return;
  }

  useGameStore.getState().setLocalPlayerId(msg.id);
  useGameStore.getState().setConnectionError(null);
});

export function connect(): void {
  networkManager.connect();
}

export function send(msg: ClientMessage): void {
  networkManager.send(msg);
}

export function sendJoin(nickname: string): void {
  const parsed = parseNickname(nickname);
  if (!parsed.ok) {
    return;
  }

  desiredNickname = parsed.value;

  if (getConnectionState() === 'CONNECTED') {
    send(createJoinMessage(parsed.value));
  }
}

export function sendChat(text: string): void {
  const parsed = parseChatText(text);
  if (!parsed.ok) {
    return;
  }

  send(createChatMessage(parsed.value));
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
  networkManager.disconnect();
}
