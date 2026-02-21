import { SlimeSnapshot, SlimeState } from '../network/MessageTypes.js';
import { Player, PLAYER_HEIGHT, PLAYER_WIDTH } from './Player.js';
import { aabbOverlap, distance, entityAABB } from './Physics.js';

export const SLIME_HP = 30;
export const SLIME_SPEED = 60;
export const SLIME_DAMAGE = 5;
export const SLIME_AGGRO_RADIUS = 150;
export const SLIME_WIDTH = 28;
export const SLIME_HEIGHT = 28;
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

  constructor(id: string, x: number, y: number) {
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
  }

  update(dt: number, players: Map<string, Player>): void {
    if (this.state === 'dead') return;

    if (this.damageCooldown > 0) {
      this.damageCooldown -= dt;
    }

    let nearestPlayer: Player | null = null;
    let nearestDist = Infinity;

    for (const player of players.values()) {
      if (player.state === 'dead') continue;
      const dist = distance(this.x, this.y, player.x, player.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestPlayer = player;
      }
    }

    if (nearestPlayer && nearestDist <= this.aggroRadius) {
      this.state = 'chasing';

      const dx = nearestPlayer.x - this.x;
      const dy = nearestPlayer.y - this.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        this.x += (dx / len) * this.speed * (dt / 1000);
        this.y += (dy / len) * this.speed * (dt / 1000);
      }

      const slimeBox = entityAABB(this.x, this.y, SLIME_WIDTH, SLIME_HEIGHT);
      const playerBox = entityAABB(nearestPlayer.x, nearestPlayer.y, PLAYER_WIDTH, PLAYER_HEIGHT);

      if (aabbOverlap(slimeBox, playerBox) && this.damageCooldown <= 0) {
        this.state = 'attacking';
        nearestPlayer.takeDamage(this.damage);
        this.damageCooldown = SLIME_DAMAGE_COOLDOWN;
      }
    } else {
      this.state = 'idle';
    }
  }

  takeDamage(amount: number): void {
    if (this.state === 'dead') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
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
