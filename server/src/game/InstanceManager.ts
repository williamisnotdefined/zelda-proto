import { WORLD_SPAWN_X, WORLD_SPAWN_Y } from '@gelehka/shared/constants';
import { DROP_KINDS, INSTANCE_IDS, PORTAL_KINDS } from '@gelehka/shared';
import type { InstanceId } from '@gelehka/shared';
import { nanoid } from 'nanoid';
import { BLOB_CONFIG, Blob } from '../entities/Blob.js';
import { BossGelehk } from '../entities/BossGelehk.js';
import { DragonLord } from '../entities/DragonLord.js';
import { Slime } from '../entities/Slime.js';
import { Player } from '../entities/Player.js';
import type { InputMessage } from '../network/MessageTypes.js';
import { World } from './World.js';
import { BossRegionSystem } from './systems/BossRegionSystem.js';
import { SpawnSystem } from './systems/SpawnSystem.js';

const PHASE1_PORTAL_DURATION_MS = 30000;
const PHASE2_NEARBY_RADIUS = 900;
const PHASE2_MIN_NEARBY_SLIMES = 4;
const PHASE2_STARTER_SLIMES = 8;
const PHASE2_DRAGON_NEARBY_RADIUS = 1800;

export class InstanceManager {
  readonly phase1World: World;
  readonly phase2World: World;
  private readonly phase2SpawnX: number;
  private readonly phase2SpawnY: number;

  private readonly playerInstances: Map<string, InstanceId>;

  constructor() {
    this.phase2SpawnX = WORLD_SPAWN_X + 180;
    this.phase2SpawnY = WORLD_SPAWN_Y;

    const phase1SpawnSystem = new SpawnSystem({
      enemyPrefix: 'blob',
      createEnemy: (id, x, y, chunkKey) =>
        new Blob(id, x, y, chunkKey, BLOB_CONFIG, DROP_KINDS.HEART_SMALL),
    });

    const phase2SpawnSystem = new SpawnSystem({
      enemyPrefix: 'slime',
      createEnemy: (id, x, y, chunkKey) => new Slime(id, x, y, chunkKey),
    });

    const phase1BossSystem = new BossRegionSystem({
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

    const phase2BossSystem = new BossRegionSystem({
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

    this.phase1World = new World({
      instanceId: INSTANCE_IDS.PHASE1,
      spawnX: WORLD_SPAWN_X,
      spawnY: WORLD_SPAWN_Y,
      enemyCollection: 'blobs',
      spawnSystem: phase1SpawnSystem,
      bossRegionSystem: phase1BossSystem,
      onBossDeathPortal: {
        kind: PORTAL_KINDS.PHASE1_TO_PHASE2,
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

    this.seedPhase2StarterContent();

    this.playerInstances = new Map();
  }

  update(dt: number): void {
    this.phase1World.update(dt);
    this.phase2World.update(dt);
    this.resolveTransfers();
  }

  addPlayer(id: string, nickname: string): Player {
    this.playerInstances.set(id, INSTANCE_IDS.PHASE1);
    return this.phase1World.addPlayer(id, nickname);
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
    return [this.phase1World, this.phase2World];
  }

  getInstanceForPlayer(playerId: string): InstanceId | null {
    return this.playerInstances.get(playerId) ?? null;
  }

  getPlayersInInstance(instanceId: InstanceId): Map<string, Player> {
    return instanceId === INSTANCE_IDS.PHASE1 ? this.phase1World.players : this.phase2World.players;
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
    for (const transfer of [...phase1Transfers, ...phase2Transfers]) {
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
    }
  }

  private getWorld(instanceId: InstanceId): World {
    return instanceId === INSTANCE_IDS.PHASE1 ? this.phase1World : this.phase2World;
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
      if (boss.state === 'dead') continue;
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
}
