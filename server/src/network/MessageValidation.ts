import { CLIENT_MESSAGE_TYPES } from '@gelehka/shared';
import { parseClientMessage } from '@gelehka/shared/protocol';
import type { ClientMessage } from './MessageTypes.js';

export type ValidationFailureReason =
  | 'invalid_message'
  | 'protocol_mismatch'
  | 'join_required'
  | 'already_joined';

export type ValidationResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; reason: ValidationFailureReason };

export function validateClientMessage(raw: unknown, hasJoined: boolean): ValidationResult {
  const parsed = parseClientMessage(raw);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }

  if (
    parsed.value.type === CLIENT_MESSAGE_TYPES.JOIN ||
    parsed.value.type === CLIENT_MESSAGE_TYPES.RESUME_SESSION
  ) {
    if (hasJoined) {
      return { ok: false, reason: 'already_joined' };
    }

    return { ok: true, message: parsed.value };
  }

  if (!hasJoined) {
    return { ok: false, reason: 'join_required' };
  }

  return { ok: true, message: parsed.value };
}
