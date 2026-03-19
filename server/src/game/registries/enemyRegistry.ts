import type { EnemyDefinition } from '@gelehka/shared/definitions';
import { enemyDefinitions } from '@gelehka/shared/definitions';
import { DROP_KINDS, ENEMY_KINDS } from '@gelehka/shared';
import type { DropKind, EnemyKind, PacmanGhostVariant } from '@gelehka/shared';
import { BLOB_CONFIG, Blob, type EnemyConfig } from '../../entities/Blob.js';
import { Hand, HAND_CONFIG } from '../../entities/Hand.js';
import {
  DEFAULT_PACMAN_GHOST_VARIANT,
  PacmanGhost,
  PACMAN_GHOST_CONFIG,
} from '../../entities/PacmanGhost.js';
import { Slime, SLIME_CONFIG } from '../../entities/Slime.js';

export interface EnemySpawnOptions {
  dropKind?: DropKind;
  variant?: PacmanGhostVariant;
}

export interface EnemyRuntimeDefinition {
  kind: EnemyKind;
  definition: EnemyDefinition;
  enemyPrefix: string;
  defaultDropKind: DropKind;
  config: EnemyConfig;
  create(id: string, x: number, y: number, chunkKey?: string, options?: EnemySpawnOptions): Blob;
}

export const enemyRegistry: Record<EnemyKind, EnemyRuntimeDefinition> = {
  [ENEMY_KINDS.BLOB]: {
    kind: ENEMY_KINDS.BLOB,
    definition: enemyDefinitions[ENEMY_KINDS.BLOB],
    enemyPrefix: 'blob',
    defaultDropKind: DROP_KINDS.HEART_SMALL,
    config: BLOB_CONFIG,
    create: (id, x, y, chunkKey = '', options) =>
      new Blob(id, x, y, chunkKey, BLOB_CONFIG, options?.dropKind ?? DROP_KINDS.HEART_SMALL),
  },
  [ENEMY_KINDS.SLIME]: {
    kind: ENEMY_KINDS.SLIME,
    definition: enemyDefinitions[ENEMY_KINDS.SLIME],
    enemyPrefix: 'slime',
    defaultDropKind: DROP_KINDS.HEART_LARGE,
    config: SLIME_CONFIG,
    create: (id, x, y, chunkKey = '', options) =>
      new Slime(id, x, y, chunkKey, options?.dropKind ?? DROP_KINDS.HEART_LARGE),
  },
  [ENEMY_KINDS.HAND]: {
    kind: ENEMY_KINDS.HAND,
    definition: enemyDefinitions[ENEMY_KINDS.HAND],
    enemyPrefix: 'hand',
    defaultDropKind: DROP_KINDS.HEART_LARGE,
    config: HAND_CONFIG,
    create: (id, x, y, chunkKey = '', options) =>
      new Hand(id, x, y, chunkKey, options?.dropKind ?? DROP_KINDS.HEART_LARGE),
  },
  [ENEMY_KINDS.PACMAN_GHOST]: {
    kind: ENEMY_KINDS.PACMAN_GHOST,
    definition: enemyDefinitions[ENEMY_KINDS.PACMAN_GHOST],
    enemyPrefix: 'pacman_ghost',
    defaultDropKind: DROP_KINDS.HEART_PACMAN,
    config: PACMAN_GHOST_CONFIG,
    create: (id, x, y, chunkKey = '', options) =>
      new PacmanGhost(
        id,
        x,
        y,
        chunkKey,
        options?.variant ?? DEFAULT_PACMAN_GHOST_VARIANT,
        options?.dropKind ?? DROP_KINDS.HEART_PACMAN
      ),
  },
};

export function getEnemyRuntimeDefinition(kind: EnemyKind): EnemyRuntimeDefinition {
  return enemyRegistry[kind];
}
