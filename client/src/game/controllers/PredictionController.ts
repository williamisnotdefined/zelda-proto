import type { InputMessage, PlayerSnapshot } from '@gelehka/shared';
import Phaser from 'phaser';
import { PlayerEntity } from '../../entities/Player';
import { getDeltaForInput } from '../utils/movement';

const PLAYER_PREDICT_SPEED = 150;
const PLAYER_ATTACK_SPEED_PENALTY = 0.5;
const MAX_PENDING_INPUTS = 128;
const MAX_PENDING_INPUT_AGE_MS = 1500;
const RECONCILE_SNAP_DISTANCE = 120;
const RECONCILE_MIN_BLEND = 0.08;
const RECONCILE_MAX_BLEND = 0.24;
const RECONCILE_BLEND_RAMP_DISTANCE = 40;
const RECONCILE_DEADZONE_DISTANCE = 0.75;

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
    if (pendingInputs.length > MAX_PENDING_INPUTS) {
      pendingInputs.splice(0, pendingInputs.length - MAX_PENDING_INPUTS);
    }
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
    const acknowledged = serverPlayer.lastProcessedInputSeq;
    const filteredPending = pendingInputs.filter(
      (entry) =>
        entry.input.seq > acknowledged && timeNowMs - entry.sentAtMs <= MAX_PENDING_INPUT_AGE_MS
    );

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

    let predictedX = serverPlayer.x;
    let predictedY = serverPlayer.y;

    for (const pending of filteredPending) {
      const delta = getDeltaForInput(pending.input, pending.dtMs, PLAYER_PREDICT_SPEED);
      predictedX += delta.dx;
      predictedY += delta.dy;
    }

    if (localEntity) {
      const errorX = predictedX - localEntity.targetX;
      const errorY = predictedY - localEntity.targetY;
      const errorDist = Math.sqrt(errorX * errorX + errorY * errorY);
      const shouldSnap = errorDist > RECONCILE_SNAP_DISTANCE;
      const shouldIgnoreTinyError = errorDist <= RECONCILE_DEADZONE_DISTANCE;

      const blendProgress = Phaser.Math.Clamp(errorDist / RECONCILE_BLEND_RAMP_DISTANCE, 0, 1);
      const blend = Phaser.Math.Linear(RECONCILE_MIN_BLEND, RECONCILE_MAX_BLEND, blendProgress);

      const correctedX = shouldSnap
        ? predictedX
        : shouldIgnoreTinyError
          ? localEntity.targetX
          : localEntity.targetX + (predictedX - localEntity.targetX) * blend;
      const correctedY = shouldSnap
        ? predictedY
        : shouldIgnoreTinyError
          ? localEntity.targetY
          : localEntity.targetY + (predictedY - localEntity.targetY) * blend;

      localEntity.updateFromServer(
        correctedX,
        correctedY,
        serverPlayer.hp,
        serverPlayer.maxHp,
        serverPlayer.state,
        serverPlayer.direction,
        serverPlayer.statusEffects
      );
    }

    return filteredPending;
  }
}
