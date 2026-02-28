import {
  WORLD_SPAWN_SAFE_ZONE_RADIUS,
  WORLD_SPAWN_X,
  WORLD_SPAWN_Y,
} from '@gelehka/shared/constants';
import { Entity } from '../core/Entity.js';
import { SpatialHash } from '../core/SpatialHash.js';
import { World as EntityWorld } from '../core/World.js';
import { InputMessage } from '../network/MessageTypes.js';
import { BossGelehk, ICE_ZONE_SLOW } from '../entities/BossGelehk.js';
import {
  resolveEnemyContactDamage,
  resolvePlayerAttacks,
  resolvePlayerVsPlayer,
} from './Combat.js';
import { Player } from '../entities/Player.js';
import { Blob } from '../entities/Blob.js';
import { BossRegionSystem } from './systems/BossRegionSystem.js';
import { DropSystem } from './systems/DropSystem.js';
import { SpawnSystem } from './systems/SpawnSystem.js';

const PLAYER_RESPAWN_TIME = 3000;

export const PLAYER_SPAWN_X = WORLD_SPAWN_X;
export const PLAYER_SPAWN_Y = WORLD_SPAWN_Y;
export const SPAWN_SAFE_ZONE_RADIUS = WORLD_SPAWN_SAFE_ZONE_RADIUS;

export interface Drop {
  id: string;
  x: number;
  y: number;
  kind: 'heal';
}

export class World extends EntityWorld<Entity> {
  players: Map<string, Player>;
  blobs: Map<string, Blob>;
  bosses: Map<string, BossGelehk>;
  drops: Map<string, Drop>;

  private now: number;
  private readonly playerSpatialIndex: SpatialHash<Player>;
  private readonly enemySpatialIndex: SpatialHash<Blob>;
  private readonly bossSpatialIndex: SpatialHash<BossGelehk>;
  private readonly dropSpatialIndex: SpatialHash<Drop>;
  private readonly spawnSystem: SpawnSystem;
  private readonly bossRegionSystem: BossRegionSystem;
  private readonly dropSystem: DropSystem;

  constructor() {
    super();
    this.players = new Map();
    this.blobs = new Map();
    this.bosses = new Map();
    this.drops = new Map();
    this.now = Date.now();

    this.playerSpatialIndex = new SpatialHash(512);
    this.enemySpatialIndex = new SpatialHash(512);
    this.bossSpatialIndex = new SpatialHash(512);
    this.dropSpatialIndex = new SpatialHash(512);

    this.spawnSystem = new SpawnSystem();
    this.bossRegionSystem = new BossRegionSystem();
    this.dropSystem = new DropSystem();
  }

  addPlayer(id: string, nickname: string = 'Player'): Player {
    const player = new Player(id, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, nickname);
    this.players.set(id, player);
    this.add(player);
    this.rebuildSpatialIndexes();
    return player;
  }

  removePlayer(id: string): void {
    this.remove(id);
    this.players.delete(id);
    this.rebuildSpatialIndexes();
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
        if (boss.active && boss.state !== 'dead' && boss.isInIceZone(player.x, player.y)) {
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
          player.respawn(PLAYER_SPAWN_X, PLAYER_SPAWN_Y);
        }
      }
    }

    this.spawnSystem.update(
      this.now,
      this.players,
      this.blobs,
      (entity) => this.add(entity),
      (id) => this.remove(id)
    );

    const spawnSafeZoneActive = this.isSpawnSafeZoneActive();
    for (const blob of this.blobs.values()) {
      blob.update(dt, this.players, spawnSafeZoneActive);
      blob.tryRespawn(dt);
    }

    this.bossRegionSystem.update(
      this.now,
      this.players,
      this.bosses,
      (entity) => this.add(entity),
      (id) => this.remove(id),
      (x, y) => this.spawnSystem.spawnMinions(x, y, this.blobs, (entity) => this.add(entity)),
      dt
    );

    resolvePlayerAttacks(this.players, this.blobs, this.bosses);
    resolvePlayerVsPlayer(this.players);
    resolveEnemyContactDamage(this.blobs, this.players);

    this.dropSystem.update(this.players, this.blobs, this.drops);
    this.rebuildSpatialIndexes();
  }

  queryPlayersInRadius(x: number, y: number, radius: number): Player[] {
    return this.playerSpatialIndex.queryRadius(x, y, radius);
  }

  queryEnemiesInRadius(x: number, y: number, radius: number): Blob[] {
    return this.enemySpatialIndex.queryRadius(x, y, radius);
  }

  queryBossesInRadius(x: number, y: number, radius: number): BossGelehk[] {
    return this.bossSpatialIndex.queryRadius(x, y, radius);
  }

  queryDropsInRadius(x: number, y: number, radius: number): Drop[] {
    return this.dropSpatialIndex.queryRadius(x, y, radius);
  }

  private rebuildSpatialIndexes(): void {
    this.playerSpatialIndex.clear();
    this.enemySpatialIndex.clear();
    this.bossSpatialIndex.clear();
    this.dropSpatialIndex.clear();

    for (const player of this.players.values()) {
      this.playerSpatialIndex.insert(player.x, player.y, player);
    }

    for (const blob of this.blobs.values()) {
      if (blob.state === 'dead') continue;
      this.enemySpatialIndex.insert(blob.x, blob.y, blob);
    }

    for (const boss of this.bosses.values()) {
      if (boss.state === 'dead') continue;
      this.bossSpatialIndex.insert(boss.x, boss.y, boss);
    }

    for (const drop of this.drops.values()) {
      this.dropSpatialIndex.insert(drop.x, drop.y, drop);
    }
  }
}
