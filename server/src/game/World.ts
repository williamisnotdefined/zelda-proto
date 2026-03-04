import {
  WORLD_SPAWN_SAFE_ZONE_RADIUS,
  WORLD_SPAWN_X,
  WORLD_SPAWN_Y,
} from '@gelehka/shared/constants';
import type { DropKind, HazardKind, InstanceId, PortalKind } from '@gelehka/shared';
import { Entity } from '../core/Entity.js';
import { World as EntityWorld } from '../core/World.js';
import { Blob } from '../entities/Blob.js';
import { BossGelehk, ICE_ZONE_SLOW } from '../entities/BossGelehk.js';
import { DragonLord } from '../entities/DragonLord.js';
import { Phase3Boss } from '../entities/Phase3Boss.js';
import { Player, SAFE_ZONE_DURATION } from '../entities/Player.js';
import type { InputMessage } from '../network/MessageTypes.js';
import {
  resolveBossContactDamageWithSafeZone,
  resolveEnemyContactDamageWithSafeZone,
  resolvePlayerAttacks,
  resolvePlayerVsPlayerWithSafeZone,
} from './Combat.js';
import { BossRegionSystem } from './systems/BossRegionSystem.js';
import { DropSystem } from './systems/DropSystem.js';
import { HazardSystem } from './systems/HazardSystem.js';
import { PortalSystem } from './systems/PortalSystem.js';
import { SafeZoneSystem } from './systems/SafeZoneSystem.js';
import { SpawnSystem } from './systems/SpawnSystem.js';
import { SpatialIndexSystem } from './systems/SpatialIndexSystem.js';
import type { BossActor } from './systems/BossRegionSystem.js';

const PLAYER_RESPAWN_TIME = 1500;

export const PLAYER_SPAWN_X = WORLD_SPAWN_X;
export const PLAYER_SPAWN_Y = WORLD_SPAWN_Y;
export const SPAWN_SAFE_ZONE_RADIUS = WORLD_SPAWN_SAFE_ZONE_RADIUS;

export interface Drop {
  id: string;
  x: number;
  y: number;
  kind: DropKind;
}

export interface Portal {
  id: string;
  x: number;
  y: number;
  kind: PortalKind;
  sourceBossId?: string;
  toInstanceId: InstanceId;
  targetX: number;
  targetY: number;
  activeAtMs: number;
  expiresAtMs: number | null;
}

export interface Hazard {
  id: string;
  x: number;
  y: number;
  kind: HazardKind;
  ttlMs: number;
  damage: number;
  burningTicks: number;
  hitPlayerIds: Set<string>;
}

export interface PortalTransferRequest {
  playerId: string;
  toInstanceId: InstanceId;
  targetX: number;
  targetY: number;
}

export interface PortalConfig {
  kind: PortalKind;
  x: number;
  y: number;
  sourceBossId?: string;
  toInstanceId: InstanceId;
  targetX: number;
  targetY: number;
  activationDelayMs?: number;
  durationMs?: number;
}

export type BossActorEntity = (BossGelehk | DragonLord | Phase3Boss) & BossActor;

export interface WorldConfig {
  instanceId: InstanceId;
  spawnX: number;
  spawnY: number;
  enemyCollection: 'blobs' | 'slimes' | 'hands';
  spawnSystem: SpawnSystem;
  bossRegionSystem: BossRegionSystem<BossActorEntity>;
  onBossDeathPortal?: {
    kind: PortalKind;
    sourceBossKinds?: readonly BossActorEntity['kind'][];
    toInstanceId: InstanceId;
    targetX: number;
    targetY: number;
    activationDelayMs?: number;
    durationMs: number;
  };
  initialPortals?: PortalConfig[];
}

export class World extends EntityWorld<Entity> {
  readonly instanceId: InstanceId;
  players: Map<string, Player>;
  blobs: Map<string, Blob>;
  slimes: Map<string, Blob>;
  hands: Map<string, Blob>;
  bosses: Map<string, BossActorEntity>;
  drops: Map<string, Drop>;
  portals: Map<string, Portal>;
  hazards: Map<string, Hazard>;

  private now: number;
  private readonly config: WorldConfig;
  private readonly dropSystem: DropSystem;
  private readonly safeZoneSystem: SafeZoneSystem;
  private readonly hazardSystem: HazardSystem;
  private readonly portalSystem: PortalSystem;
  private readonly spatialIndexSystem: SpatialIndexSystem;

  constructor(config: WorldConfig) {
    super();
    this.config = config;
    this.instanceId = config.instanceId;
    this.players = new Map();
    this.blobs = new Map();
    this.slimes = new Map();
    this.hands = new Map();
    this.bosses = new Map();
    this.drops = new Map();
    this.portals = new Map();
    this.hazards = new Map();
    this.now = Date.now();

    this.dropSystem = new DropSystem();
    this.safeZoneSystem = new SafeZoneSystem();
    this.hazardSystem = new HazardSystem();
    this.portalSystem = new PortalSystem();
    this.spatialIndexSystem = new SpatialIndexSystem(512);

    for (const portal of config.initialPortals ?? []) {
      this.spawnPortal(portal);
    }
  }

  addPlayer(id: string, nickname: string = 'Player', x?: number, y?: number): Player {
    const player = new Player(id, x ?? this.config.spawnX, y ?? this.config.spawnY, nickname);
    this.players.set(id, player);
    this.add(player);
    this.safeZoneSystem.enforceHostilesOutside(this.getAllEnemies(), this.bosses.values(), {
      x: this.config.spawnX,
      y: this.config.spawnY,
      radius: SPAWN_SAFE_ZONE_RADIUS,
    });
    this.rebuildSpatialIndexes();
    return player;
  }

  adoptPlayer(player: Player, x: number, y: number): void {
    player.x = x;
    player.y = y;
    player.lastInput = null;
    player.safeZoneTimer = SAFE_ZONE_DURATION;
    this.players.set(player.id, player);
    this.add(player);
    this.safeZoneSystem.enforceHostilesOutside(this.getAllEnemies(), this.bosses.values(), {
      x: this.config.spawnX,
      y: this.config.spawnY,
      radius: SPAWN_SAFE_ZONE_RADIUS,
    });
    this.rebuildSpatialIndexes();
  }

  removePlayer(id: string): Player | null {
    const player = this.players.get(id) ?? null;
    this.remove(id);
    this.players.delete(id);
    this.portalSystem.removePlayer(id);
    this.rebuildSpatialIndexes();
    return player;
  }

  handleInput(playerId: string, input: InputMessage): void {
    const player = this.players.get(playerId);
    if (player) {
      player.applyInput(input);
    }
  }

  isSpawnSafeZoneActive(): boolean {
    return this.safeZoneSystem.isActive(this.players.values());
  }

  update(dt: number): void {
    this.now = Date.now();
    let safeZoneCreatedThisTick = false;

    for (const player of this.players.values()) {
      if (player.safeZoneTimer > 0) {
        player.safeZoneTimer -= dt;
      }

      let speedMult = 1;
      for (const boss of this.bosses.values()) {
        if (
          boss instanceof BossGelehk &&
          boss.active &&
          boss.state !== 'dead' &&
          boss.isInIceZone(player.x, player.y)
        ) {
          speedMult = ICE_ZONE_SLOW;
          break;
        }
      }
      player.update(dt, speedMult);
    }

    for (const player of this.players.values()) {
      if (player.state === 'dead') {
        player.respawnTimer += dt;
        if (player.respawnTimer >= PLAYER_RESPAWN_TIME) {
          player.respawn(this.config.spawnX, this.config.spawnY);
          safeZoneCreatedThisTick = true;
        }
      }
    }

    const spawnSafeZone = {
      x: this.config.spawnX,
      y: this.config.spawnY,
      radius: SPAWN_SAFE_ZONE_RADIUS,
    };

    const spawnSafeZoneActive = this.safeZoneSystem.update(
      this.players.values(),
      this.getAllEnemies(),
      this.bosses.values(),
      spawnSafeZone,
      safeZoneCreatedThisTick
    );

    this.config.spawnSystem.update(
      this.now,
      this.players,
      this.getSpawnTargetEnemies(),
      (entity) => this.add(entity),
      (id) => this.remove(id)
    );

    for (const enemy of this.getAllEnemies()) {
      enemy.updateWithSafeZone(dt, this.players, spawnSafeZoneActive, spawnSafeZone);
      enemy.tryRespawn(dt);
    }

    this.config.bossRegionSystem.update(
      this.now,
      this.players,
      this.bosses,
      (entity) => this.add(entity),
      (id) => this.remove(id),
      {
        dt,
        players: this.players,
        spawnMinions: (x, y) =>
          this.config.spawnSystem.spawnMinions(x, y, this.getSpawnTargetEnemies(), (entity) =>
            this.add(entity)
          ),
        spawnFireLine: (x, y, dirX, dirY) =>
          this.hazardSystem.spawnFireFieldLine(x, y, dirX, dirY, this.now),
        safeZone: spawnSafeZone,
      }
    );

    if (spawnSafeZoneActive) {
      this.safeZoneSystem.enforceHostilesOutside(
        this.getAllEnemies(),
        this.bosses.values(),
        spawnSafeZone
      );
    }

    resolvePlayerAttacks(this.players, this.getAllEnemies(), this.bosses);
    resolvePlayerVsPlayerWithSafeZone(this.players, spawnSafeZone);
    resolveEnemyContactDamageWithSafeZone(this.getAllEnemies(), this.players, spawnSafeZone);
    resolveBossContactDamageWithSafeZone(this.bosses, this.players, spawnSafeZone);

    this.hazardSystem.update(dt, this.now, this.players, this.hazards, spawnSafeZone);
    this.dropSystem.update(this.players, this.getAllEnemies(), this.drops);
    this.portalSystem.update(
      this.now,
      this.players,
      this.portals,
      this.bosses,
      this.config.onBossDeathPortal
    );
    this.rebuildSpatialIndexes();
  }

  consumeTransferRequests(): PortalTransferRequest[] {
    return this.portalSystem.consumeTransferRequests();
  }

  queryPlayersInRadius(x: number, y: number, radius: number): Player[] {
    return this.spatialIndexSystem.queryPlayersInRadius(x, y, radius);
  }

  queryEnemiesInRadius(x: number, y: number, radius: number): Blob[] {
    return this.spatialIndexSystem.queryEnemiesInRadius(x, y, radius);
  }

  queryBossesInRadius(x: number, y: number, radius: number): BossActorEntity[] {
    return this.spatialIndexSystem.queryBossesInRadius(x, y, radius, this.bosses);
  }

  queryDropsInRadius(x: number, y: number, radius: number): Drop[] {
    return this.spatialIndexSystem.queryDropsInRadius(x, y, radius);
  }

  queryPortalsInRadius(x: number, y: number, radius: number): Portal[] {
    return this.spatialIndexSystem.queryPortalsInRadius(x, y, radius);
  }

  queryHazardsInRadius(x: number, y: number, radius: number): Hazard[] {
    return this.spatialIndexSystem.queryHazardsInRadius(x, y, radius);
  }

  spawnPortal(config: PortalConfig): Portal {
    return this.portalSystem.spawnPortal(this.portals, config, this.now);
  }

  private rebuildSpatialIndexes(): void {
    this.spatialIndexSystem.rebuild(
      this.players,
      this.blobs,
      this.slimes,
      this.hands,
      this.bosses,
      this.drops,
      this.portals,
      this.hazards
    );
  }

  private getSpawnTargetEnemies(): Map<string, Blob> {
    if (this.config.enemyCollection === 'slimes') {
      return this.slimes;
    }
    if (this.config.enemyCollection === 'hands') {
      return this.hands;
    }
    return this.blobs;
  }

  private *getAllEnemies(): Iterable<Blob> {
    for (const blob of this.blobs.values()) {
      yield blob;
    }
    for (const slime of this.slimes.values()) {
      yield slime;
    }
    for (const hand of this.hands.values()) {
      yield hand;
    }
  }
}
