import type { InputMessage, PlayerSnapshot } from '@/shared';
import { getDeltaForInput } from './movement.js';
import { getDashDelta, getDashDirection } from './player.js';

export interface PendingInput {
  input: InputMessage;
  dtMs: number;
  sentAtMs: number;
  speedMultiplier?: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  wave: boolean;
  numb: boolean;
  pull: boolean;
  venom: boolean;
  confusion: boolean;
  dash: boolean;
  grenade: boolean;
  molotov: boolean;
  landmine: boolean;
  shuriken: boolean;
  spikedBalls: boolean;
}

export interface ReconcileOptions {
  maxPendingInputs?: number;
  maxPendingInputAgeMs?: number;
  snapDistance?: number;
  minBlend?: number;
  maxBlend?: number;
  blendRampDistance?: number;
  deadzoneDistance?: number;
}

export interface ReconciledPosition {
  x: number;
  y: number;
  filteredPending: PendingInput[];
  resetAccumulator: boolean;
}

const DEFAULTS: Required<ReconcileOptions> = {
  maxPendingInputs: 128,
  maxPendingInputAgeMs: 1500,
  snapDistance: 120,
  minBlend: 0.08,
  maxBlend: 0.24,
  blendRampDistance: 40,
  deadzoneDistance: 0.75,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function trimPendingInputs(
  pendingInputs: PendingInput[],
  maxPendingInputs = DEFAULTS.maxPendingInputs
): void {
  if (pendingInputs.length > maxPendingInputs) {
    pendingInputs.splice(0, pendingInputs.length - maxPendingInputs);
  }
}

export function getPredictedPosition(
  serverPlayer: PlayerSnapshot,
  pendingInputs: PendingInput[],
  moveSpeed: number,
  timeNowMs: number,
  options: ReconcileOptions = {}
): { x: number; y: number; filteredPending: PendingInput[] } {
  const settings = { ...DEFAULTS, ...options };
  const acknowledged = serverPlayer.lastProcessedInputSeq;
  const filteredPending = pendingInputs.filter(
    (entry) =>
      entry.input.seq > acknowledged && timeNowMs - entry.sentAtMs <= settings.maxPendingInputAgeMs
  );

  let x = serverPlayer.x;
  let y = serverPlayer.y;
  let direction = serverPlayer.direction;

  for (const pending of filteredPending) {
    if (pending.input.dash) {
      const dashDirection = getDashDirection(pending.input, direction);
      if (dashDirection) {
        const dash = getDashDelta(dashDirection);
        x += dash.dx;
        y += dash.dy;
        direction = dashDirection;
        continue;
      }
    }

    const delta = getDeltaForInput(
      pending.input,
      pending.dtMs,
      moveSpeed,
      pending.speedMultiplier ?? 1
    );
    x += delta.dx;
    y += delta.dy;

    const nextDirection = getDashDirection(pending.input, null);
    if (nextDirection) {
      direction = nextDirection;
    }
  }

  return { x, y, filteredPending };
}

export function reconcilePredictedPosition(
  timeNowMs: number,
  serverPlayer: PlayerSnapshot,
  pendingInputs: PendingInput[],
  currentTarget: { x: number; y: number },
  moveSpeed: number,
  options: ReconcileOptions = {}
): ReconciledPosition {
  const settings = { ...DEFAULTS, ...options };
  const {
    x: predictedX,
    y: predictedY,
    filteredPending,
  } = getPredictedPosition(serverPlayer, pendingInputs, moveSpeed, timeNowMs, settings);

  if (serverPlayer.state === 'dead') {
    return {
      x: serverPlayer.x,
      y: serverPlayer.y,
      filteredPending: [],
      resetAccumulator: true,
    };
  }

  const errorX = predictedX - currentTarget.x;
  const errorY = predictedY - currentTarget.y;
  const errorDistance = Math.sqrt(errorX * errorX + errorY * errorY);
  const shouldSnap = errorDistance > settings.snapDistance;
  const shouldIgnoreTinyError = errorDistance <= settings.deadzoneDistance;
  const blendProgress = clamp(errorDistance / settings.blendRampDistance, 0, 1);
  const blend = lerp(settings.minBlend, settings.maxBlend, blendProgress);

  return {
    x: shouldSnap
      ? predictedX
      : shouldIgnoreTinyError
        ? currentTarget.x
        : currentTarget.x + (predictedX - currentTarget.x) * blend,
    y: shouldSnap
      ? predictedY
      : shouldIgnoreTinyError
        ? currentTarget.y
        : currentTarget.y + (predictedY - currentTarget.y) * blend,
    filteredPending,
    resetAccumulator: false,
  };
}
