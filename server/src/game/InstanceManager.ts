import { WORLD_SPAWN_X, WORLD_SPAWN_Y } from '@gelehka/shared/constants';
import { BOSS_KINDS, DROP_KINDS, INSTANCE_IDS, PORTAL_KINDS } from '@gelehka/shared';
import type { InstanceId } from '@gelehka/shared';
import { nanoid } from 'nanoid';
import { BLOB_CONFIG, Blob } from '../entities/Blob.js';
import { BossGelehk } from '../entities/BossGelehk.js';
import { DragonLord } from '../entities/DragonLord.js';
import { Hand } from '../entities/Hand.js';
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
const PHASE3_RETURN_PORTAL_OFFSET_X = 240;
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

export class InstanceManager {
  readonly phase1World: World;
  readonly phase2World: World;
  readonly phase3World: World;
  private readonly phase2SpawnX: number;
  private readonly phase2SpawnY: number;
  private readonly phase3SpawnX: number;
  private readonly phase3SpawnY: number;
  private readonly initialInstanceId: InstanceId;

  private readonly playerInstances: Map<string, InstanceId>;

  constructor() {
    this.phase2SpawnX = WORLD_SPAWN_X + 180;
    this.phase2SpawnY = WORLD_SPAWN_Y;
    this.phase3SpawnX = WORLD_SPAWN_X + 360;
    this.phase3SpawnY = WORLD_SPAWN_Y;

    const phase1SpawnSystem = new SpawnSystem({
      enemyPrefix: 'blob',
      createEnemy: (id, x, y, chunkKey) =>
        new Blob(id, x, y, chunkKey, BLOB_CONFIG, DROP_KINDS.HEART_SMALL),
    });

    const phase2SpawnSystem = new SpawnSystem({
      enemyPrefix: 'slime',
      createEnemy: (id, x, y, chunkKey) => new Slime(id, x, y, chunkKey),
    });

    const phase3SpawnSystem = new SpawnSystem({
      enemyPrefix: 'hand',
      createEnemy: (id, x, y, chunkKey) => new Hand(id, x, y, chunkKey),
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
            ctx.safeZone
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
          boss.update(ctx.dt, ctx.players, (x: number, y: number, dirX: number, dirY: number) => {
            ctx.spawnFireLine(x, y, dirX, dirY);
          });
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
        if (boss instanceof DragonLord) {
          boss.update(ctx.dt, ctx.players, (x: number, y: number, dirX: number, dirY: number) => {
            ctx.spawnFireLine(x, y, dirX, dirY);
          });
        }
      },
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

    this.seedPhase2StarterContent();
    this.ensurePhase3BossesNear(this.phase3SpawnX, this.phase3SpawnY);

    this.initialInstanceId = this.resolveInitialInstanceId();

    this.playerInstances = new Map();
  }

  update(dt: number): void {
    this.phase1World.update(dt);
    this.phase2World.update(dt);
    this.phase3World.update(dt);
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
    return [this.phase1World, this.phase2World, this.phase3World];
  }

  getInstanceForPlayer(playerId: string): InstanceId | null {
    return this.playerInstances.get(playerId) ?? null;
  }

  getPlayersInInstance(instanceId: InstanceId): Map<string, Player> {
    if (instanceId === INSTANCE_IDS.PHASE1) {
      return this.phase1World.players;
    }
    if (instanceId === INSTANCE_IDS.PHASE2) {
      return this.phase2World.players;
    }
    return this.phase3World.players;
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
    for (const transfer of [...phase1Transfers, ...phase2Transfers, ...phase3Transfers]) {
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

    if (toInstanceId === INSTANCE_IDS.PHASE2) {
      this.ensurePhase2PopulationNear(x, y);
    } else if (toInstanceId === INSTANCE_IDS.PHASE3) {
      this.ensurePhase3BossesNear(x, y);
    }
  }

  private getWorld(instanceId: InstanceId): World {
    if (instanceId === INSTANCE_IDS.PHASE1) {
      return this.phase1World;
    }
    if (instanceId === INSTANCE_IDS.PHASE2) {
      return this.phase2World;
    }
    return this.phase3World;
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

    for (const [bossId, boss] of this.phase3World.bosses) {
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
}
