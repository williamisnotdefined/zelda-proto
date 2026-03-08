import { CLIENT_MESSAGE_TYPES, PROTOCOL_VERSION } from '@gelehka/shared';
import type { InputMessage } from '@gelehka/shared';

export interface RuntimeInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
}

export function hasDirectionalChange(
  previous: RuntimeInputState | null,
  next: RuntimeInputState
): boolean {
  if (!previous) {
    return true;
  }

  return (
    previous.up !== next.up ||
    previous.down !== next.down ||
    previous.left !== next.left ||
    previous.right !== next.right
  );
}

export function createInputMessage(seq: number, input: RuntimeInputState): InputMessage {
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
