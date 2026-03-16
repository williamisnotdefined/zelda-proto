import {
  createInputMessage as createSharedInputMessage,
  type ClientInputState,
} from '@gelehka/shared/protocol';
import type { InputMessage } from '@gelehka/shared';

export type RuntimeInputState = ClientInputState;

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
  return createSharedInputMessage(seq, input);
}
