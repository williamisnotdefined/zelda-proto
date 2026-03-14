import type { DropKind, PacmanGhostVariant } from '@gelehka/shared';
import { DROP_KINDS, ENEMY_KINDS, PACMAN_GHOST_VARIANTS } from '@gelehka/shared';
import { Blob, type EnemyConfig } from './Blob.js';

export const PACMAN_GHOST_HP = 38;
export const PACMAN_GHOST_SPEED = 90;
export const PACMAN_GHOST_DAMAGE = 5;
export const PACMAN_GHOST_AGGRO_RADIUS = 600;
export const PACMAN_GHOST_RESPAWN_TIME_MS = 10000;
export const PACMAN_GHOST_CONTACT_RADIUS = 24;
export const DEFAULT_PACMAN_GHOST_VARIANT = PACMAN_GHOST_VARIANTS.RED;

export const PACMAN_GHOST_CONFIG: EnemyConfig = {
  kind: ENEMY_KINDS.PACMAN_GHOST,
  maxHp: PACMAN_GHOST_HP,
  speed: PACMAN_GHOST_SPEED,
  damage: PACMAN_GHOST_DAMAGE,
  aggroRadius: PACMAN_GHOST_AGGRO_RADIUS,
  contactRadius: PACMAN_GHOST_CONTACT_RADIUS,
  respawnTimeMs: PACMAN_GHOST_RESPAWN_TIME_MS,
};

export class PacmanGhost extends Blob {
  constructor(
    id: string,
    x: number,
    y: number,
    chunkKey: string = '',
    variant: PacmanGhostVariant = DEFAULT_PACMAN_GHOST_VARIANT,
    dropKind: DropKind = DROP_KINDS.HEART_PACMAN
  ) {
    super(id, x, y, chunkKey, PACMAN_GHOST_CONFIG, dropKind);
    this.variant = variant;
  }
}
