import type { InputMessage, PlayerSnapshot } from '@gelehka/shared';
import {
  getDeltaForInput,
  reconcilePredictedPosition,
  trimPendingInputs,
} from '@gelehka/game-core';
import { PlayerEntity } from '../../entities/Player';

const PLAYER_PREDICT_SPEED = 150;
const PLAYER_ATTACK_SPEED_PENALTY = 0.5;

export interface PendingInput {
  input: InputMessage;
  dtMs: number;
  sentAtMs: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
}

export class PredictionController {
  trimPendingInputs(pendingInputs: PendingInput[]): void {
    trimPendingInputs(pendingInputs);
  }

  applyLocalPrediction(input: InputState, dtMs: number, entity: PlayerEntity | null): void {
    if (!entity) return;
    if (entity.serverState === 'dead') return;

    const speedPenalty = entity.serverState === 'attacking' ? PLAYER_ATTACK_SPEED_PENALTY : 1;
    const delta = getDeltaForInput(input, dtMs, PLAYER_PREDICT_SPEED, speedPenalty);
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
        PLAYER_PREDICT_SPEED
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
