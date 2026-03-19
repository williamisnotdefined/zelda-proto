import { ENEMY_KINDS } from '@gelehka/shared';
import {
  WORLD_SPAWN_SAFE_ZONE_RADIUS,
  WORLD_SPAWN_X,
  WORLD_SPAWN_Y,
} from '@gelehka/shared/constants';
import type { DropKind, EnemyKind, HazardKind, InstanceId, PortalKind } from '@gelehka/shared';
import { Entity } from '../core/Entity.js';
import { World as EntityWorld } from '../core/World.js';
import { Blob } from '../entities/Blob.js';
import { Player, SAFE_ZONE_DURATION } from '../entities/Player.js';
import type { InputMessage } from '../network/MessageTypes.js';
import { ContactDamageSystem } from './combat/ContactDamageSystem.js';
import { DamageApplicationSystem } from './combat/DamageApplicationSystem.js';
import { DamageResolutionSystem } from './combat/DamageResolutionSystem.js';
import { PlayerAttackIntentSystem } from './combat/PlayerAttackIntentSystem.js';
import { PlayerPvpIntentSystem } from './combat/PlayerPvpIntentSystem.js';
import { getBossRuntimeDefinition, type BossRuntimeEntity } from './registries/bossRegistry.js';
import { BossRegionSystem } from './systems/BossRegionSystem.js';
import { DropSystem } from './systems/DropSystem.js';
import { HazardSystem } from './systems/HazardSystem.js';
import { PortalSystem } from './systems/PortalSystem.js';
import { SafeZoneSystem } from './systems/SafeZoneSystem.js';
import { SpawnSystem } from './systems/SpawnSystem.js';
import { ActorStore } from './stores/ActorStore.js';
import { StaticEntityStore } from './stores/StaticEntityStore.js';

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

export type BossActorEntity = BossRuntimeEntity;

export interface WorldConfig {
  instanceId: InstanceId;
  spawnX: number;
  spawnY: number;
  primaryEnemyKind: EnemyKind;
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
  readonly players: Map<string, Player>;
  readonly bosses: Map<string, BossActorEntity>;

  private now: number;
  private readonly config: WorldConfig;
  private readonly actorStore: ActorStore;
  private readonly staticEntityStore: StaticEntityStore;
  private readonly dropSystem: DropSystem;
  private readonly safeZoneSystem: SafeZoneSystem;
  private readonly hazardSystem: HazardSystem;
  private readonly portalSystem: PortalSystem;
  private readonly playerAttackIntentSystem: PlayerAttackIntentSystem;
  private readonly playerPvpIntentSystem: PlayerPvpIntentSystem;
  private readonly contactDamageSystem: ContactDamageSystem;
  private readonly damageResolutionSystem: DamageResolutionSystem;
  private readonly damageApplicationSystem: DamageApplicationSystem;

  constructor(config: WorldConfig) {
    super();
    this.config = config;
    this.instanceId = config.instanceId;
    this.actorStore = new ActorStore();
    this.players = this.actorStore.players;
    this.bosses = this.actorStore.bosses;
    this.staticEntityStore = new StaticEntityStore();
    this.now = Date.now();

    this.dropSystem = new DropSystem();
    this.safeZoneSystem = new SafeZoneSystem();
    this.hazardSystem = new HazardSystem();
    this.portalSystem = new PortalSystem();
    this.playerAttackIntentSystem = new PlayerAttackIntentSystem();
    this.playerPvpIntentSystem = new PlayerPvpIntentSystem();
    this.contactDamageSystem = new ContactDamageSystem();
    this.damageResolutionSystem = new DamageResolutionSystem();
    this.damageApplicationSystem = new DamageApplicationSystem();

    for (const portal of config.initialPortals ?? []) {
      this.spawnPortal(portal);
    }
  }

  get blobs(): Map<string, Blob> {
    return this.getEnemyStore(ENEMY_KINDS.BLOB);
  }

  get slimes(): Map<string, Blob> {
    return this.getEnemyStore(ENEMY_KINDS.SLIME);
  }

  get hands(): Map<string, Blob> {
    return this.getEnemyStore(ENEMY_KINDS.HAND);
  }

  get pacmanGhosts(): Map<string, Blob> {
    return this.getEnemyStore(ENEMY_KINDS.PACMAN_GHOST);
  }

  get drops(): Map<string, Drop> {
    return this.staticEntityStore.drops;
  }

  get portals(): Map<string, Portal> {
    return this.staticEntityStore.portals;
  }

  get hazards(): Map<string, Hazard> {
    return this.staticEntityStore.hazards;
  }

  addPlayer(id: string, nickname: string = 'Player', x?: number, y?: number): Player {
    const player = new Player(id, x ?? this.config.spawnX, y ?? this.config.spawnY, nickname);
    this.players.set(id, player);
    this.add(player);
    this.syncHostilesForQueries();
    this.syncPlayersForQueries({
      x: this.config.spawnX,
      y: this.config.spawnY,
      radius: SPAWN_SAFE_ZONE_RADIUS,
    });
    this.safeZoneSystem.enforceHostilesOutside(this.getAliveEnemies(), this.getAliveBosses(), {
      x: this.config.spawnX,
      y: this.config.spawnY,
      radius: SPAWN_SAFE_ZONE_RADIUS,
    });
    return player;
  }

  adoptPlayer(player: Player, x: number, y: number): void {
    player.x = x;
    player.y = y;
    player.lastInput = null;
    player.safeZoneTimer = SAFE_ZONE_DURATION;
    this.players.set(player.id, player);
    this.add(player);
    this.syncHostilesForQueries();
    this.syncPlayersForQueries({
      x: this.config.spawnX,
      y: this.config.spawnY,
      radius: SPAWN_SAFE_ZONE_RADIUS,
    });
    this.safeZoneSystem.enforceHostilesOutside(this.getAliveEnemies(), this.getAliveBosses(), {
      x: this.config.spawnX,
      y: this.config.spawnY,
      radius: SPAWN_SAFE_ZONE_RADIUS,
    });
  }

  removePlayer(id: string): Player | null {
    const player = this.players.get(id) ?? null;
    this.remove(id);
    this.players.delete(id);
    this.portalSystem.removePlayer(id);
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

  getEnemyStore(kind: EnemyKind): Map<string, Blob> {
    return this.actorStore.getEnemyStore(kind);
  }

  getEnemyStores(): Iterable<Map<string, Blob>> {
    return this.actorStore.getEnemyStores();
  }

  getPlayersForQueries(): Player[] {
    return this.actorStore.getPlayers();
  }

  getAlivePlayers(): Player[] {
    return this.actorStore.getAlivePlayers();
  }

  *getAllEnemies(): Iterable<Blob> {
    for (const store of this.actorStore.getEnemyStores()) {
      for (const enemy of store.values()) {
        yield enemy;
      }
    }
  }

  getAliveEnemies(): Blob[] {
    return this.actorStore.getAliveEnemies();
  }

  getBossesForQueries(): BossActorEntity[] {
    return this.actorStore.getBosses();
  }

  getAliveBosses(): BossActorEntity[] {
    return this.actorStore.getAliveBosses();
  }

  update(dt: number): void {
    this.now = Date.now();

    const spawnSafeZone = {
      x: this.config.spawnX,
      y: this.config.spawnY,
      radius: SPAWN_SAFE_ZONE_RADIUS,
    };

    this.tickPlayers(dt);
    const safeZoneCreatedThisTick = this.respawnPlayers(dt);
    this.syncPlayersForQueries(spawnSafeZone);
    const spawnSafeZoneActive = this.updateSafeZone(spawnSafeZone, safeZoneCreatedThisTick);

    this.updateSpawnSystem();
    this.updateEnemies(dt, spawnSafeZoneActive, spawnSafeZone);
    this.updateBosses(dt, spawnSafeZone);
    this.syncHostilesForQueries();

    if (spawnSafeZoneActive) {
      this.safeZoneSystem.enforceHostilesOutside(
        this.getAliveEnemies(),
        this.getAliveBosses(),
        spawnSafeZone
      );
      this.syncHostilesForQueries();
    }

    this.resolveCombat(spawnSafeZone);
    this.syncAllActorsForQueries(spawnSafeZone);
    this.updateStaticSystems(dt, spawnSafeZone);
    this.syncAllActorsForQueries(spawnSafeZone);
  }

  consumeTransferRequests(): PortalTransferRequest[] {
    return this.portalSystem.consumeTransferRequests();
  }

  queryPlayersInRadius(x: number, y: number, radius: number): Player[] {
    return this.actorStore.queryPlayersInRadius(x, y, radius);
  }

  forEachPlayerInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (player: Player) => void
  ): void {
    this.actorStore.forEachPlayerInRadius(x, y, radius, callback);
  }

  findNearestPlayerInRadius(
    x: number,
    y: number,
    radius: number,
    predicate?: (player: Player) => boolean
  ): Player | null {
    return this.actorStore.findNearestPlayerInRadius(x, y, radius, predicate);
  }

  queryEnemiesInRadius(x: number, y: number, radius: number): Blob[] {
    return this.actorStore.queryEnemiesInRadius(x, y, radius);
  }

  forEachEnemyInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (enemy: Blob) => void
  ): void {
    this.actorStore.forEachEnemyInRadius(x, y, radius, callback);
  }

  forEachBossInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (boss: BossActorEntity) => void
  ): void {
    this.actorStore.forEachBossInRadius(x, y, radius, callback);
  }

  queryBossesInRadius(x: number, y: number, radius: number): BossActorEntity[] {
    return this.actorStore.queryBossesInRadius(x, y, radius, { includeDead: true });
  }

  queryDropsInRadius(x: number, y: number, radius: number): Drop[] {
    return this.staticEntityStore.queryDropsInRadius(x, y, radius);
  }

  forEachDropInRadius(x: number, y: number, radius: number, callback: (drop: Drop) => void): void {
    this.staticEntityStore.forEachDropInRadius(x, y, radius, callback);
  }

  queryPortalsInRadius(x: number, y: number, radius: number): Portal[] {
    return this.staticEntityStore.queryPortalsInRadius(x, y, radius);
  }

  forEachPortalInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (portal: Portal) => void
  ): void {
    this.staticEntityStore.forEachPortalInRadius(x, y, radius, callback);
  }

  queryHazardsInRadius(x: number, y: number, radius: number): Hazard[] {
    return this.staticEntityStore.queryHazardsInRadius(x, y, radius);
  }

  forEachHazardInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (hazard: Hazard) => void
  ): void {
    this.staticEntityStore.forEachHazardInRadius(x, y, radius, callback);
  }

  spawnPortal(config: PortalConfig): Portal {
    return this.portalSystem.spawnPortal(this.portals, config, this.now);
  }

  private tickPlayers(dt: number): void {
    for (const player of this.players.values()) {
      if (player.safeZoneTimer > 0) {
        player.safeZoneTimer -= dt;
      }

      player.update(dt, this.getPlayerSpeedMultiplier(player));
    }
  }

  private respawnPlayers(dt: number): boolean {
    let safeZoneCreatedThisTick = false;

    for (const player of this.players.values()) {
      if (player.state !== 'dead') {
        continue;
      }

      player.respawnTimer += dt;
      if (player.respawnTimer >= PLAYER_RESPAWN_TIME) {
        player.respawn(this.config.spawnX, this.config.spawnY);
        safeZoneCreatedThisTick = true;
      }
    }

    return safeZoneCreatedThisTick;
  }

  private updateSafeZone(
    safeZone: { x: number; y: number; radius: number },
    safeZoneCreatedThisTick: boolean
  ): boolean {
    return this.safeZoneSystem.update(
      this.players.values(),
      this.getAliveEnemies(),
      this.getAliveBosses(),
      safeZone,
      safeZoneCreatedThisTick
    );
  }

  private updateSpawnSystem(): void {
    this.config.spawnSystem.update(
      this.now,
      this.players,
      this.getSpawnTargetEnemies(),
      (entity) => this.add(entity),
      (id) => this.remove(id)
    );
  }

  private updateEnemies(
    dt: number,
    spawnSafeZoneActive: boolean,
    spawnSafeZone: { x: number; y: number; radius: number }
  ): void {
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
  }

  private updateBosses(dt: number, spawnSafeZone: { x: number; y: number; radius: number }): void {
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
  }

  private resolveCombat(safeZone: { x: number; y: number; radius: number }): void {
    this.syncAllActorsForQueries(safeZone);
    this.playerAttackIntentSystem.update(this.actorStore);
    this.damageResolutionSystem.update(this.actorStore);
    this.damageApplicationSystem.update(this.actorStore);

    this.syncAllActorsForQueries(safeZone);
    this.playerPvpIntentSystem.update(this.actorStore, safeZone);
    this.damageResolutionSystem.update(this.actorStore);
    this.damageApplicationSystem.update(this.actorStore);

    this.syncAllActorsForQueries(safeZone);
    this.contactDamageSystem.update(this.actorStore);
    this.damageApplicationSystem.update(this.actorStore);
  }

  private updateStaticSystems(
    dt: number,
    spawnSafeZone: { x: number; y: number; radius: number }
  ): void {
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
  }

  private getPlayerSpeedMultiplier(player: Player): number {
    let speedMultiplier = 1;

    for (const boss of this.getAliveBosses()) {
      const bossSpeedMultiplier =
        getBossRuntimeDefinition(boss.kind).getPlayerSpeedMultiplier?.(boss, player) ?? 1;
      speedMultiplier = Math.min(speedMultiplier, bossSpeedMultiplier);
    }

    return speedMultiplier;
  }

  private getSpawnTargetEnemies(): Map<string, Blob> {
    return this.getEnemyStore(this.config.primaryEnemyKind);
  }

  private syncPlayersForQueries(safeZone: { x: number; y: number; radius: number }): void {
    this.actorStore.syncPlayers(safeZone);
  }

  private syncHostilesForQueries(): void {
    this.actorStore.syncEnemies();
    this.actorStore.syncBosses();
  }

  private syncAllActorsForQueries(safeZone: { x: number; y: number; radius: number }): void {
    this.actorStore.syncAllActors(safeZone);
  }
}
