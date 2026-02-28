import type { ClientMessage, ServerMessage } from '@gelehka/shared';
import { ConnectionState, NetworkManager } from './NetworkManager';

type MessageHandler = (msg: ServerMessage) => void;
type ErrorHandler = (error: string) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;

const networkManager = new NetworkManager();

export function connect(): void {
  networkManager.connect();
}

export function send(msg: ClientMessage): void {
  networkManager.send(msg);
}

export function sendJoin(nickname: string): void {
  send({ type: 'join', nickname });
}

export function sendChat(text: string): void {
  send({ type: 'chat', text });
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

export function disconnect(): void {
  networkManager.disconnect();
}
