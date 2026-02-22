import {
  BossPhase,
  BossSnapshot,
  BossState,
  IceZone,
  AoeIndicator,
} from '../network/MessageTypes.js';
import { Player, PLAYER_WIDTH, PLAYER_HEIGHT } from './Player.js';
import { Slime } from './Slime.js';
import { aabbOverlap, distance, entityAABB } from './Physics.js';
import { nanoid } from 'nanoid';

export const BOSS_MAX_HP = 1000;
export const BOSS_SPEED = 80;
export const BOSS_WIDTH = 64;
export const BOSS_HEIGHT = 64;
export const BOSS_ACTIVATION_RADIUS = 500;
export const BOSS_RESPAWN_TIME = 15000;

const AOE_TELEGRAPH_TIME = 1000;
const AOE_DAMAGE = 30;
const AOE_RADIUS = 80;
const CHARGE_SPEED = 300;
const CHARGE_DAMAGE = 20;
const WAVE_DAMAGE = 15;
const PHASE1_COOLDOWN = 3000;
const PHASE2_COOLDOWN = 2500;
const PHASE3_COOLDOWN = 2000;
const ICE_ZONE_SLOW = 0.4;

export { ICE_ZONE_SLOW };

export class BossGelehk {
  id: string;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  hp: number;
  maxHp: number;
  speed: number;
  phase: BossPhase;
  state: BossState;
  active: boolean;
  respawnTimer: number;

  private attackTimer: number;
  private stateTimer: number;
  private targetPlayerId: string | null;
  private chargeTargetX: number;
  private chargeTargetY: number;
  private chargeDx: number;
  private chargeDy: number;
  private hasDealtChargeDamage: boolean;

  iceZones: IceZone[];
  aoeIndicators: AoeIndicator[];
  private waveRadius: number;
  private waveActive: boolean;

  constructor(id: string, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.hp = BOSS_MAX_HP;
    this.maxHp = BOSS_MAX_HP;
    this.speed = BOSS_SPEED;
    this.phase = 1;
    this.state = 'idle';
    this.active = false;
    this.respawnTimer = 0;

    this.attackTimer = 0;
    this.stateTimer = 0;
    this.targetPlayerId = null;
    this.chargeTargetX = 0;
    this.chargeTargetY = 0;
    this.chargeDx = 0;
    this.chargeDy = 0;
    this.hasDealtChargeDamage = false;

    this.iceZones = [];
    this.aoeIndicators = [];
    this.waveRadius = 0;
    this.waveActive = false;
  }

  reset(): void {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.hp = BOSS_MAX_HP;
    this.maxHp = BOSS_MAX_HP;
    this.speed = BOSS_SPEED;
    this.phase = 1;
    this.state = 'idle';
    this.active = false;
    this.respawnTimer = 0;
    this.attackTimer = 0;
    this.stateTimer = 0;
    this.targetPlayerId = null;
    this.chargeTargetX = 0;
    this.chargeTargetY = 0;
    this.chargeDx = 0;
    this.chargeDy = 0;
    this.hasDealtChargeDamage = false;
    this.iceZones = [];
    this.aoeIndicators = [];
    this.waveRadius = 0;
    this.waveActive = false;
  }

  tryRespawn(dt: number): boolean {
    if (this.state !== 'dead') return false;
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.reset();
      return true;
    }
    return false;
  }

  update(
    dt: number,
    players: Map<string, Player>,
    spawnMinions: (x: number, y: number, count: number) => void
  ): void {
    if (this.state === 'dead') return;

    if (!this.active) {
      for (const player of players.values()) {
        if (player.state === 'dead') continue;
        if (distance(this.x, this.y, player.x, player.y) < BOSS_ACTIVATION_RADIUS) {
          this.active = true;
          break;
        }
      }
      if (!this.active) return;
    }

    this.updatePhase();
    this.updateAoeIndicators(dt, players);
    this.updateWave(dt, players);

    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
    }

    switch (this.state) {
      case 'idle':
        this.handleIdle(dt, players, spawnMinions);
        break;
      case 'targeting':
        this.handleTargeting(dt, players);
        break;
      case 'jumping':
        this.handleJumping(dt);
        break;
      case 'charging':
        this.handleCharging(dt, players);
        break;
      case 'spawning_minions':
        this.handleSpawning(dt, spawnMinions);
        break;
      case 'enraged':
        this.handleEnraged(dt, players, spawnMinions);
        break;
    }
  }

  private updatePhase(): void {
    const hpPercent = this.hp / this.maxHp;
    if (hpPercent <= 0.2 && this.phase < 3) {
      this.phase = 3;
      this.state = 'enraged';
      this.stateTimer = 0;
      this.speed = BOSS_SPEED * 1.3;
      this.createIceZones();
    } else if (hpPercent <= 0.5 && this.phase < 2) {
      this.phase = 2;
      this.state = 'spawning_minions';
      this.stateTimer = 0;
      this.speed = BOSS_SPEED * 1.15;
    }
  }

  private handleIdle(
    _dt: number,
    players: Map<string, Player>,
    _spawnMinions: (x: number, y: number, count: number) => void
  ): void {
    if (this.attackTimer > 0) return;

    const nearest = this.findNearestPlayer(players);
    if (!nearest) return;

    switch (this.phase) {
      case 1:
        this.state = 'targeting';
        this.targetPlayerId = nearest.id;
        this.stateTimer = AOE_TELEGRAPH_TIME;
        this.aoeIndicators.push({
          x: nearest.x,
          y: nearest.y,
          radius: AOE_RADIUS,
          timer: AOE_TELEGRAPH_TIME,
        });
        break;
      case 2:
        this.state = 'targeting';
        this.targetPlayerId = nearest.id;
        this.stateTimer = 500;
        break;
      case 3:
        this.startWaveAttack();
        this.attackTimer = PHASE3_COOLDOWN;
        break;
    }
  }

  private handleTargeting(dt: number, players: Map<string, Player>): void {
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      if (this.phase === 1) {
        this.state = 'jumping';
        this.stateTimer = 400;
      } else {
        const target = this.targetPlayerId ? players.get(this.targetPlayerId) : null;
        if (target && target.state !== 'dead') {
          this.chargeTargetX = target.x;
          this.chargeTargetY = target.y;
          const dx = target.x - this.x;
          const dy = target.y - this.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          this.chargeDx = dx / len;
          this.chargeDy = dy / len;
          this.hasDealtChargeDamage = false;
          this.state = 'charging';
          this.stateTimer = 1500;
        } else {
          this.state = 'idle';
          this.attackTimer = PHASE2_COOLDOWN;
        }
      }
    }
  }

  private handleJumping(dt: number): void {
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.state = 'idle';
      this.attackTimer = PHASE1_COOLDOWN;
    }
  }

  private handleCharging(dt: number, players: Map<string, Player>): void {
    this.stateTimer -= dt;

    this.x += this.chargeDx * CHARGE_SPEED * (dt / 1000);
    this.y += this.chargeDy * CHARGE_SPEED * (dt / 1000);

    if (!this.hasDealtChargeDamage) {
      const bossBox = entityAABB(this.x, this.y, BOSS_WIDTH, BOSS_HEIGHT);
      for (const player of players.values()) {
        if (player.state === 'dead') continue;
        const playerBox = entityAABB(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
        if (aabbOverlap(bossBox, playerBox)) {
          player.takeDamage(CHARGE_DAMAGE);
          this.hasDealtChargeDamage = true;
          break;
        }
      }
    }

    const distToTarget = distance(this.x, this.y, this.chargeTargetX, this.chargeTargetY);
    if (this.stateTimer <= 0 || distToTarget < 20) {
      this.state = 'idle';
      this.attackTimer = PHASE2_COOLDOWN;
    }
  }

  private handleSpawning(
    dt: number,
    spawnMinions: (x: number, y: number, count: number) => void
  ): void {
    this.stateTimer += dt;
    if (this.stateTimer > 500) {
      spawnMinions(this.x, this.y, 3);
      this.state = 'idle';
      this.attackTimer = PHASE2_COOLDOWN;
    }
  }

  private handleEnraged(
    dt: number,
    _players: Map<string, Player>,
    _spawnMinions: (x: number, y: number, count: number) => void
  ): void {
    this.stateTimer += dt;
    if (this.stateTimer > 1000) {
      this.stateTimer = 0;
      this.state = 'idle';
    }
  }

  private updateAoeIndicators(dt: number, players: Map<string, Player>): void {
    for (let i = this.aoeIndicators.length - 1; i >= 0; i--) {
      const aoe = this.aoeIndicators[i];
      aoe.timer -= dt;
      if (aoe.timer <= 0) {
        for (const player of players.values()) {
          if (player.state === 'dead') continue;
          if (distance(player.x, player.y, aoe.x, aoe.y) < aoe.radius) {
            player.takeDamage(AOE_DAMAGE);
          }
        }
        this.aoeIndicators.splice(i, 1);
      }
    }
  }

  private startWaveAttack(): void {
    this.waveActive = true;
    this.waveRadius = 0;
  }

  private updateWave(dt: number, players: Map<string, Player>): void {
    if (!this.waveActive) return;

    const prevRadius = this.waveRadius;
    this.waveRadius += 200 * (dt / 1000);

    for (const player of players.values()) {
      if (player.state === 'dead') continue;
      const dist = distance(this.x, this.y, player.x, player.y);
      if (dist >= prevRadius && dist <= this.waveRadius) {
        player.takeDamage(WAVE_DAMAGE);
      }
    }

    if (this.waveRadius > 400) {
      this.waveActive = false;
      this.waveRadius = 0;
    }
  }

  private createIceZones(): void {
    this.iceZones = [
      { x: this.x - 120, y: this.y - 120, width: 100, height: 100 },
      { x: this.x + 40, y: this.y - 80, width: 120, height: 80 },
      { x: this.x - 80, y: this.y + 60, width: 140, height: 90 },
    ];
  }

  isInIceZone(px: number, py: number): boolean {
    for (const zone of this.iceZones) {
      if (
        px >= zone.x &&
        px <= zone.x + zone.width &&
        py >= zone.y &&
        py <= zone.y + zone.height
      ) {
        return true;
      }
    }
    return false;
  }

  private findNearestPlayer(players: Map<string, Player>): Player | null {
    let nearest: Player | null = null;
    let minDist = Infinity;

    for (const player of players.values()) {
      if (player.state === 'dead') continue;
      const dist = distance(this.x, this.y, player.x, player.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = player;
      }
    }

    return nearest;
  }

  takeDamage(amount: number): void {
    if (this.state === 'dead') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
      this.iceZones = [];
      this.aoeIndicators = [];
      this.waveActive = false;
      this.respawnTimer = BOSS_RESPAWN_TIME;
    }
  }

  toSnapshot(): BossSnapshot {
    return {
      id: this.id,
      x: Math.round(this.x),
      y: Math.round(this.y),
      hp: this.hp,
      maxHp: this.maxHp,
      state: this.state,
      phase: this.phase,
    };
  }
}
