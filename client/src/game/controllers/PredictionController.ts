import type { Direction, PlayerSnapshot } from '@/shared';
import {
  PLAYER_SPEED,
  getDashDelta,
  getDashDirection,
  getDeltaForInput,
  reconcilePredictedPosition,
  trimPendingInputs,
} from '@/game-core';
import type { InputState as CoreInputState, PendingInput as CorePendingInput } from '@/game-core';
import { PlayerEntity } from '../../entities/Player';

export type PendingInput = CorePendingInput;
export type InputState = CoreInputState;

export class PredictionController {
  trimPendingInputs(pendingInputs: PendingInput[]): void {
    trimPendingInputs(pendingInputs);
  }

  applyLocalPrediction(input: InputState, dtMs: number, entity: PlayerEntity | null): void {
    if (!entity) return;
    if (entity.serverState === 'dead') return;

    if (input.dash) {
      const dashDirection = getDashDirection(input, entity.serverDirection as Direction);
      if (dashDirection) {
        const dash = getDashDelta(dashDirection);
        entity.targetX += dash.dx;
        entity.targetY += dash.dy;
        return;
      }
    }

    const delta = getDeltaForInput(input, dtMs, PLAYER_SPEED, 1);
    if (delta.dx === 0 && delta.dy === 0) return;

    entity.targetX += delta.dx;
    entity.targetY += delta.dy;
  }

  reconcileLocalPrediction(
    timeNowMs: number,
    serverPlayer: PlayerSnapshot,
    localEntity: PlayerEntity | null,
    pendingInputs: PendingInput[],
    onResetAccumulator: () => void
  ): PendingInput[] {
    if (serverPlayer.state === 'dead') {
      if (localEntity) {
        localEntity.updateFromServer(
          serverPlayer.x,
          serverPlayer.y,
          serverPlayer.hp,
          serverPlayer.maxHp,
          serverPlayer.state,
          serverPlayer.direction,
          serverPlayer.statusEffects,
          serverPlayer.shurikenActive === true
        );
      }
      onResetAccumulator();
      return [];
    }

    if (localEntity) {
      const reconciled = reconcilePredictedPosition(
        timeNowMs,
        serverPlayer,
        pendingInputs,
        { x: localEntity.targetX, y: localEntity.targetY },
        PLAYER_SPEED
      );

      localEntity.updateFromServer(
        reconciled.x,
        reconciled.y,
        serverPlayer.hp,
        serverPlayer.maxHp,
        serverPlayer.state,
        serverPlayer.direction,
        serverPlayer.statusEffects,
        serverPlayer.shurikenActive === true
      );

      return reconciled.filteredPending;
    }

    return pendingInputs;
  }
}
