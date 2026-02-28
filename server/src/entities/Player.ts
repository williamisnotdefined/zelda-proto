import { Direction, InputMessage, PlayerSnapshot, PlayerState } from '../network/MessageTypes.js';
import { Entity } from '../core/Entity.js';
import { State, StateMachine } from '../core/StateMachine.js';
import { isInSafeZone } from '../game/Physics.js';

export const PLAYER_SPEED = 150;
export const PLAYER_MAX_HP = 100;
export const PLAYER_DAMAGE = 10;
export const PLAYER_ATTACK_COOLDOWN = 400;
export const PLAYER_ATTACK_STATE_DURATION = 300;
export const PLAYER_ATTACK_SPEED_PENALTY = 0.5;
export const PLAYER_WIDTH = 48;
export const PLAYER_HEIGHT = 48;
export const PLAYER_ATTACK_RANGE_UP = 20;
export const PLAYER_ATTACK_RANGE_DOWN = 28;
export const PLAYER_ATTACK_RANGE_LEFT = 24;
export const PLAYER_ATTACK_RANGE_RIGHT = 24;
export const PLAYER_ATTACK_WIDTH = 36;
export const PVP_DAMAGE = 25;
export const SAFE_ZONE_DURATION = 3000;

export class Player extends Entity {
  nickname: string;
  hp: number;
  maxHp: number;
  speed: number;
  state: PlayerState;
  direction: Direction;
  attackCooldownTimer: number;
  attackStateTimer: number;
  attackHitIds: Set<string>;
  attackHitEnemyIds: Set<string>;
  lastInput: InputMessage | null;
  respawnTimer: number;
  playerKills: number;
  monsterKills: number;
  deaths: number;
  safeZoneTimer: number;
  lastProcessedInputSeq: number;
  private lastReceivedInputSeq: number;

  readonly stateMachine: StateMachine;
  private readonly fsmStates: Record<PlayerState, State>;

  constructor(id: string, x: number, y: number, nickname: string = 'Player') {
    super(id, x, y);
    this.nickname = nickname;
    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.speed = PLAYER_SPEED;
    this.state = 'idle';
    this.direction = 'down';
    this.attackCooldownTimer = 0;
    this.attackStateTimer = 0;
    this.attackHitIds = new Set();
    this.attackHitEnemyIds = new Set();
    this.lastInput = null;
    this.respawnTimer = 0;
    this.playerKills = 0;
    this.monsterKills = 0;
    this.deaths = 0;
    this.safeZoneTimer = SAFE_ZONE_DURATION;
    this.lastProcessedInputSeq = 0;
    this.lastReceivedInputSeq = -1;

    this.stateMachine = new StateMachine();
    this.fsmStates = {
      idle: this.createState('idle'),
      moving: this.createState('moving'),
      attacking: this.createState('attacking'),
      dead: this.createState('dead'),
    };
    this.stateMachine.set(this.fsmStates.idle);
  }

  applyInput(input: InputMessage): void {
    if (!Number.isSafeInteger(input.seq) || input.seq < 0) return;
    if (input.seq <= this.lastReceivedInputSeq) return;
    this.lastReceivedInputSeq = input.seq;
    this.lastInput = input;
  }

  update(dt: number, speedMultiplier: number = 1): void {
    this.stateMachine.update(dt);

    if (this.state === 'dead') {
      return;
    }

    if (this.attackCooldownTimer > 0) {
      this.attackCooldownTimer -= dt;
    }

    const input = this.lastInput;
    if (!input) {
      this.transitionTo('idle');
      return;
    }
    this.lastProcessedInputSeq = input.seq;

    if (this.state === 'attacking') {
      this.attackStateTimer -= dt;
      if (this.attackStateTimer <= 0) {
        this.transitionTo('idle');
        this.attackStateTimer = 0;
        this.attackHitIds.clear();
        this.attackHitEnemyIds.clear();
      }
    }

    if (input.attack && this.attackCooldownTimer <= 0) {
      this.transitionTo('attacking');
      this.attackCooldownTimer = PLAYER_ATTACK_COOLDOWN;
      this.attackStateTimer = PLAYER_ATTACK_STATE_DURATION;
      this.attackHitIds.clear();
      this.attackHitEnemyIds.clear();
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

      const attackPenalty = this.state === 'attacking' ? PLAYER_ATTACK_SPEED_PENALTY : 1;
      this.x += dx * this.speed * speedMultiplier * attackPenalty * (dt / 1000);
      this.y += dy * this.speed * speedMultiplier * attackPenalty * (dt / 1000);

      if (this.state !== 'attacking') {
        this.transitionTo('moving');
      }

      if (this.state !== 'attacking') {
        if (Math.abs(dx) > Math.abs(dy)) {
          this.direction = dx > 0 ? 'right' : 'left';
        } else {
          this.direction = dy > 0 ? 'down' : 'up';
        }
      }
    } else if (this.state !== 'attacking') {
      this.transitionTo('idle');
    }
  }

  getAttackHitbox(): { x: number; y: number; w: number; h: number } | null {
    if (this.state !== 'attacking') return null;

    let hx = this.x;
    let hy = this.y;

    switch (this.direction) {
      case 'up':
        hy -= PLAYER_ATTACK_RANGE_UP;
        break;
      case 'down':
        hy += PLAYER_ATTACK_RANGE_DOWN;
        break;
      case 'left':
        hx -= PLAYER_ATTACK_RANGE_LEFT;
        break;
      case 'right':
        hx += PLAYER_ATTACK_RANGE_RIGHT;
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
      this.transitionTo('dead');
      this.deaths++;
    }
  }

  isProtected(spawnX: number, spawnY: number, safeRadius: number): boolean {
    return this.safeZoneTimer > 0 && isInSafeZone(this.x, this.y, spawnX, spawnY, safeRadius);
  }

  respawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.hp = this.maxHp;
    this.transitionTo('idle');
    this.respawnTimer = 0;
    this.safeZoneTimer = SAFE_ZONE_DURATION;
  }

  toSnapshot(): PlayerSnapshot {
    return {
      id: this.id,
      nickname: this.nickname,
      x: Math.round(this.x),
      y: Math.round(this.y),
      hp: this.hp,
      maxHp: this.maxHp,
      state: this.state,
      direction: this.direction,
      playerKills: this.playerKills,
      monsterKills: this.monsterKills,
      deaths: this.deaths,
      lastProcessedInputSeq: this.lastProcessedInputSeq,
    };
  }

  private transitionTo(state: PlayerState): void {
    if (this.state === state) return;
    this.stateMachine.set(this.fsmStates[state]);
  }

  private createState(state: PlayerState): State {
    return {
      enter: () => {
        this.state = state;
      },
      update: () => {
        return;
      },
      exit: () => {
        return;
      },
    };
  }
}
