import { WORLD_SPAWN_X, WORLD_SPAWN_Y } from '@gelehka/shared/constants';
import { BOSS_KINDS, ENEMY_KINDS, INSTANCE_IDS, PORTAL_KINDS } from '@gelehka/shared';
import type { BossKind, EnemyKind, InstanceId, PortalKind } from '@gelehka/shared';
import type { SpawnSystemConfig } from '../systems/SpawnSystem.js';

export interface BossRegionRuntimeDefinition {
  enableRegionSpawns?: boolean;
  regionSize: number;
  activeRange: number;
  despawnTimeMs: number;
  keyPrefix: string;
  bossPrefix: string;
  spawnKind: BossKind;
}

export interface InstanceRuntimeDefinition {
  instanceId: InstanceId;
  spawnX: number;
  spawnY: number;
  primaryEnemyKind: EnemyKind;
  spawnSystem: Partial<SpawnSystemConfig>;
  bossRegion: BossRegionRuntimeDefinition;
  onBossDeathPortal?: {
    kind: PortalKind;
    sourceBossKinds?: readonly BossKind[];
    toInstanceId: InstanceId;
    targetX: number;
    targetY: number;
    activationDelayMs?: number;
    durationMs: number;
  };
  initialPortals?: Array<{
    kind: PortalKind;
    x: number;
    y: number;
    toInstanceId: InstanceId;
    targetX: number;
    targetY: number;
  }>;
}

export const PHASE1_PORTAL_DURATION_MS = 30000;
export const PHASE2_NEARBY_RADIUS = 900;
export const PHASE2_MIN_NEARBY_SLIMES = 4;
export const PHASE2_STARTER_SLIMES = 8;
export const PHASE2_DRAGON_NEARBY_RADIUS = 1800;
export const PHASE4_NEARBY_RADIUS = 900;
export const PHASE4_MIN_NEARBY_PACMAN_GHOSTS = 12;
export const PHASE4_STARTER_PACMAN_GHOSTS = 14;
export const PHASE4_ENEMIES_PER_CHUNK = 7;
export const PHASE3_RETURN_PORTAL_OFFSET_X = 240;
export const PHASE4_RETURN_PORTAL_OFFSET_X = 240;

export const PHASE_SPAWN_POSITIONS = {
  [INSTANCE_IDS.PHASE1]: { x: WORLD_SPAWN_X, y: WORLD_SPAWN_Y },
  [INSTANCE_IDS.PHASE2]: { x: WORLD_SPAWN_X + 180, y: WORLD_SPAWN_Y },
  [INSTANCE_IDS.PHASE3]: { x: WORLD_SPAWN_X + 360, y: WORLD_SPAWN_Y },
  [INSTANCE_IDS.PHASE4]: { x: WORLD_SPAWN_X + 540, y: WORLD_SPAWN_Y },
} as const;

export const PHASE3_ENTRY_BOSS_SPAWN_DEFS = [
  {
    id: 'phase3_boss_silverback_entry',
    kind: BOSS_KINDS.SILVERBACK_WAINER,
    offsetX: 120,
    offsetY: -90,
  },
  {
    id: 'phase3_boss_slim_entry',
    kind: BOSS_KINDS.SLIM_MAIOLI,
    offsetX: 160,
    offsetY: 120,
  },
  {
    id: 'phase3_boss_frankly_entry',
    kind: BOSS_KINDS.FRANKLY_STEIN,
    offsetX: -120,
    offsetY: 30,
  },
] as const;

export const ORDERED_INSTANCE_IDS = [
  INSTANCE_IDS.PHASE1,
  INSTANCE_IDS.PHASE2,
  INSTANCE_IDS.PHASE3,
  INSTANCE_IDS.PHASE4,
] as const;

export const INSTANCE_RUNTIME_DEFINITIONS: Record<InstanceId, InstanceRuntimeDefinition> = {
  [INSTANCE_IDS.PHASE1]: {
    instanceId: INSTANCE_IDS.PHASE1,
    spawnX: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE1].x,
    spawnY: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE1].y,
    primaryEnemyKind: ENEMY_KINDS.BLOB,
    spawnSystem: {},
    bossRegion: {
      regionSize: 2000,
      activeRange: 2000,
      despawnTimeMs: 60000,
      keyPrefix: 'gelehk_region',
      bossPrefix: 'gelehk',
      spawnKind: BOSS_KINDS.GELEHK,
    },
    onBossDeathPortal: {
      kind: PORTAL_KINDS.PHASE1_TO_PHASE2,
      sourceBossKinds: [BOSS_KINDS.GELEHK],
      toInstanceId: INSTANCE_IDS.PHASE2,
      targetX: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE2].x,
      targetY: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE2].y,
      activationDelayMs: 500,
      durationMs: PHASE1_PORTAL_DURATION_MS,
    },
  },
  [INSTANCE_IDS.PHASE2]: {
    instanceId: INSTANCE_IDS.PHASE2,
    spawnX: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE2].x,
    spawnY: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE2].y,
    primaryEnemyKind: ENEMY_KINDS.SLIME,
    spawnSystem: {},
    bossRegion: {
      regionSize: 2600,
      activeRange: 2200,
      despawnTimeMs: 60000,
      keyPrefix: 'dragon_region',
      bossPrefix: 'dragon_lord',
      spawnKind: BOSS_KINDS.DRAGON_LORD,
    },
    onBossDeathPortal: {
      kind: PORTAL_KINDS.PHASE2_TO_PHASE3,
      sourceBossKinds: [BOSS_KINDS.DRAGON_LORD],
      toInstanceId: INSTANCE_IDS.PHASE3,
      targetX: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE3].x,
      targetY: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE3].y,
      activationDelayMs: 500,
      durationMs: PHASE1_PORTAL_DURATION_MS,
    },
    initialPortals: [
      {
        kind: PORTAL_KINDS.PHASE2_TO_PHASE1,
        x: WORLD_SPAWN_X,
        y: WORLD_SPAWN_Y,
        toInstanceId: INSTANCE_IDS.PHASE1,
        targetX: WORLD_SPAWN_X,
        targetY: WORLD_SPAWN_Y,
      },
    ],
  },
  [INSTANCE_IDS.PHASE3]: {
    instanceId: INSTANCE_IDS.PHASE3,
    spawnX: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE3].x,
    spawnY: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE3].y,
    primaryEnemyKind: ENEMY_KINDS.HAND,
    spawnSystem: {},
    bossRegion: {
      enableRegionSpawns: false,
      regionSize: 2600,
      activeRange: 2200,
      despawnTimeMs: 60000,
      keyPrefix: 'phase3_boss_region',
      bossPrefix: 'phase3_boss',
      spawnKind: BOSS_KINDS.SILVERBACK_WAINER,
    },
    onBossDeathPortal: {
      kind: PORTAL_KINDS.PHASE3_TO_PHASE4,
      sourceBossKinds: [
        BOSS_KINDS.SILVERBACK_WAINER,
        BOSS_KINDS.SLIM_MAIOLI,
        BOSS_KINDS.FRANKLY_STEIN,
      ],
      toInstanceId: INSTANCE_IDS.PHASE4,
      targetX: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE4].x,
      targetY: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE4].y,
      activationDelayMs: 500,
      durationMs: PHASE1_PORTAL_DURATION_MS,
    },
    initialPortals: [
      {
        kind: PORTAL_KINDS.PHASE3_TO_PHASE2,
        x: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE3].x + PHASE3_RETURN_PORTAL_OFFSET_X,
        y: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE3].y,
        toInstanceId: INSTANCE_IDS.PHASE2,
        targetX: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE2].x,
        targetY: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE2].y,
      },
    ],
  },
  [INSTANCE_IDS.PHASE4]: {
    instanceId: INSTANCE_IDS.PHASE4,
    spawnX: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE4].x,
    spawnY: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE4].y,
    primaryEnemyKind: ENEMY_KINDS.PACMAN_GHOST,
    spawnSystem: {
      enemiesPerChunk: PHASE4_ENEMIES_PER_CHUNK,
    },
    bossRegion: {
      enableRegionSpawns: false,
      regionSize: 2600,
      activeRange: 2200,
      despawnTimeMs: 60000,
      keyPrefix: 'phase4_boss_region',
      bossPrefix: 'phase4_boss',
      spawnKind: BOSS_KINDS.DRAGON_LORD,
    },
    initialPortals: [
      {
        kind: PORTAL_KINDS.PHASE4_TO_PHASE3,
        x: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE4].x + PHASE4_RETURN_PORTAL_OFFSET_X,
        y: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE4].y,
        toInstanceId: INSTANCE_IDS.PHASE3,
        targetX: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE3].x,
        targetY: PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE3].y,
      },
    ],
  },
};
