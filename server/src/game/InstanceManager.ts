import { BOSS_KINDS, ENEMY_KINDS, INSTANCE_IDS, PACMAN_GHOST_VARIANTS } from '@gelehka/shared';
import type { InstanceId, PacmanGhostVariant } from '@gelehka/shared';
import { nanoid } from 'nanoid';
import { Player } from '../entities/Player.js';
import type { InputMessage } from '../network/MessageTypes.js';
import { World } from './World.js';
import type { BossActorEntity } from './World.js';
import { getBossRuntimeDefinition } from './registries/bossRegistry.js';
import { getEnemyRuntimeDefinition } from './registries/enemyRegistry.js';
import {
  INSTANCE_RUNTIME_DEFINITIONS,
  ORDERED_INSTANCE_IDS,
  PHASE2_DRAGON_NEARBY_RADIUS,
  PHASE2_MIN_NEARBY_SLIMES,
  PHASE2_NEARBY_RADIUS,
  PHASE2_STARTER_SLIMES,
  PHASE3_ENTRY_BOSS_SPAWN_DEFS,
  PHASE4_MIN_NEARBY_PACMAN_GHOSTS,
  PHASE4_NEARBY_RADIUS,
  PHASE4_STARTER_PACMAN_GHOSTS,
  PHASE_SPAWN_POSITIONS,
} from './registries/instanceRegistry.js';
import { BossRegionSystem } from './systems/BossRegionSystem.js';
import { SpawnSystem } from './systems/SpawnSystem.js';

const PACMAN_GHOST_VARIANT_ORDER = [
  PACMAN_GHOST_VARIANTS.RED,
  PACMAN_GHOST_VARIANTS.BLUE,
  PACMAN_GHOST_VARIANTS.ORANGE,
  PACMAN_GHOST_VARIANTS.PINK,
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

function hasSpawnPoint(entity: BossActorEntity): entity is BossActorEntity & {
  spawnX: number;
  spawnY: number;
} {
  return 'spawnX' in entity && 'spawnY' in entity;
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
  private readonly orderedWorlds: World[];
  private readonly playerInstances: Map<string, InstanceId>;

  constructor() {
    const stressEnemiesPerChunk = resolveDevPositiveIntEnv(
      DEV_STRESS_ENEMIES_PER_CHUNK_ENV,
      0,
      1,
      400
    );

    this.phase2SpawnX = PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE2].x;
    this.phase2SpawnY = PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE2].y;
    this.phase3SpawnX = PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE3].x;
    this.phase3SpawnY = PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE3].y;
    this.phase4SpawnX = PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE4].x;
    this.phase4SpawnY = PHASE_SPAWN_POSITIONS[INSTANCE_IDS.PHASE4].y;

    this.worldsByInstance = {
      [INSTANCE_IDS.PHASE1]: this.createWorld(INSTANCE_IDS.PHASE1, stressEnemiesPerChunk),
      [INSTANCE_IDS.PHASE2]: this.createWorld(INSTANCE_IDS.PHASE2, stressEnemiesPerChunk),
      [INSTANCE_IDS.PHASE3]: this.createWorld(INSTANCE_IDS.PHASE3, stressEnemiesPerChunk),
      [INSTANCE_IDS.PHASE4]: this.createWorld(INSTANCE_IDS.PHASE4, stressEnemiesPerChunk),
    };
    this.phase1World = this.worldsByInstance[INSTANCE_IDS.PHASE1];
    this.phase2World = this.worldsByInstance[INSTANCE_IDS.PHASE2];
    this.phase3World = this.worldsByInstance[INSTANCE_IDS.PHASE3];
    this.phase4World = this.worldsByInstance[INSTANCE_IDS.PHASE4];
    this.orderedWorlds = ORDERED_INSTANCE_IDS.map(
      (instanceId) => this.worldsByInstance[instanceId]
    );

    this.seedPhase2StarterContent();
    this.ensurePhase3BossesNear(this.phase3SpawnX, this.phase3SpawnY);
    this.seedPhase4StarterContent();

    this.initialInstanceId = this.resolveInitialInstanceId();
    this.playerInstances = new Map();
  }

  update(dt: number): void {
    for (const world of this.orderedWorlds) {
      world.update(dt);
    }
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

  suspendPlayer(id: string): void {
    const player = this.getPlayerById(id);
    if (!player) {
      return;
    }

    player.suspendForDisconnect();
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
    return this.orderedWorlds;
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

  getPlayerById(playerId: string): Player | null {
    const instanceId = this.playerInstances.get(playerId);
    if (!instanceId) {
      return null;
    }

    return this.getWorld(instanceId).players.get(playerId) ?? null;
  }

  private createWorld(instanceId: InstanceId, stressEnemiesPerChunk: number): World {
    const definition = INSTANCE_RUNTIME_DEFINITIONS[instanceId];

    return new World({
      instanceId: definition.instanceId,
      spawnX: definition.spawnX,
      spawnY: definition.spawnY,
      primaryEnemyKind: definition.primaryEnemyKind,
      spawnSystem: this.createSpawnSystem(instanceId, stressEnemiesPerChunk),
      bossRegionSystem: this.createBossRegionSystem(instanceId),
      onBossDeathPortal: definition.onBossDeathPortal,
      initialPortals: definition.initialPortals,
    });
  }

  private createSpawnSystem(instanceId: InstanceId, stressEnemiesPerChunk: number): SpawnSystem {
    const definition = INSTANCE_RUNTIME_DEFINITIONS[instanceId];
    const enemyDefinition = getEnemyRuntimeDefinition(definition.primaryEnemyKind);
    const enemiesPerChunk =
      stressEnemiesPerChunk > 0 ? stressEnemiesPerChunk : definition.spawnSystem.enemiesPerChunk;

    return new SpawnSystem({
      ...definition.spawnSystem,
      enemyPrefix: enemyDefinition.enemyPrefix,
      ...(enemiesPerChunk !== undefined ? { enemiesPerChunk } : {}),
      createEnemy: (id, x, y, chunkKey) =>
        enemyDefinition.create(
          id,
          x,
          y,
          chunkKey,
          definition.primaryEnemyKind === ENEMY_KINDS.PACMAN_GHOST
            ? { variant: selectPacmanGhostVariant(id) }
            : undefined
        ),
    });
  }

  private createBossRegionSystem(instanceId: InstanceId): BossRegionSystem<BossActorEntity> {
    const definition = INSTANCE_RUNTIME_DEFINITIONS[instanceId];
    const bossRegion = definition.bossRegion;
    const spawnDefinition = getBossRuntimeDefinition(bossRegion.spawnKind);
    const spawningDisabled =
      bossRegion.enableRegionSpawns === false && definition.instanceId === INSTANCE_IDS.PHASE4;

    return new BossRegionSystem<BossActorEntity>({
      enableRegionSpawns: bossRegion.enableRegionSpawns,
      regionSize: bossRegion.regionSize,
      activeRange: bossRegion.activeRange,
      despawnTimeMs: bossRegion.despawnTimeMs,
      keyPrefix: bossRegion.keyPrefix,
      bossPrefix: bossRegion.bossPrefix,
      createBoss: spawningDisabled
        ? () => {
            throw new Error('Phase4 boss spawning is disabled');
          }
        : (id, x, y) => spawnDefinition.create(id, x, y),
      updateBoss: spawningDisabled
        ? () => {
            return;
          }
        : (boss, context) => {
            getBossRuntimeDefinition(boss.kind).update(boss, context);
          },
    });
  }

  private resolveTransfers(): void {
    const transfers = this.orderedWorlds.flatMap((world) => world.consumeTransferRequests());

    for (const transfer of transfers) {
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
    const slimeStore = this.phase2World.getEnemyStore(ENEMY_KINDS.SLIME);
    const slimeDefinition = getEnemyRuntimeDefinition(ENEMY_KINDS.SLIME);
    let nearbySlimes = 0;

    for (const slime of slimeStore.values()) {
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
        const slime = slimeDefinition.create(id, sx, sy, 'phase2_seed');
        slimeStore.set(id, slime);
        this.phase2World.add(slime);
      }
    }

    let nearbyDragon = false;
    for (const boss of this.phase2World.bosses.values()) {
      if (boss.kind !== BOSS_KINDS.DRAGON_LORD) continue;
      const dx = boss.x - x;
      const dy = boss.y - y;
      if (dx * dx + dy * dy <= PHASE2_DRAGON_NEARBY_RADIUS * PHASE2_DRAGON_NEARBY_RADIUS) {
        nearbyDragon = true;
        break;
      }
    }

    if (!nearbyDragon) {
      const bossId = `dragon_seed_${nanoid(8)}`;
      const dragon = getBossRuntimeDefinition(BOSS_KINDS.DRAGON_LORD).create(
        bossId,
        x + 520,
        y + 160
      );
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
      if (existing && existing.kind === bossDef.kind && hasSpawnPoint(existing)) {
        existing.spawnX = bossX;
        existing.spawnY = bossY;
        continue;
      }

      if (existing) {
        this.phase3World.bosses.delete(bossDef.id);
        this.phase3World.remove(bossDef.id);
      }

      const boss = getBossRuntimeDefinition(bossDef.kind).create(bossDef.id, bossX, bossY);
      this.phase3World.bosses.set(bossDef.id, boss);
      this.phase3World.add(boss);
    }
  }

  private ensurePhase4PopulationNear(x: number, y: number): void {
    const ghostStore = this.phase4World.getEnemyStore(ENEMY_KINDS.PACMAN_GHOST);
    const ghostDefinition = getEnemyRuntimeDefinition(ENEMY_KINDS.PACMAN_GHOST);
    let nearbyPacmanGhosts = 0;

    for (const pacmanGhost of ghostStore.values()) {
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
      const pacmanGhost = ghostDefinition.create(id, sx, sy, 'phase4_seed', { variant });
      ghostStore.set(id, pacmanGhost);
      this.phase4World.add(pacmanGhost);
    }
  }
}
