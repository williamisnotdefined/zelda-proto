import {
  WORLD_SPAWN_SAFE_ZONE_RADIUS,
  WORLD_SPAWN_X,
  WORLD_SPAWN_Y,
} from '@gelehka/shared/constants';
import { HAZARD_KINDS } from '@gelehka/shared';
import type { DropKind, HazardKind, InstanceId, PortalKind } from '@gelehka/shared';
import { nanoid } from 'nanoid';
import { Entity } from '../core/Entity.js';
import { SpatialHash } from '../core/SpatialHash.js';
import { World as EntityWorld } from '../core/World.js';
import { BLOB_DAMAGE, Blob } from '../entities/Blob.js';
import { BossGelehk, ICE_ZONE_SLOW } from '../entities/BossGelehk.js';
import { DragonLord } from '../entities/DragonLord.js';
import { Player } from '../entities/Player.js';
import type { InputMessage } from '../network/MessageTypes.js';
import {
  resolveBossContactDamageWithSafeZone,
  resolveEnemyContactDamageWithSafeZone,
  resolvePlayerAttacks,
  resolvePlayerVsPlayerWithSafeZone,
} from './Combat.js';
import { BossRegionSystem } from './systems/BossRegionSystem.js';
import type { BossActor } from './systems/BossRegionSystem.js';
import { DropSystem } from './systems/DropSystem.js';
import { SpawnSystem } from './systems/SpawnSystem.js';
import { SAFE_ZONE_DURATION } from '../entities/Player.js';

const PLAYER_RESPAWN_TIME = 1500;
const PORTAL_RADIUS = 42;
const FIRE_FIELD_DURATION_MS = 1800;
const FIRE_FIELD_SEGMENTS = 7;
const FIRE_FIELD_SPACING = 36;
const PORTAL_TRANSFER_COOLDOWN_MS = 600;

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

export interface WorldConfig {
  instanceId: InstanceId;
  spawnX: number;
  spawnY: number;
  enemyCollection: 'blobs' | 'slimes';
  spawnSystem: SpawnSystem;
  bossRegionSystem: BossRegionSystem<any>;
  onBossDeathPortal?: {
    kind: PortalKind;
    toInstanceId: InstanceId;
    targetX: number;
    targetY: number;
    activationDelayMs?: number;
    durationMs: number;
  };
  initialPortals?: PortalConfig[];
}

export type BossActorEntity = (BossGelehk | DragonLord) & BossActor;

export class World extends EntityWorld<Entity> {
  readonly instanceId: InstanceId;
  players: Map<string, Player>;
  blobs: Map<string, Blob>;
  slimes: Map<string, Blob>;
  bosses: Map<string, BossActorEntity>;
  drops: Map<string, Drop>;
  portals: Map<string, Portal>;
  hazards: Map<string, Hazard>;

  private now: number;
  private readonly config: WorldConfig;
  private readonly playerSpatialIndex: SpatialHash<Player>;
  private readonly enemySpatialIndex: SpatialHash<Blob>;
  private readonly bossSpatialIndex: SpatialHash<BossActorEntity>;
  private readonly dropSpatialIndex: SpatialHash<Drop>;
  private readonly portalSpatialIndex: SpatialHash<Portal>;
  private readonly hazardSpatialIndex: SpatialHash<Hazard>;
  private readonly dropSystem: DropSystem;
  private transferRequests: PortalTransferRequest[];
  private portalOverlapsByPlayer: Map<string, Set<string>>;

  constructor(config: WorldConfig) {
    super();
    this.config = config;
    this.instanceId = config.instanceId;
    this.players = new Map();
    this.blobs = new Map();
    this.slimes = new Map();
    this.bosses = new Map();
    this.drops = new Map();
    this.portals = new Map();
    this.hazards = new Map();
    this.now = Date.now();

    this.playerSpatialIndex = new SpatialHash(512);
    this.enemySpatialIndex = new SpatialHash(512);
    this.bossSpatialIndex = new SpatialHash(512);
    this.dropSpatialIndex = new SpatialHash(512);
    this.portalSpatialIndex = new SpatialHash(512);
    this.hazardSpatialIndex = new SpatialHash(512);

    this.dropSystem = new DropSystem();
    this.transferRequests = [];
    this.portalOverlapsByPlayer = new Map();

    for (const portal of config.initialPortals ?? []) {
      this.spawnPortal(portal);
    }
  }

  addPlayer(id: string, nickname: string = 'Player', x?: number, y?: number): Player {
    const player = new Player(id, x ?? this.config.spawnX, y ?? this.config.spawnY, nickname);
    this.players.set(id, player);
    this.add(player);
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
    this.rebuildSpatialIndexes();
  }

  removePlayer(id: string): Player | null {
    const player = this.players.get(id) ?? null;
    this.remove(id);
    this.players.delete(id);
    this.portalOverlapsByPlayer.delete(id);
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
    for (const player of this.players.values()) {
      if (player.safeZoneTimer > 0) return true;
    }
    return false;
  }

  update(dt: number): void {
    this.now = Date.now();

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
        }
      }
    }

    this.config.spawnSystem.update(
      this.now,
      this.players,
      this.getSpawnTargetEnemies(),
      (entity) => this.add(entity),
      (id) => this.remove(id)
    );

    const spawnSafeZoneActive = this.isSpawnSafeZoneActive();
    for (const enemy of this.getAllEnemiesMap().values()) {
      enemy.updateWithSafeZone(dt, this.players, spawnSafeZoneActive, {
        x: this.config.spawnX,
        y: this.config.spawnY,
        radius: SPAWN_SAFE_ZONE_RADIUS,
      });
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
        spawnFireLine: (x, y, dirX, dirY) => this.spawnFireFieldLine(x, y, dirX, dirY),
        safeZone: {
          x: this.config.spawnX,
          y: this.config.spawnY,
          radius: SPAWN_SAFE_ZONE_RADIUS,
        },
      }
    );

    const enemies = this.getAllEnemiesMap();

    resolvePlayerAttacks(this.players, enemies, this.bosses);
    resolvePlayerVsPlayerWithSafeZone(this.players, {
      x: this.config.spawnX,
      y: this.config.spawnY,
      radius: SPAWN_SAFE_ZONE_RADIUS,
    });
    resolveEnemyContactDamageWithSafeZone(enemies, this.players, {
      x: this.config.spawnX,
      y: this.config.spawnY,
      radius: SPAWN_SAFE_ZONE_RADIUS,
    });
    resolveBossContactDamageWithSafeZone(this.bosses, this.players, {
      x: this.config.spawnX,
      y: this.config.spawnY,
      radius: SPAWN_SAFE_ZONE_RADIUS,
    });

    this.updateHazards(dt);
    this.resolveHazardDamage();
    this.handleBossDeathPortals();

    this.dropSystem.update(this.players, enemies, this.drops);
    this.updatePortals();
    this.resolvePortalTransfers();
    this.rebuildSpatialIndexes();
  }

  consumeTransferRequests(): PortalTransferRequest[] {
    const out = this.transferRequests;
    this.transferRequests = [];
    return out;
  }

  queryPlayersInRadius(x: number, y: number, radius: number): Player[] {
    return this.playerSpatialIndex.queryRadius(x, y, radius);
  }

  queryEnemiesInRadius(x: number, y: number, radius: number): Blob[] {
    return this.enemySpatialIndex.queryRadius(x, y, radius);
  }

  queryBossesInRadius(x: number, y: number, radius: number): BossActorEntity[] {
    return this.bossSpatialIndex.queryRadius(x, y, radius);
  }

  queryDropsInRadius(x: number, y: number, radius: number): Drop[] {
    return this.dropSpatialIndex.queryRadius(x, y, radius);
  }

  queryPortalsInRadius(x: number, y: number, radius: number): Portal[] {
    return this.portalSpatialIndex.queryRadius(x, y, radius);
  }

  queryHazardsInRadius(x: number, y: number, radius: number): Hazard[] {
    return this.hazardSpatialIndex.queryRadius(x, y, radius);
  }

  spawnPortal(config: PortalConfig): Portal {
    const id = `portal_${nanoid(8)}`;
    const portal: Portal = {
      id,
      x: config.x,
      y: config.y,
      kind: config.kind,
      sourceBossId: config.sourceBossId,
      toInstanceId: config.toInstanceId,
      targetX: config.targetX,
      targetY: config.targetY,
      activeAtMs: this.now + (config.activationDelayMs ?? 0),
      expiresAtMs: config.durationMs !== undefined ? this.now + config.durationMs : null,
    };
    this.portals.set(id, portal);
    return portal;
  }

  private spawnFireFieldLine(x: number, y: number, dirX: number, dirY: number): void {
    for (let i = 1; i <= FIRE_FIELD_SEGMENTS; i++) {
      const hx = x + dirX * FIRE_FIELD_SPACING * i;
      const hy = y + dirY * FIRE_FIELD_SPACING * i;
      const id = `hazard_fire_${nanoid(8)}`;
      this.hazards.set(id, {
        id,
        x: hx,
        y: hy,
        kind: HAZARD_KINDS.FIRE_FIELD,
        ttlMs: FIRE_FIELD_DURATION_MS,
        damage: BLOB_DAMAGE,
        burningTicks: 3,
        hitPlayerIds: new Set<string>(),
      });
    }
  }

  private updateHazards(dt: number): void {
    for (const [hazardId, hazard] of this.hazards) {
      hazard.ttlMs -= dt;
      if (hazard.ttlMs <= 0) {
        this.hazards.delete(hazardId);
      }
    }
  }

  private resolveHazardDamage(): void {
    const hitRadiusSq = 24 * 24;
    for (const hazard of this.hazards.values()) {
      for (const player of this.players.values()) {
        if (player.state === 'dead') continue;
        if (hazard.hitPlayerIds.has(player.id)) continue;
        if (player.isProtected(this.config.spawnX, this.config.spawnY, SPAWN_SAFE_ZONE_RADIUS)) {
          continue;
        }

        const dx = player.x - hazard.x;
        const dy = player.y - hazard.y;
        if (dx * dx + dy * dy <= hitRadiusSq) {
          player.takeDamage(hazard.damage);
          player.applyBurning(hazard.burningTicks);
          hazard.hitPlayerIds.add(player.id);
        }
      }
    }
  }

  private handleBossDeathPortals(): void {
    if (!this.config.onBossDeathPortal) return;

    for (const [portalId, portal] of this.portals) {
      if (portal.kind !== this.config.onBossDeathPortal.kind) continue;
      if (!portal.sourceBossId) {
        this.portals.delete(portalId);
        continue;
      }
      const sourceBoss = this.bosses.get(portal.sourceBossId);
      if (!(sourceBoss instanceof BossGelehk) || sourceBoss.state !== 'dead') {
        this.portals.delete(portalId);
      }
    }

    for (const boss of this.bosses.values()) {
      if (!(boss instanceof BossGelehk)) continue;
      if (boss.state !== 'dead' || boss.deathHandled) continue;
      boss.deathHandled = true;
      this.spawnPortal({
        kind: this.config.onBossDeathPortal.kind,
        x: boss.x,
        y: boss.y,
        sourceBossId: boss.id,
        toInstanceId: this.config.onBossDeathPortal.toInstanceId,
        targetX: this.config.onBossDeathPortal.targetX,
        targetY: this.config.onBossDeathPortal.targetY,
        activationDelayMs: this.config.onBossDeathPortal.activationDelayMs,
        durationMs: this.config.onBossDeathPortal.durationMs,
      });
    }
  }

  private updatePortals(): void {
    for (const [portalId, portal] of this.portals) {
      if (portal.expiresAtMs !== null && this.now >= portal.expiresAtMs) {
        this.portals.delete(portalId);
      }
    }
  }

  private resolvePortalTransfers(): void {
    const portalRadiusSq = PORTAL_RADIUS * PORTAL_RADIUS;
    for (const player of this.players.values()) {
      const prevOverlaps = this.portalOverlapsByPlayer.get(player.id) ?? new Set<string>();
      const currOverlaps = new Set<string>();

      if (player.state !== 'dead') {
        for (const portal of this.portals.values()) {
          if (this.now < portal.activeAtMs) continue;
          const dx = player.x - portal.x;
          const dy = player.y - portal.y;
          const overlapping = dx * dx + dy * dy <= portalRadiusSq;
          if (!overlapping) continue;

          currOverlaps.add(portal.id);

          const justEntered = !prevOverlaps.has(portal.id);
          if (!justEntered) continue;
          if (player.phaseTransferCooldownMs > 0) continue;

          player.markPhaseTransferCooldown(PORTAL_TRANSFER_COOLDOWN_MS);
          this.transferRequests.push({
            playerId: player.id,
            toInstanceId: portal.toInstanceId,
            targetX: portal.targetX,
            targetY: portal.targetY,
          });
          break;
        }
      }

      this.portalOverlapsByPlayer.set(player.id, currOverlaps);
    }
  }

  private rebuildSpatialIndexes(): void {
    this.playerSpatialIndex.clear();
    this.enemySpatialIndex.clear();
    this.bossSpatialIndex.clear();
    this.dropSpatialIndex.clear();
    this.portalSpatialIndex.clear();
    this.hazardSpatialIndex.clear();

    for (const player of this.players.values()) {
      this.playerSpatialIndex.insert(player.x, player.y, player);
    }

    for (const blob of this.blobs.values()) {
      if (blob.state === 'dead') continue;
      this.enemySpatialIndex.insert(blob.x, blob.y, blob);
    }

    for (const slime of this.slimes.values()) {
      if (slime.state === 'dead') continue;
      this.enemySpatialIndex.insert(slime.x, slime.y, slime);
    }

    for (const boss of this.bosses.values()) {
      if (boss.state === 'dead') continue;
      this.bossSpatialIndex.insert(boss.x, boss.y, boss);
    }

    for (const drop of this.drops.values()) {
      this.dropSpatialIndex.insert(drop.x, drop.y, drop);
    }

    for (const portal of this.portals.values()) {
      this.portalSpatialIndex.insert(portal.x, portal.y, portal);
    }

    for (const hazard of this.hazards.values()) {
      this.hazardSpatialIndex.insert(hazard.x, hazard.y, hazard);
    }
  }

  private getSpawnTargetEnemies(): Map<string, Blob> {
    return this.config.enemyCollection === 'slimes' ? this.slimes : this.blobs;
  }

  private getAllEnemiesMap(): Map<string, Blob> {
    if (this.slimes.size === 0) return this.blobs;
    if (this.blobs.size === 0) return this.slimes;
    const merged = new Map<string, Blob>(this.blobs);
    for (const [id, slime] of this.slimes) {
      merged.set(id, slime);
    }
    return merged;
  }
}
