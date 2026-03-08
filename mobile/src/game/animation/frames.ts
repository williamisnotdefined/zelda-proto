import {
  BOSS_KINDS,
  ENEMY_KINDS,
  type BlobState,
  type BossKind,
  type BossState,
  type Direction,
  type EnemyKind,
  type PlayerState,
} from '@gelehka/shared';
import type { SpriteFrame } from '../assets/catalog';

interface SequenceDefinition {
  frameWidth: number;
  frameHeight: number;
  frames: number[];
  frameDurationMs: number;
}

const PLAYER_DIRECTION_OFFSET: Record<Direction, number> = {
  down: 0,
  left: 4,
  right: 8,
  up: 12,
};

const PLAYER_SEQUENCES: Record<PlayerState, SequenceDefinition> = {
  idle: { frameWidth: 48, frameHeight: 48, frames: [0], frameDurationMs: 220 },
  moving: { frameWidth: 48, frameHeight: 48, frames: [0, 1, 2, 3], frameDurationMs: 110 },
  attacking: { frameWidth: 48, frameHeight: 48, frames: [1, 2, 3, 2], frameDurationMs: 90 },
  dead: { frameWidth: 48, frameHeight: 48, frames: [0], frameDurationMs: 220 },
};

const ENEMY_SEQUENCES: Record<EnemyKind, Record<string, SequenceDefinition>> = {
  [ENEMY_KINDS.BLOB]: {
    idle: { frameWidth: 32, frameHeight: 32, frames: [0, 1], frameDurationMs: 170 },
    chasing: { frameWidth: 32, frameHeight: 32, frames: [0, 1, 2, 3], frameDurationMs: 110 },
    attacking: { frameWidth: 32, frameHeight: 32, frames: [2, 3, 2, 1], frameDurationMs: 90 },
    dead: { frameWidth: 32, frameHeight: 32, frames: [3], frameDurationMs: 220 },
  },
  [ENEMY_KINDS.SLIME]: {
    idle: { frameWidth: 64, frameHeight: 64, frames: [0, 1], frameDurationMs: 180 },
    chasing: { frameWidth: 64, frameHeight: 64, frames: [0, 1, 2, 3], frameDurationMs: 110 },
    attacking: { frameWidth: 64, frameHeight: 64, frames: [2, 3, 2, 1], frameDurationMs: 95 },
    dead: { frameWidth: 64, frameHeight: 64, frames: [3], frameDurationMs: 220 },
  },
  [ENEMY_KINDS.HAND]: {
    idle: { frameWidth: 64, frameHeight: 64, frames: [0, 1], frameDurationMs: 180 },
    chasing: { frameWidth: 64, frameHeight: 64, frames: [0, 1, 2, 3], frameDurationMs: 110 },
    attacking: { frameWidth: 64, frameHeight: 64, frames: [2, 3, 2, 1], frameDurationMs: 95 },
    dead: { frameWidth: 64, frameHeight: 64, frames: [3], frameDurationMs: 220 },
  },
};

const BOSS_SEQUENCES: Record<BossKind, Record<string, SequenceDefinition>> = {
  [BOSS_KINDS.GELEHK]: {
    idle: { frameWidth: 48, frameHeight: 48, frames: [0, 1], frameDurationMs: 180 },
    chasing: { frameWidth: 48, frameHeight: 48, frames: [0, 1, 2], frameDurationMs: 120 },
    attacking: { frameWidth: 48, frameHeight: 48, frames: [1, 2, 1], frameDurationMs: 90 },
    targeting: { frameWidth: 48, frameHeight: 48, frames: [2, 1], frameDurationMs: 120 },
    jumping: { frameWidth: 48, frameHeight: 48, frames: [2, 1], frameDurationMs: 100 },
    charging: { frameWidth: 48, frameHeight: 48, frames: [1, 2, 2], frameDurationMs: 80 },
    spawning_minions: { frameWidth: 48, frameHeight: 48, frames: [2, 1, 0], frameDurationMs: 100 },
    enraged: { frameWidth: 48, frameHeight: 48, frames: [0, 1, 2], frameDurationMs: 80 },
    dead: { frameWidth: 48, frameHeight: 48, frames: [2], frameDurationMs: 220 },
  },
  [BOSS_KINDS.DRAGON_LORD]: {
    idle: { frameWidth: 64, frameHeight: 64, frames: [0, 1], frameDurationMs: 200 },
    chasing: { frameWidth: 64, frameHeight: 64, frames: [0, 1, 2, 3], frameDurationMs: 120 },
    attacking: { frameWidth: 64, frameHeight: 64, frames: [2, 3, 2], frameDurationMs: 100 },
    charging: { frameWidth: 64, frameHeight: 64, frames: [1, 2, 3], frameDurationMs: 90 },
    dead: { frameWidth: 64, frameHeight: 64, frames: [3], frameDurationMs: 220 },
  },
  [BOSS_KINDS.SILVERBACK_WAINER]: {
    idle: { frameWidth: 64, frameHeight: 64, frames: [0, 1], frameDurationMs: 190 },
    chasing: { frameWidth: 64, frameHeight: 64, frames: [0, 1, 2, 3], frameDurationMs: 115 },
    attacking: { frameWidth: 64, frameHeight: 64, frames: [2, 3, 2], frameDurationMs: 95 },
    dead: { frameWidth: 64, frameHeight: 64, frames: [3], frameDurationMs: 220 },
  },
  [BOSS_KINDS.SLIM_MAIOLI]: {
    idle: { frameWidth: 64, frameHeight: 64, frames: [0, 1], frameDurationMs: 190 },
    chasing: { frameWidth: 64, frameHeight: 64, frames: [0, 1, 2, 3], frameDurationMs: 115 },
    attacking: { frameWidth: 64, frameHeight: 64, frames: [2, 3, 2], frameDurationMs: 95 },
    dead: { frameWidth: 64, frameHeight: 64, frames: [3], frameDurationMs: 220 },
  },
  [BOSS_KINDS.FRANKLY_STEIN]: {
    idle: { frameWidth: 64, frameHeight: 64, frames: [0, 1], frameDurationMs: 190 },
    chasing: { frameWidth: 64, frameHeight: 64, frames: [0, 1, 2, 3], frameDurationMs: 115 },
    attacking: { frameWidth: 64, frameHeight: 64, frames: [2, 3, 2], frameDurationMs: 95 },
    dead: { frameWidth: 64, frameHeight: 64, frames: [3], frameDurationMs: 220 },
  },
};

function getSequenceFrame(sequence: SequenceDefinition, animationTimeMs: number): SpriteFrame {
  const index = Math.floor(animationTimeMs / sequence.frameDurationMs) % sequence.frames.length;
  const frame = sequence.frames[index] ?? sequence.frames[0] ?? 0;
  return {
    x: frame * sequence.frameWidth,
    y: 0,
    width: sequence.frameWidth,
    height: sequence.frameHeight,
  };
}

export function getPlayerAnimationFrame(
  direction: Direction,
  state: PlayerState,
  animationTimeMs: number
): SpriteFrame {
  const sequence = PLAYER_SEQUENCES[state] ?? PLAYER_SEQUENCES.idle;
  const baseFrame = getSequenceFrame(sequence, animationTimeMs);
  return {
    ...baseFrame,
    x:
      (PLAYER_DIRECTION_OFFSET[direction] + baseFrame.x / sequence.frameWidth) *
      sequence.frameWidth,
  };
}

export function getEnemyAnimationFrame(
  kind: EnemyKind,
  state: BlobState,
  animationTimeMs: number
): SpriteFrame {
  const sequenceMap = ENEMY_SEQUENCES[kind] ?? ENEMY_SEQUENCES[ENEMY_KINDS.BLOB];
  const sequence = sequenceMap[state] ?? sequenceMap.idle;
  return getSequenceFrame(sequence, animationTimeMs);
}

export function getBossAnimationFrame(
  kind: BossKind,
  state: BossState,
  animationTimeMs: number
): SpriteFrame {
  const sequenceMap = BOSS_SEQUENCES[kind] ?? BOSS_SEQUENCES[BOSS_KINDS.GELEHK];
  const sequence = sequenceMap[state] ?? sequenceMap.idle;
  return getSequenceFrame(sequence, animationTimeMs);
}
