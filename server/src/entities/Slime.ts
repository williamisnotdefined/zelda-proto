import { DROP_KINDS, ENEMY_KINDS } from '@gelehka/shared';
import type { DropKind } from '@gelehka/shared';
import {
  BLOB_AGGRO_RADIUS,
  BLOB_DAMAGE,
  BLOB_RESPAWN_TIME,
  BLOB_SPEED,
  Blob,
  type EnemyConfig,
} from './Blob.js';

export const SLIME_HP = 38;
export const SLIME_CONTACT_WIDTH = 48;
export const SLIME_CONTACT_HEIGHT = 48;

export const SLIME_CONFIG: EnemyConfig = {
  kind: ENEMY_KINDS.SLIME,
  maxHp: SLIME_HP,
  speed: BLOB_SPEED,
  damage: BLOB_DAMAGE,
  aggroRadius: BLOB_AGGRO_RADIUS,
  respawnTimeMs: BLOB_RESPAWN_TIME,
};

export class Slime extends Blob {
  constructor(
    id: string,
    x: number,
    y: number,
    chunkKey: string = '',
    dropKind: DropKind = DROP_KINDS.HEART_LARGE
  ) {
    super(id, x, y, chunkKey, SLIME_CONFIG, dropKind);
  }
}
