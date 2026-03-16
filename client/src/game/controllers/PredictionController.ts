import type { PlayerSnapshot } from '@gelehka/shared';
import {
  PLAYER_ATTACK_SPEED_PENALTY,
  PLAYER_SPEED,
  getDeltaForInput,
  reconcilePredictedPosition,
  trimPendingInputs,
} from '@gelehka/game-core';
import type {
  InputState as CoreInputState,
  PendingInput as CorePendingInput,
} from '@gelehka/game-core';
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

    const speedPenalty = entity.serverState === 'attacking' ? PLAYER_ATTACK_SPEED_PENALTY : 1;
    const delta = getDeltaForInput(input, dtMs, PLAYER_SPEED, speedPenalty);
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
          serverPlayer.statusEffects
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
        serverPlayer.statusEffects
      );

      return reconciled.filteredPending;
    }

    return pendingInputs;
  }
}
