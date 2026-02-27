import { SlimeSnapshot, SlimeState } from '../network/MessageTypes.js';
import { aabbOverlap, distanceSquared, entityAABB, isInSafeZone } from './Physics.js';
import { Player, PLAYER_HEIGHT, PLAYER_WIDTH } from './Player.js';
import { PLAYER_SPAWN_X, PLAYER_SPAWN_Y, SPAWN_SAFE_ZONE_RADIUS } from './World.js';

export const SLIME_HP = 30;
export const SLIME_SPEED = 60;
export const SLIME_DAMAGE = 5;
export const SLIME_AGGRO_RADIUS = 600;
export const SLIME_WIDTH = 48;
export const SLIME_HEIGHT = 48;
export const SLIME_CONTACT_WIDTH = 28;
export const SLIME_CONTACT_HEIGHT = 28;
export const SLIME_DAMAGE_COOLDOWN = 1000;
export const SLIME_RESPAWN_TIME = 10000;

export class Slime {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  aggroRadius: number;
  state: SlimeState;
  damageCooldown: number;
  spawnX: number;
  spawnY: number;
  respawnTimer: number;
  chunkKey: string;
  targetPlayerId: string | null;
  hasDropped: boolean;

  constructor(id: string, x: number, y: number, chunkKey: string = '') {
    this.id = id;
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.hp = SLIME_HP;
    this.maxHp = SLIME_HP;
    this.speed = SLIME_SPEED;
    this.damage = SLIME_DAMAGE;
    this.aggroRadius = SLIME_AGGRO_RADIUS;
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

    if (!this.targetPlayerId && nearestPlayer && nearestDistSq <= this.aggroRadius * this.aggroRadius) {
      this.targetPlayerId = nearestPlayer.id;
    }

    const target = this.targetPlayerId ? players.get(this.targetPlayerId) : null;

    if (target && target.state !== 'dead') {
      if (target.isProtected(PLAYER_SPAWN_X, PLAYER_SPAWN_Y, SPAWN_SAFE_ZONE_RADIUS)) {
        this.targetPlayerId = null;
        this.state = 'idle';
        return;
      }

      this.state = 'chasing';

      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0) {
        // Calculate next position
        let nextX = this.x + (dx / len) * this.speed * (dt / 1000);
        let nextY = this.y + (dy / len) * this.speed * (dt / 1000);

        const wouldEnterSafeZone =
          spawnSafeZoneActive &&
          isInSafeZone(nextX, nextY, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, SPAWN_SAFE_ZONE_RADIUS);

        if (wouldEnterSafeZone) {
          // Calculate tangent movement to go around safe zone
          const toSpawnX = PLAYER_SPAWN_X - this.x;
          const toSpawnY = PLAYER_SPAWN_Y - this.y;
          const perpX = -toSpawnY; // Perpendicular vector
          const perpY = toSpawnX;
          const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);

          if (perpLen > 0) {
            // Move tangent to safe zone
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
        const slimeBox = entityAABB(this.x, this.y, SLIME_WIDTH, SLIME_HEIGHT);
        const playerBox = entityAABB(target.x, target.y, PLAYER_WIDTH, PLAYER_HEIGHT);
        if (aabbOverlap(slimeBox, playerBox)) {
          this.state = 'attacking';
        }
      }
    } else {
      this.targetPlayerId = null;
      this.state = 'idle';
    }

    if (
      spawnSafeZoneActive &&
      isInSafeZone(this.x, this.y, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, SPAWN_SAFE_ZONE_RADIUS)
    ) {
      const dx = this.x - PLAYER_SPAWN_X;
      const dy = this.y - PLAYER_SPAWN_Y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        // Push slime to just outside the safe zone
        const pushDist = SPAWN_SAFE_ZONE_RADIUS + 10;
        this.x = PLAYER_SPAWN_X + (dx / dist) * pushDist;
        this.y = PLAYER_SPAWN_Y + (dy / dist) * pushDist;
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
      this.respawnTimer = SLIME_RESPAWN_TIME;
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

  toSnapshot(): SlimeSnapshot {
    return {
      id: this.id,
      x: Math.round(this.x),
      y: Math.round(this.y),
      hp: this.hp,
      maxHp: this.maxHp,
      state: this.state,
    };
  }
}
