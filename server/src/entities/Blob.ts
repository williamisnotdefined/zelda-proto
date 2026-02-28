import {
  WORLD_SPAWN_SAFE_ZONE_RADIUS,
  WORLD_SPAWN_X,
  WORLD_SPAWN_Y,
} from '@gelehka/shared/constants';
import { BlobSnapshot, BlobState } from '../network/MessageTypes.js';
import { aabbOverlap, distanceSquared, entityAABB, isInSafeZone } from '../game/Physics.js';
import { Player, PLAYER_HEIGHT, PLAYER_WIDTH } from './Player.js';
import { Entity } from '../core/Entity.js';

export const BLOB_HP = 30;
export const BLOB_SPEED = 60;
export const BLOB_DAMAGE = 5;
export const BLOB_AGGRO_RADIUS = 600;
export const BLOB_WIDTH = 48;
export const BLOB_HEIGHT = 48;
export const BLOB_CONTACT_WIDTH = 28;
export const BLOB_CONTACT_HEIGHT = 28;
export const BLOB_DAMAGE_COOLDOWN = 1000;
export const BLOB_RESPAWN_TIME = 10000;
const SNAPSHOT_POSITION_PRECISION = 10;

function quantizePosition(value: number): number {
  return Math.round(value * SNAPSHOT_POSITION_PRECISION) / SNAPSHOT_POSITION_PRECISION;
}

export class Blob extends Entity {
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  aggroRadius: number;
  state: BlobState;
  damageCooldown: number;
  spawnX: number;
  spawnY: number;
  respawnTimer: number;
  chunkKey: string;
  targetPlayerId: string | null;
  hasDropped: boolean;

  constructor(id: string, x: number, y: number, chunkKey: string = '') {
    super(id, x, y);
    this.spawnX = x;
    this.spawnY = y;
    this.hp = BLOB_HP;
    this.maxHp = BLOB_HP;
    this.speed = BLOB_SPEED;
    this.damage = BLOB_DAMAGE;
    this.aggroRadius = BLOB_AGGRO_RADIUS;
    this.state = 'idle';
    this.damageCooldown = 0;
    this.respawnTimer = 0;
    this.chunkKey = chunkKey;
    this.targetPlayerId = null;
    this.hasDropped = false;
  }

  update(dt: number, players: Map<string, Player>, spawnSafeZoneActive: boolean = false): void {
    if (this.state === 'dead') return;

    if (this.damageCooldown > 0) {
      this.damageCooldown -= dt;
    }

    let nearestPlayer: Player | null = null;
    let nearestDistSq = Infinity;

    for (const player of players.values()) {
      if (player.state === 'dead') continue;
      const dSq = distanceSquared(this.x, this.y, player.x, player.y);
      if (dSq < nearestDistSq) {
        nearestDistSq = dSq;
        nearestPlayer = player;
      }
    }

    if (this.targetPlayerId) {
      const currentTarget = players.get(this.targetPlayerId);

      if (!currentTarget || currentTarget.state === 'dead') {
        this.targetPlayerId = null;
      } else if (nearestPlayer && nearestPlayer.id !== this.targetPlayerId) {
        this.targetPlayerId = nearestPlayer.id;
      }
    }

    if (
      !this.targetPlayerId &&
      nearestPlayer &&
      nearestDistSq <= this.aggroRadius * this.aggroRadius
    ) {
      this.targetPlayerId = nearestPlayer.id;
    }

    const target = this.targetPlayerId ? players.get(this.targetPlayerId) : null;

    if (target && target.state !== 'dead') {
      if (target.isProtected(WORLD_SPAWN_X, WORLD_SPAWN_Y, WORLD_SPAWN_SAFE_ZONE_RADIUS)) {
        this.targetPlayerId = null;
        this.state = 'idle';
        return;
      }

      this.state = 'chasing';

      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0) {
        let nextX = this.x + (dx / len) * this.speed * (dt / 1000);
        let nextY = this.y + (dy / len) * this.speed * (dt / 1000);

        const wouldEnterSafeZone =
          spawnSafeZoneActive &&
          isInSafeZone(nextX, nextY, WORLD_SPAWN_X, WORLD_SPAWN_Y, WORLD_SPAWN_SAFE_ZONE_RADIUS);

        if (wouldEnterSafeZone) {
          const toSpawnX = WORLD_SPAWN_X - this.x;
          const toSpawnY = WORLD_SPAWN_Y - this.y;
          const perpX = -toSpawnY;
          const perpY = toSpawnX;
          const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);

          if (perpLen > 0) {
            const tangentX = perpX / perpLen;
            const tangentY = perpY / perpLen;
            nextX = this.x + tangentX * this.speed * (dt / 1000);
            nextY = this.y + tangentY * this.speed * (dt / 1000);
          }
        }

        this.x = nextX;
        this.y = nextY;
      }

      if (this.damageCooldown <= 0) {
        const blobBox = entityAABB(this.x, this.y, BLOB_WIDTH, BLOB_HEIGHT);
        const playerBox = entityAABB(target.x, target.y, PLAYER_WIDTH, PLAYER_HEIGHT);
        if (aabbOverlap(blobBox, playerBox)) {
          this.state = 'attacking';
        }
      }
    } else {
      this.targetPlayerId = null;
      this.state = 'idle';
    }

    if (
      spawnSafeZoneActive &&
      isInSafeZone(this.x, this.y, WORLD_SPAWN_X, WORLD_SPAWN_Y, WORLD_SPAWN_SAFE_ZONE_RADIUS)
    ) {
      const dx = this.x - WORLD_SPAWN_X;
      const dy = this.y - WORLD_SPAWN_Y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const pushDist = WORLD_SPAWN_SAFE_ZONE_RADIUS + 10;
        this.x = WORLD_SPAWN_X + (dx / dist) * pushDist;
        this.y = WORLD_SPAWN_Y + (dy / dist) * pushDist;
      }
      this.targetPlayerId = null;
      this.state = 'idle';
    }
  }

  takeDamage(amount: number): void {
    if (this.state === 'dead') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
      this.targetPlayerId = null;
      this.respawnTimer = BLOB_RESPAWN_TIME;
    }
  }

  tryRespawn(dt: number): boolean {
    if (this.state !== 'dead') return false;
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.x = this.spawnX;
      this.y = this.spawnY;
      this.hp = this.maxHp;
      this.state = 'idle';
      this.damageCooldown = 0;
      this.targetPlayerId = null;
      this.hasDropped = false;
      return true;
    }
    return false;
  }

  toSnapshot(): BlobSnapshot {
    return {
      id: this.id,
      x: quantizePosition(this.x),
      y: quantizePosition(this.y),
      hp: this.hp,
      maxHp: this.maxHp,
      state: this.state,
    };
  }
}
