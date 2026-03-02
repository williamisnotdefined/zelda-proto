import { CLIENT_MESSAGE_TYPES, PROTOCOL_VERSION } from '@gelehka/shared';
import type { ClientMessage } from './MessageTypes.js';

type JoinMessage = Extract<ClientMessage, { type: typeof CLIENT_MESSAGE_TYPES.JOIN }>;
type InputMessage = Extract<ClientMessage, { type: typeof CLIENT_MESSAGE_TYPES.INPUT }>;
type ChatMessage = Extract<ClientMessage, { type: typeof CLIENT_MESSAGE_TYPES.CHAT }>;

export const MAX_NICKNAME_LENGTH = 16;
export const MAX_CHAT_LENGTH = 100;

export type ValidationFailureReason =
  | 'invalid_message'
  | 'protocol_mismatch'
  | 'join_required'
  | 'already_joined';

export type ValidationResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; reason: ValidationFailureReason };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExpectedProtocolVersion(value: Record<string, unknown>): boolean {
  return value.protocolVersion === PROTOCOL_VERSION;
}

function isValidJoinMessage(value: unknown): value is JoinMessage {
  if (!isRecord(value)) return false;
  return (
    value.type === CLIENT_MESSAGE_TYPES.JOIN &&
    hasExpectedProtocolVersion(value) &&
    typeof value.nickname === 'string' &&
    value.nickname.length > 0 &&
    value.nickname.length <= MAX_NICKNAME_LENGTH
  );
}

function isValidInputMessage(value: unknown): value is InputMessage {
  if (!isRecord(value)) return false;
  return (
    value.type === CLIENT_MESSAGE_TYPES.INPUT &&
    hasExpectedProtocolVersion(value) &&
    typeof value.seq === 'number' &&
    Number.isSafeInteger(value.seq) &&
    value.seq >= 0 &&
    typeof value.up === 'boolean' &&
    typeof value.down === 'boolean' &&
    typeof value.left === 'boolean' &&
    typeof value.right === 'boolean' &&
    typeof value.attack === 'boolean'
  );
}

function isValidChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false;
  return (
    value.type === CLIENT_MESSAGE_TYPES.CHAT &&
    hasExpectedProtocolVersion(value) &&
    typeof value.text === 'string' &&
    value.text.length > 0 &&
    value.text.length <= MAX_CHAT_LENGTH
  );
}

export function validateClientMessage(raw: unknown, hasJoined: boolean): ValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'invalid_message' };
  }

  if (raw.protocolVersion !== PROTOCOL_VERSION) {
    return { ok: false, reason: 'protocol_mismatch' };
  }

  if (isValidJoinMessage(raw)) {
    if (hasJoined) {
      return { ok: false, reason: 'already_joined' };
    }
    return { ok: true, message: raw };
  }

  if (isValidInputMessage(raw) || isValidChatMessage(raw)) {
    if (!hasJoined) {
      return { ok: false, reason: 'join_required' };
    }
    return { ok: true, message: raw };
  }

  return { ok: false, reason: 'invalid_message' };
}
