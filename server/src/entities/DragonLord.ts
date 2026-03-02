import type { BossKind } from '@gelehka/shared';
import { BOSS_KINDS } from '@gelehka/shared';
import { Entity } from '../core/Entity.js';
import { distanceSquared } from '../game/Physics.js';
import type { BossSnapshot, BossState } from '../network/MessageTypes.js';
import { Player } from './Player.js';

export const DRAGON_LORD_MAX_HP = 125;
export const DRAGON_LORD_SPEED = 60;
export const DRAGON_LORD_DAMAGE = 5;
export const DRAGON_LORD_AGGRO_RADIUS = 700;
export const DRAGON_LORD_WIDTH = 96;
export const DRAGON_LORD_HEIGHT = 96;
export const DRAGON_LORD_CONTACT_RADIUS = 48;
export const DRAGON_LORD_CONTACT_DAMAGE_COOLDOWN = 1000;
export const DRAGON_LORD_RESPAWN_TIME = 15000;
export const DRAGON_LORD_ATTACK_COOLDOWN = 2500;
const DRAGON_AXIS_HYSTERESIS = 18;
const DRAGON_FIRE_DIAGONAL_RATIO_THRESHOLD = 0.82;
const SNAPSHOT_POSITION_PRECISION = 10;

function quantizePosition(value: number): number {
  return Math.round(value * SNAPSHOT_POSITION_PRECISION) / SNAPSHOT_POSITION_PRECISION;
}

export class DragonLord extends Entity {
  kind: BossKind;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  state: BossState;
  respawnTimer: number;
  spawnX: number;
  spawnY: number;
  attackCooldownMs: number;
  targetPlayerId: string | null;
  private moveAxis: 'x' | 'y';
  private readonly contactDamageCooldownByPlayer: Map<string, number>;

  constructor(id: string, x: number, y: number) {
    super(id, x, y);
    this.kind = BOSS_KINDS.DRAGON_LORD;
    this.hp = DRAGON_LORD_MAX_HP;
    this.maxHp = DRAGON_LORD_MAX_HP;
    this.speed = DRAGON_LORD_SPEED;
    this.damage = DRAGON_LORD_DAMAGE;
    this.state = 'idle';
    this.respawnTimer = 0;
    this.spawnX = x;
    this.spawnY = y;
    this.attackCooldownMs = 0;
    this.targetPlayerId = null;
    this.moveAxis = 'x';
    this.contactDamageCooldownByPlayer = new Map();
  }

  update(
    dt: number,
    players: Map<string, Player>,
    spawnFireLine: (x: number, y: number, dirX: number, dirY: number) => void
  ): void {
    if (this.state === 'dead') return;

    if (this.attackCooldownMs > 0) {
      this.attackCooldownMs -= dt;
    }

    for (const [playerId, cooldownMs] of this.contactDamageCooldownByPlayer) {
      const next = cooldownMs - dt;
      if (next <= 0) {
        this.contactDamageCooldownByPlayer.delete(playerId);
      } else {
        this.contactDamageCooldownByPlayer.set(playerId, next);
      }
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

    if (nearestPlayer && nearestDistSq <= DRAGON_LORD_AGGRO_RADIUS * DRAGON_LORD_AGGRO_RADIUS) {
      this.targetPlayerId = nearestPlayer.id;
      this.state = 'chasing';

      const dx = nearestPlayer.x - this.x;
      const dy = nearestPlayer.y - this.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      let moveX = 0;
      let moveY = 0;

      if (Math.abs(absDx - absDy) <= DRAGON_AXIS_HYSTERESIS) {
        if (this.moveAxis === 'x') {
          moveX = Math.sign(dx);
        } else {
          moveY = Math.sign(dy);
        }
      } else if (absDx > absDy) {
        this.moveAxis = 'x';
        moveX = Math.sign(dx);
      } else {
        this.moveAxis = 'y';
        moveY = Math.sign(dy);
      }

      this.x += moveX * this.speed * (dt / 1000);
      this.y += moveY * this.speed * (dt / 1000);

      if (this.attackCooldownMs <= 0) {
        this.state = 'attacking';
        this.attackCooldownMs = DRAGON_LORD_ATTACK_COOLDOWN;
        let fireDirX = 0;
        let fireDirY = 0;
        const absDxForFire = Math.abs(dx);
        const absDyForFire = Math.abs(dy);

        if (absDxForFire === 0 && absDyForFire === 0) {
          if (this.moveAxis === 'x') {
            fireDirX = 1;
            fireDirY = 0;
          } else {
            fireDirX = 0;
            fireDirY = 1;
          }
        } else if (absDxForFire === 0) {
          fireDirY = Math.sign(dy);
        } else if (absDyForFire === 0) {
          fireDirX = Math.sign(dx);
        } else {
          const smaller = Math.min(absDxForFire, absDyForFire);
          const larger = Math.max(absDxForFire, absDyForFire);
          const ratio = smaller / larger;

          if (ratio >= DRAGON_FIRE_DIAGONAL_RATIO_THRESHOLD) {
            fireDirX = Math.sign(dx);
            fireDirY = Math.sign(dy);
          } else if (absDxForFire > absDyForFire) {
            fireDirX = Math.sign(dx);
          } else {
            fireDirY = Math.sign(dy);
          }
        }

        if (fireDirX === 0 && fireDirY === 0) {
          if (this.moveAxis === 'x') {
            fireDirX = 1;
            fireDirY = 0;
          } else {
            fireDirX = 0;
            fireDirY = 1;
          }
        }
        spawnFireLine(this.x, this.y, fireDirX, fireDirY);
      }
    } else {
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
      this.respawnTimer = DRAGON_LORD_RESPAWN_TIME;
      this.targetPlayerId = null;
      this.attackCooldownMs = 0;
      this.contactDamageCooldownByPlayer.clear();
    }
  }

  canDealContactDamageTo(playerId: string): boolean {
    return !this.contactDamageCooldownByPlayer.has(playerId);
  }

  markContactDamageDealt(playerId: string): void {
    this.contactDamageCooldownByPlayer.set(playerId, DRAGON_LORD_CONTACT_DAMAGE_COOLDOWN);
  }

  tryRespawn(dt: number): boolean {
    if (this.state !== 'dead') return false;
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.x = this.spawnX;
      this.y = this.spawnY;
      this.hp = this.maxHp;
      this.state = 'idle';
      this.targetPlayerId = null;
      this.attackCooldownMs = 0;
      this.moveAxis = 'x';
      this.contactDamageCooldownByPlayer.clear();
      return true;
    }
    return false;
  }

  toSnapshot(): BossSnapshot {
    return {
      id: this.id,
      kind: this.kind,
      x: quantizePosition(this.x),
      y: quantizePosition(this.y),
      hp: this.hp,
      maxHp: this.maxHp,
      state: this.state,
      phase: 1,
    };
  }
}
