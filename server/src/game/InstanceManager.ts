import { WORLD_SPAWN_X, WORLD_SPAWN_Y } from '@gelehka/shared/constants';
import {
  BOSS_KINDS,
  DROP_KINDS,
  INSTANCE_IDS,
  PACMAN_GHOST_VARIANTS,
  PORTAL_KINDS,
} from '@gelehka/shared';
import type { InstanceId, PacmanGhostVariant } from '@gelehka/shared';
import { nanoid } from 'nanoid';
import { BLOB_CONFIG, Blob } from '../entities/Blob.js';
import { BossGelehk } from '../entities/BossGelehk.js';
import { DragonLord } from '../entities/DragonLord.js';
import { Hand } from '../entities/Hand.js';
import { PacmanGhost } from '../entities/PacmanGhost.js';
import { Phase3Boss } from '../entities/Phase3Boss.js';
import { Slime } from '../entities/Slime.js';
import { Player } from '../entities/Player.js';
import type { InputMessage } from '../network/MessageTypes.js';
import { World } from './World.js';
import type { BossActorEntity } from './World.js';
import { BossRegionSystem } from './systems/BossRegionSystem.js';
import { SpawnSystem } from './systems/SpawnSystem.js';

const PHASE1_PORTAL_DURATION_MS = 30000;
const PHASE2_NEARBY_RADIUS = 900;
const PHASE2_MIN_NEARBY_SLIMES = 4;
const PHASE2_STARTER_SLIMES = 8;
const PHASE2_DRAGON_NEARBY_RADIUS = 1800;
const PHASE4_NEARBY_RADIUS = 900;
const PHASE4_MIN_NEARBY_PACMAN_GHOSTS = 12;
const PHASE4_STARTER_PACMAN_GHOSTS = 14;
const PHASE4_ENEMIES_PER_CHUNK = 7;
const PHASE3_RETURN_PORTAL_OFFSET_X = 240;
const PHASE4_RETURN_PORTAL_OFFSET_X = 240;
const PACMAN_GHOST_VARIANT_ORDER = [
  PACMAN_GHOST_VARIANTS.RED,
  PACMAN_GHOST_VARIANTS.BLUE,
  PACMAN_GHOST_VARIANTS.ORANGE,
  PACMAN_GHOST_VARIANTS.PINK,
] as const;
const PHASE3_ENTRY_BOSS_SPAWN_DEFS = [
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
const DEV_START_PHASE_ENV = 'DEV_START_PHASE';
const DEV_STRESS_ENEMIES_PER_CHUNK_ENV = 'DEV_STRESS_ENEMIES_PER_CHUNK';

function resolveDevPositiveIntEnv(
  envName: string,
  fallback: number,
  min: number,
  max: number
): number {
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev) {
    return fallback;
  }

  const raw = process.env[envName]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= min && parsed <= max) {
    console.log(`[InstanceManager] ${envName}=${parsed}`);
    return parsed;
  }

  console.warn(
    `[InstanceManager] Invalid ${envName}="${raw}". Expected an integer between ${min} and ${max}. Falling back to ${fallback}.`
  );
  return fallback;
}

function selectPacmanGhostVariant(seed: string): PacmanGhostVariant {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PACMAN_GHOST_VARIANT_ORDER[(hash >>> 0) % PACMAN_GHOST_VARIANT_ORDER.length];
}

export class InstanceManager {
  readonly phase1World: World;
  readonly phase2World: World;
  readonly phase3World: World;
  readonly phase4World: World;
  private readonly phase2SpawnX: number;
  private readonly phase2SpawnY: number;
  private readonly phase3SpawnX: number;
  private readonly phase3SpawnY: number;
  private readonly phase4SpawnX: number;
  private readonly phase4SpawnY: number;
  private readonly initialInstanceId: InstanceId;
  private readonly worldsByInstance: Record<InstanceId, World>;

  private readonly playerInstances: Map<string, InstanceId>;

  constructor() {
    const stressEnemiesPerChunk = resolveDevPositiveIntEnv(
      DEV_STRESS_ENEMIES_PER_CHUNK_ENV,
      0,
      1,
      400
    );
    this.phase2SpawnX = WORLD_SPAWN_X + 180;
    this.phase2SpawnY = WORLD_SPAWN_Y;
    this.phase3SpawnX = WORLD_SPAWN_X + 360;
    this.phase3SpawnY = WORLD_SPAWN_Y;
    this.phase4SpawnX = WORLD_SPAWN_X + 540;
    this.phase4SpawnY = WORLD_SPAWN_Y;

    const phase1SpawnSystem = new SpawnSystem({
      enemyPrefix: 'blob',
      ...(stressEnemiesPerChunk > 0 ? { enemiesPerChunk: stressEnemiesPerChunk } : {}),
      createEnemy: (id, x, y, chunkKey) =>
        new Blob(id, x, y, chunkKey, BLOB_CONFIG, DROP_KINDS.HEART_SMALL),
    });

    const phase2SpawnSystem = new SpawnSystem({
      enemyPrefix: 'slime',
      ...(stressEnemiesPerChunk > 0 ? { enemiesPerChunk: stressEnemiesPerChunk } : {}),
      createEnemy: (id, x, y, chunkKey) => new Slime(id, x, y, chunkKey),
    });

    const phase3SpawnSystem = new SpawnSystem({
      enemyPrefix: 'hand',
      ...(stressEnemiesPerChunk > 0 ? { enemiesPerChunk: stressEnemiesPerChunk } : {}),
      createEnemy: (id, x, y, chunkKey) => new Hand(id, x, y, chunkKey),
    });

    const phase4SpawnSystem = new SpawnSystem({
      enemyPrefix: 'pacman_ghost',
      enemiesPerChunk: stressEnemiesPerChunk || PHASE4_ENEMIES_PER_CHUNK,
      createEnemy: (id, x, y, chunkKey) =>
        new PacmanGhost(id, x, y, chunkKey, selectPacmanGhostVariant(id)),
    });

    const phase1BossSystem = new BossRegionSystem<BossActorEntity>({
      regionSize: 2000,
      activeRange: 2000,
      despawnTimeMs: 60000,
      keyPrefix: 'gelehk_region',
      bossPrefix: 'gelehk',
      createBoss: (id, x, y) => new BossGelehk(id, x, y),
      updateBoss: (boss, ctx) => {
        if (boss instanceof BossGelehk) {
          boss.update(
            ctx.dt,
            ctx.players,
            (x: number, y: number, _count: number) => {
              ctx.spawnMinions(x, y);
            },
            (x: number, y: number) => {
              ctx.spawnPurpleField(x, y);
            },
            ctx.safeZone,
            ctx.findNearestPlayerInRadius,
            ctx.forEachPlayerInRadius
          );
        }
      },
    });

    const phase2BossSystem = new BossRegionSystem<BossActorEntity>({
      regionSize: 2600,
      activeRange: 2200,
      despawnTimeMs: 60000,
      keyPrefix: 'dragon_region',
      bossPrefix: 'dragon_lord',
      createBoss: (id, x, y) => new DragonLord(id, x, y),
      updateBoss: (boss, ctx) => {
        if (boss instanceof DragonLord) {
          boss.update(
            ctx.dt,
            ctx.players,
            (x: number, y: number, dirX: number, dirY: number) => {
              ctx.spawnFireLine(x, y, dirX, dirY);
            },
            ctx.findNearestPlayerInRadius
          );
        }
      },
    });

    const phase3BossSystem = new BossRegionSystem<BossActorEntity>({
      enableRegionSpawns: false,
      regionSize: 2600,
      activeRange: 2200,
      despawnTimeMs: 60000,
      keyPrefix: 'phase3_boss_region',
      bossPrefix: 'phase3_boss',
      createBoss: (id, x, y) => new Phase3Boss(id, x, y, BOSS_KINDS.SILVERBACK_WAINER),
      updateBoss: (boss, ctx) => {
        if (boss instanceof Phase3Boss) {
          boss.update(
            ctx.dt,
            ctx.players,
            (x: number, y: number, dirX: number, dirY: number) => {
              ctx.spawnFireLine(x, y, dirX, dirY, boss.flameKind);
            },
            ctx.findNearestPlayerInRadius
          );
        }
      },
    });

    const phase4BossSystem = new BossRegionSystem<BossActorEntity>({
      enableRegionSpawns: false,
      regionSize: 2600,
      activeRange: 2200,
      despawnTimeMs: 60000,
      keyPrefix: 'phase4_boss_region',
      bossPrefix: 'phase4_boss',
      createBoss: () => {
        throw new Error('Phase4 boss spawning is disabled');
      },
      updateBoss: () => {},
    });

    this.phase1World = new World({
      instanceId: INSTANCE_IDS.PHASE1,
      spawnX: WORLD_SPAWN_X,
      spawnY: WORLD_SPAWN_Y,
      enemyCollection: 'blobs',
      spawnSystem: phase1SpawnSystem,
      bossRegionSystem: phase1BossSystem,
      onBossDeathPortal: {
        kind: PORTAL_KINDS.PHASE1_TO_PHASE2,
        sourceBossKinds: [BOSS_KINDS.GELEHK],
        toInstanceId: INSTANCE_IDS.PHASE2,
        targetX: this.phase2SpawnX,
        targetY: this.phase2SpawnY,
        activationDelayMs: 500,
        durationMs: PHASE1_PORTAL_DURATION_MS,
      },
    });

    this.phase2World = new World({
      instanceId: INSTANCE_IDS.PHASE2,
      spawnX: this.phase2SpawnX,
      spawnY: this.phase2SpawnY,
      enemyCollection: 'slimes',
      spawnSystem: phase2SpawnSystem,
      bossRegionSystem: phase2BossSystem,
      onBossDeathPortal: {
        kind: PORTAL_KINDS.PHASE2_TO_PHASE3,
        sourceBossKinds: [BOSS_KINDS.DRAGON_LORD],
        toInstanceId: INSTANCE_IDS.PHASE3,
        targetX: this.phase3SpawnX,
        targetY: this.phase3SpawnY,
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
    });

    this.phase3World = new World({
      instanceId: INSTANCE_IDS.PHASE3,
      spawnX: this.phase3SpawnX,
      spawnY: this.phase3SpawnY,
      enemyCollection: 'hands',
      spawnSystem: phase3SpawnSystem,
      bossRegionSystem: phase3BossSystem,
      onBossDeathPortal: {
        kind: PORTAL_KINDS.PHASE3_TO_PHASE4,
        sourceBossKinds: [
          BOSS_KINDS.SILVERBACK_WAINER,
          BOSS_KINDS.SLIM_MAIOLI,
          BOSS_KINDS.FRANKLY_STEIN,
        ],
        toInstanceId: INSTANCE_IDS.PHASE4,
        targetX: this.phase4SpawnX,
        targetY: this.phase4SpawnY,
        activationDelayMs: 500,
        durationMs: PHASE1_PORTAL_DURATION_MS,
      },
      initialPortals: [
        {
          kind: PORTAL_KINDS.PHASE3_TO_PHASE2,
          x: this.phase3SpawnX + PHASE3_RETURN_PORTAL_OFFSET_X,
          y: this.phase3SpawnY,
          toInstanceId: INSTANCE_IDS.PHASE2,
          targetX: this.phase2SpawnX,
          targetY: this.phase2SpawnY,
        },
      ],
    });

    this.phase4World = new World({
      instanceId: INSTANCE_IDS.PHASE4,
      spawnX: this.phase4SpawnX,
      spawnY: this.phase4SpawnY,
      enemyCollection: 'pacmanGhosts',
      spawnSystem: phase4SpawnSystem,
      bossRegionSystem: phase4BossSystem,
      initialPortals: [
        {
          kind: PORTAL_KINDS.PHASE4_TO_PHASE3,
          x: this.phase4SpawnX + PHASE4_RETURN_PORTAL_OFFSET_X,
          y: this.phase4SpawnY,
          toInstanceId: INSTANCE_IDS.PHASE3,
          targetX: this.phase3SpawnX,
          targetY: this.phase3SpawnY,
        },
      ],
    });

    this.worldsByInstance = {
      [INSTANCE_IDS.PHASE1]: this.phase1World,
      [INSTANCE_IDS.PHASE2]: this.phase2World,
      [INSTANCE_IDS.PHASE3]: this.phase3World,
      [INSTANCE_IDS.PHASE4]: this.phase4World,
    };

    this.seedPhase2StarterContent();
    this.ensurePhase3BossesNear(this.phase3SpawnX, this.phase3SpawnY);
    this.seedPhase4StarterContent();

    this.initialInstanceId = this.resolveInitialInstanceId();

    this.playerInstances = new Map();
  }

  update(dt: number): void {
    this.phase1World.update(dt);
    this.phase2World.update(dt);
    this.phase3World.update(dt);
    this.phase4World.update(dt);
    this.resolveTransfers();
  }

  addPlayer(id: string, nickname: string): Player {
    this.playerInstances.set(id, this.initialInstanceId);
    return this.getWorld(this.initialInstanceId).addPlayer(id, nickname);
  }

  removePlayer(id: string): void {
    const instanceId = this.playerInstances.get(id);
    if (!instanceId) return;
    this.getWorld(instanceId).removePlayer(id);
    this.playerInstances.delete(id);
  }

  handleInput(playerId: string, input: InputMessage): void {
    const instanceId = this.playerInstances.get(playerId);
    if (!instanceId) return;
    this.getWorld(instanceId).handleInput(playerId, input);
  }

  getWorldForPlayer(playerId: string): World | null {
    const instanceId = this.playerInstances.get(playerId);
    if (!instanceId) return null;
    return this.getWorld(instanceId);
  }

  getAllWorlds(): World[] {
    return Object.values(this.worldsByInstance);
  }

  getInstanceForPlayer(playerId: string): InstanceId | null {
    return this.playerInstances.get(playerId) ?? null;
  }

  getPlayersInInstance(instanceId: InstanceId): Map<string, Player> {
    return this.getWorld(instanceId).players;
  }

  getPlayersInAnyWorld(): Map<string, Player> {
    const out = new Map<string, Player>();
    for (const world of this.getAllWorlds()) {
      for (const [id, player] of world.players) {
        out.set(id, player);
      }
    }
    return out;
  }

  private resolveTransfers(): void {
    const phase1Transfers = this.phase1World.consumeTransferRequests();
    const phase2Transfers = this.phase2World.consumeTransferRequests();
    const phase3Transfers = this.phase3World.consumeTransferRequests();
    const phase4Transfers = this.phase4World.consumeTransferRequests();
    for (const transfer of [
      ...phase1Transfers,
      ...phase2Transfers,
      ...phase3Transfers,
      ...phase4Transfers,
    ]) {
      this.transferPlayer(
        transfer.playerId,
        transfer.toInstanceId,
        transfer.targetX,
        transfer.targetY
      );
    }
  }

  private transferPlayer(playerId: string, toInstanceId: InstanceId, x: number, y: number): void {
    const currentInstanceId = this.playerInstances.get(playerId);
    if (!currentInstanceId || currentInstanceId === toInstanceId) return;

    const fromWorld = this.getWorld(currentInstanceId);
    const toWorld = this.getWorld(toInstanceId);
    const player = fromWorld.removePlayer(playerId);
    if (!player) return;

    player.markPhaseTransferCooldown(800);
    toWorld.adoptPlayer(player, x, y);
    this.playerInstances.set(playerId, toInstanceId);

    const onEnterByInstance: Partial<Record<InstanceId, (x: number, y: number) => void>> = {
      [INSTANCE_IDS.PHASE2]: (nextX, nextY) => this.ensurePhase2PopulationNear(nextX, nextY),
      [INSTANCE_IDS.PHASE3]: (nextX, nextY) => this.ensurePhase3BossesNear(nextX, nextY),
      [INSTANCE_IDS.PHASE4]: (nextX, nextY) => this.ensurePhase4PopulationNear(nextX, nextY),
    };
    onEnterByInstance[toInstanceId]?.(x, y);
  }

  private getWorld(instanceId: InstanceId): World {
    return this.worldsByInstance[instanceId];
  }

  private resolveInitialInstanceId(): InstanceId {
    const isDev = process.env.NODE_ENV !== 'production';
    if (!isDev) {
      return INSTANCE_IDS.PHASE1;
    }

    const raw = process.env[DEV_START_PHASE_ENV]?.trim().toLowerCase();
    if (!raw) {
      return INSTANCE_IDS.PHASE1;
    }

    const availableInstanceIds = new Set<InstanceId>(Object.values(INSTANCE_IDS));

    if (availableInstanceIds.has(raw as InstanceId)) {
      const selected = raw as InstanceId;
      console.log(
        `[InstanceManager] ${DEV_START_PHASE_ENV}=${raw} -> players spawn in ${selected}`
      );
      return selected;
    }

    const phaseNumber = Number(raw.replace('phase', ''));
    if (Number.isInteger(phaseNumber) && phaseNumber > 0) {
      const candidate = `phase${phaseNumber}` as InstanceId;
      if (availableInstanceIds.has(candidate)) {
        console.log(
          `[InstanceManager] ${DEV_START_PHASE_ENV}=${raw} -> players spawn in ${candidate}`
        );
        return candidate;
      }
    }

    console.warn(
      `[InstanceManager] Invalid ${DEV_START_PHASE_ENV}="${raw}". Available: ${Array.from(
        availableInstanceIds
      ).join(', ')}. Falling back to ${INSTANCE_IDS.PHASE1}.`
    );
    return INSTANCE_IDS.PHASE1;
  }

  private seedPhase2StarterContent(): void {
    this.ensurePhase2PopulationNear(this.phase2SpawnX, this.phase2SpawnY);
  }

  private seedPhase4StarterContent(): void {
    this.ensurePhase4PopulationNear(this.phase4SpawnX, this.phase4SpawnY);
  }

  private ensurePhase2PopulationNear(x: number, y: number): void {
    let nearbySlimes = 0;
    for (const slime of this.phase2World.slimes.values()) {
      if (slime.state === 'dead') continue;
      const dx = slime.x - x;
      const dy = slime.y - y;
      if (dx * dx + dy * dy <= PHASE2_NEARBY_RADIUS * PHASE2_NEARBY_RADIUS) {
        nearbySlimes += 1;
      }
    }

    if (nearbySlimes < PHASE2_MIN_NEARBY_SLIMES) {
      for (let i = 0; i < PHASE2_STARTER_SLIMES; i++) {
        const id = `slime_seed_${nanoid(8)}`;
        const angle = (Math.PI * 2 * i) / PHASE2_STARTER_SLIMES;
        const radius = 250 + (i % 3) * 90;
        const sx = x + Math.cos(angle) * radius;
        const sy = y + Math.sin(angle) * radius;
        const slime = new Slime(id, sx, sy, 'phase2_seed', DROP_KINDS.HEART_LARGE);
        this.phase2World.slimes.set(id, slime);
        this.phase2World.add(slime);
      }
    }

    let nearbyDragon = false;
    for (const boss of this.phase2World.bosses.values()) {
      if (!(boss instanceof DragonLord)) continue;
      const dx = boss.x - x;
      const dy = boss.y - y;
      if (dx * dx + dy * dy <= PHASE2_DRAGON_NEARBY_RADIUS * PHASE2_DRAGON_NEARBY_RADIUS) {
        nearbyDragon = true;
        break;
      }
    }

    if (!nearbyDragon) {
      const bossId = `dragon_seed_${nanoid(8)}`;
      const dragon = new DragonLord(bossId, x + 520, y + 160);
      this.phase2World.bosses.set(bossId, dragon);
      this.phase2World.add(dragon);
    }
  }

  private ensurePhase3BossesNear(entryX: number, entryY: number): void {
    const expectedBossIds = new Set<string>(PHASE3_ENTRY_BOSS_SPAWN_DEFS.map((def) => def.id));

    for (const [bossId] of this.phase3World.bosses) {
      if (expectedBossIds.has(bossId)) continue;
      this.phase3World.bosses.delete(bossId);
      this.phase3World.remove(bossId);
    }

    for (const bossDef of PHASE3_ENTRY_BOSS_SPAWN_DEFS) {
      const bossX = entryX + bossDef.offsetX;
      const bossY = entryY + bossDef.offsetY;
      const existing = this.phase3World.bosses.get(bossDef.id);
      if (existing && existing instanceof Phase3Boss) {
        existing.spawnX = bossX;
        existing.spawnY = bossY;
        continue;
      }

      if (existing) {
        this.phase3World.bosses.delete(bossDef.id);
        this.phase3World.remove(bossDef.id);
      }

      const boss = new Phase3Boss(bossDef.id, bossX, bossY, bossDef.kind);
      this.phase3World.bosses.set(bossDef.id, boss);
      this.phase3World.add(boss);
    }
  }

  private ensurePhase4PopulationNear(x: number, y: number): void {
    let nearbyPacmanGhosts = 0;
    for (const pacmanGhost of this.phase4World.pacmanGhosts.values()) {
      if (pacmanGhost.state === 'dead') continue;
      const dx = pacmanGhost.x - x;
      const dy = pacmanGhost.y - y;
      if (dx * dx + dy * dy <= PHASE4_NEARBY_RADIUS * PHASE4_NEARBY_RADIUS) {
        nearbyPacmanGhosts += 1;
      }
    }

    if (nearbyPacmanGhosts >= PHASE4_MIN_NEARBY_PACMAN_GHOSTS) {
      return;
    }

    for (let i = 0; i < PHASE4_STARTER_PACMAN_GHOSTS; i++) {
      const id = `pacman_ghost_seed_${nanoid(8)}`;
      const angle = (Math.PI * 2 * i) / PHASE4_STARTER_PACMAN_GHOSTS;
      const radius = 260 + (i % 4) * 80;
      const sx = x + Math.cos(angle) * radius;
      const sy = y + Math.sin(angle) * radius;
      const variant = PACMAN_GHOST_VARIANT_ORDER[i % PACMAN_GHOST_VARIANT_ORDER.length];
      const pacmanGhost = new PacmanGhost(id, sx, sy, 'phase4_seed', variant);
      this.phase4World.pacmanGhosts.set(id, pacmanGhost);
      this.phase4World.add(pacmanGhost);
    }
  }
}
