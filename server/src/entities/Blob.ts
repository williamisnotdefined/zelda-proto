import { ENEMY_KINDS } from '@gelehka/shared';
import {
  WORLD_SPAWN_SAFE_ZONE_RADIUS,
  WORLD_SPAWN_X,
  WORLD_SPAWN_Y,
} from '@gelehka/shared/constants';
import type { DropKind, EnemyKind, PacmanGhostVariant } from '@gelehka/shared';
import type { BlobState, EnemySnapshot } from '../network/MessageTypes.js';
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
export const BLOB_CONTACT_RADIUS = 14;
export const BLOB_DAMAGE_COOLDOWN = 1000;
export const BLOB_RESPAWN_TIME = 10000;
const SNAPSHOT_POSITION_PRECISION = 10;

export interface EnemyConfig {
  kind: EnemyKind;
  maxHp: number;
  speed: number;
  damage: number;
  aggroRadius: number;
  contactRadius: number;
  respawnTimeMs: number;
  respawnEnabled?: boolean;
}

type FindNearestPlayerInRadius = (
  x: number,
  y: number,
  radius: number,
  predicate?: (player: Player) => boolean
) => Player | null;

const TARGET_REACQUIRE_INTERVAL_MS = 120;

export const BLOB_CONFIG: EnemyConfig = {
  kind: ENEMY_KINDS.BLOB,
  maxHp: BLOB_HP,
  speed: BLOB_SPEED,
  damage: BLOB_DAMAGE,
  aggroRadius: BLOB_AGGRO_RADIUS,
  contactRadius: BLOB_CONTACT_RADIUS,
  respawnTimeMs: BLOB_RESPAWN_TIME,
};

function quantizePosition(value: number): number {
  return Math.round(value * SNAPSHOT_POSITION_PRECISION) / SNAPSHOT_POSITION_PRECISION;
}

function createTargetReacquireOffset(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }

  return Math.abs(hash) % TARGET_REACQUIRE_INTERVAL_MS;
}

export class Blob extends Entity {
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  aggroRadius: number;
  contactRadius: number;
  state: BlobState;
  damageCooldown: number;
  spawnX: number;
  spawnY: number;
  respawnTimer: number;
  chunkKey: string;
  targetPlayerId: string | null;
  hasDropped: boolean;
  dropKind: DropKind;
  respawnEnabled: boolean;
  variant?: PacmanGhostVariant;
  private readonly respawnTimeMs: number;
  private targetReacquireTimerMs: number;

  constructor(
    id: string,
    x: number,
    y: number,
    chunkKey: string = '',
    config: EnemyConfig = BLOB_CONFIG,
    dropKind: DropKind = 'heart_small'
  ) {
    super(id, x, y);
    this.kind = config.kind;
    this.spawnX = x;
    this.spawnY = y;
    this.hp = config.maxHp;
    this.maxHp = config.maxHp;
    this.speed = config.speed;
    this.damage = config.damage;
    this.aggroRadius = config.aggroRadius;
    this.contactRadius = config.contactRadius;
    this.state = 'idle';
    this.damageCooldown = 0;
    this.respawnTimer = 0;
    this.chunkKey = chunkKey;
    this.targetPlayerId = null;
    this.hasDropped = false;
    this.dropKind = dropKind;
    this.respawnTimeMs = config.respawnTimeMs;
    this.respawnEnabled = config.respawnEnabled ?? true;
    this.targetReacquireTimerMs = createTargetReacquireOffset(id);
  }

  update(dt: number, players: Map<string, Player>, spawnSafeZoneActive: boolean = false): void {
    this.updateWithSafeZone(dt, players, spawnSafeZoneActive, {
      x: WORLD_SPAWN_X,
      y: WORLD_SPAWN_Y,
      radius: WORLD_SPAWN_SAFE_ZONE_RADIUS,
    });
  }

  updateWithSafeZone(
    dt: number,
    players: Map<string, Player>,
    spawnSafeZoneActive: boolean,
    safeZone: { x: number; y: number; radius: number },
    findNearestPlayerInRadius?: FindNearestPlayerInRadius
  ): void {
    if (this.state === 'dead') return;

    if (this.damageCooldown > 0) {
      this.damageCooldown -= dt;
    }

    if (this.targetReacquireTimerMs > 0) {
      this.targetReacquireTimerMs -= dt;
    }

    let target = this.targetPlayerId ? (players.get(this.targetPlayerId) ?? null) : null;

    if (
      target &&
      (target.state === 'dead' || target.isProtected(safeZone.x, safeZone.y, safeZone.radius))
    ) {
      this.targetPlayerId = null;
      this.targetReacquireTimerMs = 0;
      target = null;
    }

    if (!target || this.targetReacquireTimerMs <= 0) {
      const nearestPlayer = this.findNearestAggroPlayer(
        players,
        safeZone,
        findNearestPlayerInRadius
      );
      if (nearestPlayer) {
        this.targetPlayerId = nearestPlayer.id;
        target = nearestPlayer;
      } else if (!target) {
        this.targetPlayerId = null;
      }
      this.targetReacquireTimerMs = TARGET_REACQUIRE_INTERVAL_MS;
    }

    if (target && target.state !== 'dead') {
      this.state = 'chasing';

      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0) {
        let nextX = this.x + (dx / len) * this.speed * (dt / 1000);
        let nextY = this.y + (dy / len) * this.speed * (dt / 1000);

        const wouldEnterSafeZone =
          spawnSafeZoneActive &&
          isInSafeZone(nextX, nextY, safeZone.x, safeZone.y, safeZone.radius);

        if (wouldEnterSafeZone) {
          const toSpawnX = safeZone.x - this.x;
          const toSpawnY = safeZone.y - this.y;
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
      isInSafeZone(this.x, this.y, safeZone.x, safeZone.y, safeZone.radius)
    ) {
      const dx = this.x - safeZone.x;
      const dy = this.y - safeZone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const pushDist = safeZone.radius + 10;
        this.x = safeZone.x + (dx / dist) * pushDist;
        this.y = safeZone.y + (dy / dist) * pushDist;
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
      this.respawnTimer = this.respawnTimeMs;
      this.targetReacquireTimerMs = 0;
    }
  }

  tryRespawn(dt: number): boolean {
    if (this.state !== 'dead' || !this.respawnEnabled) return false;
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.x = this.spawnX;
      this.y = this.spawnY;
      this.hp = this.maxHp;
      this.state = 'idle';
      this.damageCooldown = 0;
      this.targetPlayerId = null;
      this.hasDropped = false;
      this.targetReacquireTimerMs = 0;
      return true;
    }
    return false;
  }

  private findNearestAggroPlayer(
    players: Map<string, Player>,
    safeZone: { x: number; y: number; radius: number },
    findNearestPlayerInRadius?: FindNearestPlayerInRadius
  ): Player | null {
    const predicate = (player: Player) =>
      player.state !== 'dead' && !player.isProtected(safeZone.x, safeZone.y, safeZone.radius);

    if (findNearestPlayerInRadius) {
      return findNearestPlayerInRadius(this.x, this.y, this.aggroRadius, predicate);
    }

    let nearestPlayer: Player | null = null;
    let nearestDistSq = this.aggroRadius * this.aggroRadius;

    for (const player of players.values()) {
      if (!predicate(player)) continue;
      const dSq = distanceSquared(this.x, this.y, player.x, player.y);
      if (dSq <= nearestDistSq) {
        nearestDistSq = dSq;
        nearestPlayer = player;
      }
    }

    return nearestPlayer;
  }

  toSnapshot(): EnemySnapshot {
    const snapshot: EnemySnapshot = {
      id: this.id,
      kind: this.kind,
      x: quantizePosition(this.x),
      y: quantizePosition(this.y),
      hp: this.hp,
      maxHp: this.maxHp,
      state: this.state,
    };

    if (this.variant) {
      snapshot.variant = this.variant;
    }

    return snapshot;
  }
}
