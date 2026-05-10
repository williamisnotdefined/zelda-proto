import type { Direction, EnemyKind, EnemySnapshot, PacmanGhostVariant } from '@/shared';
import { ENEMY_KINDS, PACMAN_GHOST_VARIANTS } from '@/shared';
import type Phaser from 'phaser';
import { BlobEntity } from '../../../entities/Blob';
import { KnightEntity } from '../../../entities/Knight';
import { PacmanGhostEntity } from '../../../entities/PacmanGhost';
import { SkeletonEntity } from '../../../entities/Skeleton';

export type EnemyVisualLodTier = 'near' | 'mid' | 'far';

export type EnemyVisualLod = Readonly<{
  tier: EnemyVisualLodTier;
  animate: boolean;
  animationTimeScale: number;
}>;

export type EnemyVisualStats = {
  visibleCount: number;
  nearCount: number;
  midCount: number;
  farCount: number;
  animatedCount: number;
  usingBudget: boolean;
};

export interface EnemyVisualEntity {
  readonly x: number;
  readonly y: number;
  hp: number;
  serverState: string;
  update(dt: number, inView: boolean, lod: EnemyVisualLod): void;
  updateFromServer(
    x: number,
    y: number,
    hp: number,
    maxHp: number,
    state: string,
    elite?: boolean,
    venomMarked?: boolean,
    confused?: boolean,
    facing?: Direction
  ): void;
  restoreFromServer(
    x: number,
    y: number,
    hp: number,
    maxHp: number,
    state: string,
    elite?: boolean,
    venomMarked?: boolean,
    confused?: boolean,
    facing?: Direction
  ): void;
  setDormant(): void;
  destroy(): void;
  variant?: PacmanGhostVariant;
}

export interface EnemyVisualRegistryEntry {
  kind: EnemyKind;
  entities: Map<string, EnemyVisualEntity>;
  maxPoolSize: number;
  getAcquirePool(snapshot: EnemySnapshot): EnemyVisualEntity[];
  getReleasePool(entity: EnemyVisualEntity): EnemyVisualEntity[];
  create(scene: Phaser.Scene, snapshot: EnemySnapshot): EnemyVisualEntity;
  restore(entity: EnemyVisualEntity, snapshot: EnemySnapshot): void;
  update(entity: EnemyVisualEntity, snapshot: EnemySnapshot): void;
  matches(entity: EnemyVisualEntity, snapshot: EnemySnapshot): boolean;
  pooledCount(): number;
  destroyPools(): void;
}

export type EnemyVisualRegistry = Record<EnemyKind, EnemyVisualRegistryEntry>;

function destroyPooledEntities(pool: EnemyVisualEntity[]): void {
  for (const entity of pool) {
    entity.destroy();
  }
  pool.length = 0;
}

function createCommonEntry(
  kind: EnemyKind,
  maxPoolSize: number,
  createEntity: (scene: Phaser.Scene, snapshot: EnemySnapshot) => EnemyVisualEntity
): EnemyVisualRegistryEntry {
  const entities = new Map<string, EnemyVisualEntity>();
  const pool: EnemyVisualEntity[] = [];

  return {
    kind,
    entities,
    maxPoolSize,
    getAcquirePool: () => pool,
    getReleasePool: () => pool,
    create: createEntity,
    restore: (entity, snapshot) => {
      entity.restoreFromServer(
        snapshot.x,
        snapshot.y,
        snapshot.hp,
        snapshot.maxHp,
        snapshot.state,
        snapshot.elite,
        snapshot.venomMarked,
        snapshot.confused,
        snapshot.facing
      );
    },
    update: (entity, snapshot) => {
      entity.updateFromServer(
        snapshot.x,
        snapshot.y,
        snapshot.hp,
        snapshot.maxHp,
        snapshot.state,
        snapshot.elite,
        snapshot.venomMarked,
        snapshot.confused,
        snapshot.facing
      );
    },
    matches: () => true,
    pooledCount: () => pool.length,
    destroyPools: () => destroyPooledEntities(pool),
  };
}

export function createEnemyVisualRegistry(
  maxCommonEnemyPoolSize: number,
  maxPacmanGhostEntityPoolSize: number
): EnemyVisualRegistry {
  const pacmanGhostEntities = new Map<string, EnemyVisualEntity>();
  const pacmanGhostPools: Record<PacmanGhostVariant, EnemyVisualEntity[]> = {
    [PACMAN_GHOST_VARIANTS.RED]: [],
    [PACMAN_GHOST_VARIANTS.BLUE]: [],
    [PACMAN_GHOST_VARIANTS.ORANGE]: [],
    [PACMAN_GHOST_VARIANTS.PINK]: [],
  };

  return {
    [ENEMY_KINDS.BLOB]: createCommonEntry(
      ENEMY_KINDS.BLOB,
      maxCommonEnemyPoolSize,
      (scene, snapshot) => new BlobEntity(scene, snapshot.x, snapshot.y)
    ),
    [ENEMY_KINDS.SKELETON]: createCommonEntry(
      ENEMY_KINDS.SKELETON,
      maxCommonEnemyPoolSize,
      (scene, snapshot) => new SkeletonEntity(scene, snapshot.x, snapshot.y)
    ),
    [ENEMY_KINDS.KNIGHT]: createCommonEntry(
      ENEMY_KINDS.KNIGHT,
      maxCommonEnemyPoolSize,
      (scene, snapshot) => new KnightEntity(scene, snapshot.x, snapshot.y)
    ),
    [ENEMY_KINDS.PACMAN_GHOST]: {
      kind: ENEMY_KINDS.PACMAN_GHOST,
      entities: pacmanGhostEntities,
      maxPoolSize: maxPacmanGhostEntityPoolSize,
      getAcquirePool: (snapshot) => pacmanGhostPools[snapshot.variant ?? PACMAN_GHOST_VARIANTS.RED],
      getReleasePool: (entity) => pacmanGhostPools[entity.variant ?? PACMAN_GHOST_VARIANTS.RED],
      create: (scene, snapshot) =>
        new PacmanGhostEntity(
          scene,
          snapshot.x,
          snapshot.y,
          snapshot.variant ?? PACMAN_GHOST_VARIANTS.RED
        ),
      restore: (entity, snapshot) => {
        entity.restoreFromServer(
          snapshot.x,
          snapshot.y,
          snapshot.hp,
          snapshot.maxHp,
          snapshot.state,
          snapshot.elite,
          snapshot.venomMarked,
          snapshot.confused,
          snapshot.facing
        );
      },
      update: (entity, snapshot) => {
        entity.updateFromServer(
          snapshot.x,
          snapshot.y,
          snapshot.hp,
          snapshot.maxHp,
          snapshot.state,
          snapshot.elite,
          snapshot.venomMarked,
          snapshot.confused,
          snapshot.facing
        );
      },
      matches: (entity, snapshot) =>
        (entity.variant ?? PACMAN_GHOST_VARIANTS.RED) ===
        (snapshot.variant ?? PACMAN_GHOST_VARIANTS.RED),
      pooledCount: () =>
        Object.values(pacmanGhostPools).reduce((total, pool) => total + pool.length, 0),
      destroyPools: () => {
        for (const pool of Object.values(pacmanGhostPools)) {
          destroyPooledEntities(pool);
        }
      },
    },
  };
}
