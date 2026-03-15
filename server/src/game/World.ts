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
  enemyCollection: 'blobs' | 'slimes' | 'hands' | 'pacmanGhosts';
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
  pacmanGhosts: Map<string, Blob>;
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
    this.pacmanGhosts = new Map();
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

    this.rebuildPlayerIndex();

    for (const enemy of this.getAllEnemies()) {
      enemy.updateWithSafeZone(
        dt,
        this.players,
        spawnSafeZoneActive,
        spawnSafeZone,
        (x, y, radius, predicate) => this.findNearestPlayerInRadius(x, y, radius, predicate)
      );
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
        spawnFireLine: (x, y, dirX, dirY, kind) =>
          this.hazardSystem.spawnFireFieldLine(x, y, dirX, dirY, this.now, kind),
        spawnPurpleField: (x, y) => this.hazardSystem.spawnPurpleField(this.hazards, x, y),
        safeZone: spawnSafeZone,
        findNearestPlayerInRadius: (x, y, radius, predicate) =>
          this.findNearestPlayerInRadius(x, y, radius, predicate),
        forEachPlayerInRadius: (x, y, radius, callback) =>
          this.forEachPlayerInRadius(x, y, radius, callback),
      }
    );

    if (spawnSafeZoneActive) {
      this.safeZoneSystem.enforceHostilesOutside(
        this.getAllEnemies(),
        this.bosses.values(),
        spawnSafeZone
      );
    }

    this.rebuildEnemyBossIndexes();

    resolvePlayerAttacks(
      this.players,
      (x, y, radius, callback) => this.forEachEnemyInRadius(x, y, radius, callback),
      (x, y, radius, callback) => this.forEachBossInRadius(x, y, radius, callback)
    );
    resolvePlayerVsPlayerWithSafeZone(this.players, spawnSafeZone);
    resolveEnemyContactDamageWithSafeZone(
      this.getAllEnemies(),
      this.players,
      spawnSafeZone,
      (x, y, radius, callback) => this.forEachPlayerInRadius(x, y, radius, callback)
    );
    resolveBossContactDamageWithSafeZone(
      this.bosses,
      this.players,
      spawnSafeZone,
      (x, y, radius, callback) => this.forEachPlayerInRadius(x, y, radius, callback)
    );
    this.rebuildEnemyBossIndexes();

    this.hazardSystem.update(
      dt,
      this.now,
      this.players,
      this.hazards,
      spawnSafeZone,
      (x, y, radius, callback) => this.forEachPlayerInRadius(x, y, radius, callback)
    );
    this.dropSystem.update(
      this.players,
      this.getAllEnemies(),
      this.drops,
      (x, y, radius, callback) => this.forEachPlayerInRadius(x, y, radius, callback)
    );
    this.portalSystem.update(
      this.now,
      this.players,
      this.portals,
      this.bosses,
      (x, y, radius, callback) => this.forEachPlayerInRadius(x, y, radius, callback),
      this.config.onBossDeathPortal
    );
    this.rebuildStaticIndexes();
  }

  consumeTransferRequests(): PortalTransferRequest[] {
    return this.portalSystem.consumeTransferRequests();
  }

  queryPlayersInRadius(x: number, y: number, radius: number): Player[] {
    return this.spatialIndexSystem.queryPlayersInRadius(x, y, radius);
  }

  forEachPlayerInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (player: Player) => void
  ): void {
    this.spatialIndexSystem.forEachPlayerInRadius(x, y, radius, callback);
  }

  findNearestPlayerInRadius(
    x: number,
    y: number,
    radius: number,
    predicate?: (player: Player) => boolean
  ): Player | null {
    return this.spatialIndexSystem.findNearestPlayerInRadius(x, y, radius, predicate);
  }

  queryEnemiesInRadius(x: number, y: number, radius: number): Blob[] {
    return this.spatialIndexSystem.queryEnemiesInRadius(x, y, radius);
  }

  forEachEnemyInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (enemy: Blob) => void
  ): void {
    this.spatialIndexSystem.forEachEnemyInRadius(x, y, radius, callback);
  }

  forEachBossInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (boss: BossActorEntity) => void
  ): void {
    this.spatialIndexSystem.forEachBossInRadius(x, y, radius, callback);
  }

  queryBossesInRadius(x: number, y: number, radius: number): BossActorEntity[] {
    return this.spatialIndexSystem.queryBossesInRadius(x, y, radius, this.bosses);
  }

  queryDropsInRadius(x: number, y: number, radius: number): Drop[] {
    return this.spatialIndexSystem.queryDropsInRadius(x, y, radius);
  }

  forEachDropInRadius(x: number, y: number, radius: number, callback: (drop: Drop) => void): void {
    this.spatialIndexSystem.forEachDropInRadius(x, y, radius, callback);
  }

  queryPortalsInRadius(x: number, y: number, radius: number): Portal[] {
    return this.spatialIndexSystem.queryPortalsInRadius(x, y, radius);
  }

  forEachPortalInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (portal: Portal) => void
  ): void {
    this.spatialIndexSystem.forEachPortalInRadius(x, y, radius, callback);
  }

  queryHazardsInRadius(x: number, y: number, radius: number): Hazard[] {
    return this.spatialIndexSystem.queryHazardsInRadius(x, y, radius);
  }

  forEachHazardInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (hazard: Hazard) => void
  ): void {
    this.spatialIndexSystem.forEachHazardInRadius(x, y, radius, callback);
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
      this.pacmanGhosts,
      this.bosses,
      this.drops,
      this.portals,
      this.hazards
    );
  }

  private rebuildPlayerIndex(): void {
    this.spatialIndexSystem.rebuildPlayerIndex(this.players);
  }

  private rebuildEnemyBossIndexes(): void {
    this.spatialIndexSystem.rebuildEnemyBossIndexes(
      this.blobs,
      this.slimes,
      this.hands,
      this.pacmanGhosts,
      this.bosses
    );
  }

  private rebuildStaticIndexes(): void {
    this.spatialIndexSystem.rebuildStaticIndexes(this.drops, this.portals, this.hazards);
  }

  private getSpawnTargetEnemies(): Map<string, Blob> {
    if (this.config.enemyCollection === 'slimes') {
      return this.slimes;
    }
    if (this.config.enemyCollection === 'hands') {
      return this.hands;
    }
    if (this.config.enemyCollection === 'pacmanGhosts') {
      return this.pacmanGhosts;
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
    for (const pacmanGhost of this.pacmanGhosts.values()) {
      yield pacmanGhost;
    }
  }
}
