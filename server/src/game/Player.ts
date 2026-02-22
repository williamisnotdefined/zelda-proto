import { Direction, InputMessage, PlayerSnapshot, PlayerState } from '../network/MessageTypes.js';

export const PLAYER_SPEED = 150;
export const PLAYER_MAX_HP = 100;
export const PLAYER_DAMAGE = 10;
export const PLAYER_ATTACK_COOLDOWN = 400;
export const PLAYER_WIDTH = 28;
export const PLAYER_HEIGHT = 28;
export const PLAYER_ATTACK_RANGE = 32;
export const PLAYER_ATTACK_WIDTH = 24;
export const PVP_DAMAGE = 25;

export class Player {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  state: PlayerState;
  direction: Direction;
  attackCooldownTimer: number;
  attackStateTimer: number;
  attackHitIds: Set<string>;
  lastInput: InputMessage | null;
  respawnTimer: number;

  constructor(id: string, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.speed = PLAYER_SPEED;
    this.state = 'idle';
    this.direction = 'down';
    this.attackCooldownTimer = 0;
    this.attackStateTimer = 0;
    this.attackHitIds = new Set();
    this.lastInput = null;
    this.respawnTimer = 0;
  }

  applyInput(input: InputMessage): void {
    this.lastInput = input;
  }

  update(dt: number, speedMultiplier: number = 1): void {
    if (this.state === 'dead') {
      return;
    }

    if (this.attackCooldownTimer > 0) {
      this.attackCooldownTimer -= dt;
    }

    const input = this.lastInput;
    if (!input) {
      this.state = 'idle';
      return;
    }

    if (this.state === 'attacking') {
      this.attackStateTimer -= dt;
      if (this.attackStateTimer <= 0) {
        this.state = 'idle';
        this.attackStateTimer = 0;
        this.attackHitIds.clear();
      }
    }

    if (input.attack && this.attackCooldownTimer <= 0) {
      this.state = 'attacking';
      this.attackCooldownTimer = PLAYER_ATTACK_COOLDOWN;
      this.attackStateTimer = 300;
      this.attackHitIds.clear();
      return;
    }

    let dx = 0;
    let dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;

      this.x += dx * this.speed * speedMultiplier * (dt / 1000);
      this.y += dy * this.speed * speedMultiplier * (dt / 1000);

      this.state = 'moving';

      if (Math.abs(dx) > Math.abs(dy)) {
        this.direction = dx > 0 ? 'right' : 'left';
      } else {
        this.direction = dy > 0 ? 'down' : 'up';
      }
    } else if (this.state !== 'attacking') {
      this.state = 'idle';
    }
  }

  getAttackHitbox(): { x: number; y: number; w: number; h: number } | null {
    if (this.state !== 'attacking') return null;

    let hx = this.x;
    let hy = this.y;

    switch (this.direction) {
      case 'up':
        hy -= PLAYER_ATTACK_RANGE;
        break;
      case 'down':
        hy += PLAYER_ATTACK_RANGE;
        break;
      case 'left':
        hx -= PLAYER_ATTACK_RANGE;
        break;
      case 'right':
        hx += PLAYER_ATTACK_RANGE;
        break;
    }

    return {
      x: hx - PLAYER_ATTACK_WIDTH / 2,
      y: hy - PLAYER_ATTACK_WIDTH / 2,
      w: PLAYER_ATTACK_WIDTH,
      h: PLAYER_ATTACK_WIDTH,
    };
  }

  takeDamage(amount: number): void {
    if (this.state === 'dead') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
    }
  }

  respawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.hp = this.maxHp;
    this.state = 'idle';
    this.respawnTimer = 0;
  }

  toSnapshot(): PlayerSnapshot {
    return {
      id: this.id,
      x: Math.round(this.x),
      y: Math.round(this.y),
      hp: this.hp,
      maxHp: this.maxHp,
      state: this.state,
      direction: this.direction,
    };
  }
}
