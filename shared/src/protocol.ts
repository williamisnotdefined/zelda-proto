import { MAX_CHAT_LENGTH, MAX_NICKNAME_LENGTH, MIN_NICKNAME_LENGTH } from './constants';
import {
  CLIENT_MESSAGE_TYPES,
  INSTANCE_IDS,
  PROTOCOL_VERSION,
  SNAPSHOT_RESYNC_REASONS,
  type ClientChatMessage,
  type ClientMessage,
  type InputMessage,
  type InstanceId,
  type JoinMessage,
  type SnapshotResyncReason,
  type SnapshotResyncRequestMessage,
} from './types';

const NICKNAME_PATTERN = /^[A-Za-z0-9 ]+$/;

export type NicknameValidationReason = 'too_short' | 'too_long' | 'invalid_characters';
export type ChatTextValidationReason = 'empty' | 'too_long' | 'invalid_characters';
export type ClientMessageParseFailureReason = 'invalid_message' | 'protocol_mismatch';

export type ParseResult<T, R extends string> = { ok: true; value: T } | { ok: false; reason: R };

export type ClientInputState = Pick<InputMessage, 'up' | 'down' | 'left' | 'right' | 'attack'>;
type ClientInputRecord = Record<keyof ClientInputState, boolean>;

const INSTANCE_ID_SET = new Set<string>(Object.values(INSTANCE_IDS));
const SNAPSHOT_RESYNC_REASON_SET = new Set<string>(Object.values(SNAPSHOT_RESYNC_REASONS));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }

  return false;
}

function hasBooleanFields(
  value: Record<string, unknown>,
  fields: Array<keyof ClientInputState>
): boolean {
  return fields.every((field) => typeof value[field] === 'boolean');
}

export function normalizeNickname(value: string): string {
  return value.trim();
}

export function parseNickname(value: string): ParseResult<string, NicknameValidationReason> {
  const normalized = normalizeNickname(value);

  if (normalized.length < MIN_NICKNAME_LENGTH) {
    return { ok: false, reason: 'too_short' };
  }

  if (normalized.length > MAX_NICKNAME_LENGTH) {
    return { ok: false, reason: 'too_long' };
  }

  if (!NICKNAME_PATTERN.test(normalized)) {
    return { ok: false, reason: 'invalid_characters' };
  }

  return { ok: true, value: normalized };
}

export function normalizeChatText(value: string): string {
  return value.trim();
}

export function parseChatText(value: string): ParseResult<string, ChatTextValidationReason> {
  const normalized = normalizeChatText(value);

  if (normalized.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  if (normalized.length > MAX_CHAT_LENGTH) {
    return { ok: false, reason: 'too_long' };
  }

  if (hasControlCharacters(normalized)) {
    return { ok: false, reason: 'invalid_characters' };
  }

  return { ok: true, value: normalized };
}

export function createJoinMessage(nickname: string): JoinMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: CLIENT_MESSAGE_TYPES.JOIN,
    nickname,
  };
}

export function createChatMessage(text: string): ClientChatMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: CLIENT_MESSAGE_TYPES.CHAT,
    text,
  };
}

export function createInputMessage(seq: number, input: ClientInputState): InputMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: CLIENT_MESSAGE_TYPES.INPUT,
    seq,
    up: input.up,
    down: input.down,
    left: input.left,
    right: input.right,
    attack: input.attack,
  };
}

export function createSnapshotResyncMessage(
  reason: SnapshotResyncReason,
  options: {
    lastTick?: number;
    instanceId?: InstanceId | null;
  } = {}
): SnapshotResyncRequestMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: CLIENT_MESSAGE_TYPES.SNAPSHOT_RESYNC,
    reason,
    lastTick: options.lastTick ?? -1,
    instanceId: options.instanceId ?? null,
  };
}

export function parseClientMessage(
  raw: unknown
): ParseResult<ClientMessage, ClientMessageParseFailureReason> {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'invalid_message' };
  }

  if (raw.protocolVersion !== PROTOCOL_VERSION) {
    return { ok: false, reason: 'protocol_mismatch' };
  }

  if (raw.type === CLIENT_MESSAGE_TYPES.JOIN) {
    if (typeof raw.nickname !== 'string') {
      return { ok: false, reason: 'invalid_message' };
    }

    const nickname = parseNickname(raw.nickname);
    if (!nickname.ok) {
      return { ok: false, reason: 'invalid_message' };
    }

    return { ok: true, value: createJoinMessage(nickname.value) };
  }

  if (raw.type === CLIENT_MESSAGE_TYPES.CHAT) {
    if (typeof raw.text !== 'string') {
      return { ok: false, reason: 'invalid_message' };
    }

    const text = parseChatText(raw.text);
    if (!text.ok) {
      return { ok: false, reason: 'invalid_message' };
    }

    return { ok: true, value: createChatMessage(text.value) };
  }

  if (raw.type === CLIENT_MESSAGE_TYPES.INPUT) {
    if (
      typeof raw.seq !== 'number' ||
      !Number.isSafeInteger(raw.seq) ||
      raw.seq < 0 ||
      !hasBooleanFields(raw, ['up', 'down', 'left', 'right', 'attack'])
    ) {
      return { ok: false, reason: 'invalid_message' };
    }

    const input = raw as Record<string, unknown> & ClientInputRecord;

    return {
      ok: true,
      value: createInputMessage(raw.seq, {
        up: input.up,
        down: input.down,
        left: input.left,
        right: input.right,
        attack: input.attack,
      }),
    };
  }

  if (raw.type === CLIENT_MESSAGE_TYPES.SNAPSHOT_RESYNC) {
    if (
      typeof raw.reason !== 'string' ||
      !SNAPSHOT_RESYNC_REASON_SET.has(raw.reason) ||
      typeof raw.lastTick !== 'number' ||
      !Number.isSafeInteger(raw.lastTick) ||
      raw.lastTick < -1 ||
      (raw.instanceId !== null &&
        (typeof raw.instanceId !== 'string' || !INSTANCE_ID_SET.has(raw.instanceId)))
    ) {
      return { ok: false, reason: 'invalid_message' };
    }

    return {
      ok: true,
      value: createSnapshotResyncMessage(raw.reason as SnapshotResyncReason, {
        lastTick: raw.lastTick,
        instanceId: raw.instanceId as InstanceId | null,
      }),
    };
  }

  return { ok: false, reason: 'invalid_message' };
}
