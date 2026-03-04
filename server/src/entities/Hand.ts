import type { DropKind } from '@gelehka/shared';
import { DROP_KINDS, ENEMY_KINDS } from '@gelehka/shared';
import { BLOB_AGGRO_RADIUS, BLOB_RESPAWN_TIME, Blob, type EnemyConfig } from './Blob.js';
export const HAND_HP = 10;
export const HAND_SPEED = 90;

export const HAND_CONFIG: EnemyConfig = {
  kind: ENEMY_KINDS.HAND,
  maxHp: HAND_HP,
  speed: HAND_SPEED,
  damage: 8,
  aggroRadius: BLOB_AGGRO_RADIUS,
  respawnTimeMs: BLOB_RESPAWN_TIME,
};

export class Hand extends Blob {
  constructor(
    id: string,
    x: number,
    y: number,
    chunkKey: string = '',
    dropKind: DropKind = DROP_KINDS.HEART_LARGE
  ) {
    super(id, x, y, chunkKey, HAND_CONFIG, dropKind);
  }
}
