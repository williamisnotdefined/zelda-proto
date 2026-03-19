import { BOSS_KINDS } from '@gelehka/shared';
import {
  WORLD_SPAWN_SAFE_ZONE_RADIUS,
  WORLD_SPAWN_X,
  WORLD_SPAWN_Y,
} from '@gelehka/shared/constants';
import { Entity } from '../core/Entity.js';
import {
  circleAabbOverlap,
  distance,
  distanceSquared,
  entityAABB,
  entityCircle,
} from '../game/Physics.js';
import type {
  AoeIndicator,
  BossKind,
  BossPhase,
  BossSnapshot,
  BossState,
  BossWaveIndicator,
  BossWaveState,
  IceZone,
} from '../network/MessageTypes.js';
import { Player, PLAYER_HEIGHT, PLAYER_WIDTH } from './Player.js';

export const BOSS_MAX_HP = 80;
export const BOSS_SPEED = 80;
export const BOSS_WIDTH = 72;
export const BOSS_HEIGHT = 72;
export const BOSS_CONTACT_RADIUS = 36;
export const BOSS_ACTIVATION_RADIUS = 500;
export const BOSS_RESPAWN_TIME = 15000;

const AOE_TELEGRAPH_TIME = 1000;
const AOE_HIT_FLASH_TIME = 120;
const AOE_RADIUS = 80;
const AOE_ATTACK_RANGE = 400;
const CHARGE_SPEED = 300;
const CHARGE_DAMAGE = 20;
const CHARGE_DURATION = 1500;
const CHARGE_STOP_DIST = 20;
const WAVE_DAMAGE = 15;
const WAVE_MAX_RADIUS = 400;
const WAVE_SPEED = 200;
const WAVE_WINDUP_DURATION = 450;
const WAVE_WINDUP_RADIUS = 44;
const WAVE_TRAIL_FIRST_RADIUS = 160;
const WAVE_TRAIL_RADIUS_STEP = 160;
const WAVE_TRAIL_POINT_COUNT = 3;
const PHASE1_COOLDOWN = 3000;
const PHASE2_COOLDOWN = 2500;
const WAVE_EXPANSION_DURATION = (WAVE_MAX_RADIUS / WAVE_SPEED) * 1000;
const PHASE3_COOLDOWN = WAVE_WINDUP_DURATION + WAVE_EXPANSION_DURATION + 200;
const TARGETING_DURATION = 500;
const JUMPING_DURATION = 400;
const SPAWNING_DURATION = 500;
const ENRAGED_TRANSITION_TIME = 1000;
const PHASE2_SPEED_MULT = 1.15;
const PHASE3_SPEED_MULT = 1.3;
const ICE_ZONE_SLOW = 0.4;
const SNAPSHOT_POSITION_PRECISION = 10;

type FindNearestPlayerInRadius = (
  x: number,
  y: number,
  radius: number,
  predicate?: (player: Player) => boolean
) => Player | null;
type ForEachPlayerInRadius = (
  x: number,
  y: number,
  radius: number,
  callback: (player: Player) => void
) => void;

const PLAYER_HALF_DIAGONAL = Math.hypot(PLAYER_WIDTH / 2, PLAYER_HEIGHT / 2);
const CHARGE_CONTACT_QUERY_RADIUS = BOSS_CONTACT_RADIUS + PLAYER_HALF_DIAGONAL;

function quantizePosition(value: number): number {
  return Math.round(value * SNAPSHOT_POSITION_PRECISION) / SNAPSHOT_POSITION_PRECISION;
}

export { ICE_ZONE_SLOW };

export class BossGelehk extends Entity {
  kind: BossKind;
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
  private waveState: BossWaveState | null;
  private waveTrailNextRadius: number;
  deathHandled: boolean;
  private safeZoneX: number;
  private safeZoneY: number;
  private safeZoneRadius: number;

  constructor(id: string, x: number, y: number) {
    super(id, x, y);
    this.kind = BOSS_KINDS.GELEHK;
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
    this.waveState = null;
    this.waveTrailNextRadius = WAVE_TRAIL_FIRST_RADIUS;
    this.deathHandled = false;
    this.safeZoneX = WORLD_SPAWN_X;
    this.safeZoneY = WORLD_SPAWN_Y;
    this.safeZoneRadius = WORLD_SPAWN_SAFE_ZONE_RADIUS;
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
    this.waveState = null;
    this.waveTrailNextRadius = WAVE_TRAIL_FIRST_RADIUS;
    this.deathHandled = false;
    this.safeZoneX = WORLD_SPAWN_X;
    this.safeZoneY = WORLD_SPAWN_Y;
    this.safeZoneRadius = WORLD_SPAWN_SAFE_ZONE_RADIUS;
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
    spawnMinions: (x: number, y: number, count: number) => void,
    spawnPurpleField: (x: number, y: number) => void,
    safeZone?: { x: number; y: number; radius: number },
    findNearestPlayerInRadius?: FindNearestPlayerInRadius,
    forEachPlayerInRadius?: ForEachPlayerInRadius
  ): void {
    if (this.state === 'dead') return;

    if (safeZone) {
      this.safeZoneX = safeZone.x;
      this.safeZoneY = safeZone.y;
      this.safeZoneRadius = safeZone.radius;
    }

    if (!this.active) {
      this.active =
        this.findNearestPlayer(players, BOSS_ACTIVATION_RADIUS, findNearestPlayerInRadius) !== null;
      if (!this.active) return;
    }

    this.updatePhase();
    this.updateAoeIndicators(dt, spawnPurpleField);
    this.updateWave(dt, players, spawnPurpleField, forEachPlayerInRadius);

    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
    }

    switch (this.state) {
      case 'idle':
        this.handleIdle(players, findNearestPlayerInRadius);
        break;
      case 'targeting':
        this.handleTargeting(dt, players);
        break;
      case 'jumping':
        this.handleJumping(dt);
        break;
      case 'charging':
        this.handleCharging(dt, players, forEachPlayerInRadius);
        break;
      case 'wave_windup':
        this.handleWaveWindup(dt);
        break;
      case 'spawning_minions':
        this.handleSpawning(dt, spawnMinions);
        break;
      case 'enraged':
        this.handleEnraged(dt);
        break;
    }
  }

  private updatePhase(): void {
    const hpPercent = this.hp / this.maxHp;
    if (hpPercent <= 0.2 && this.phase < 3) {
      this.phase = 3;
      this.state = 'enraged';
      this.stateTimer = 0;
      this.speed = BOSS_SPEED * PHASE3_SPEED_MULT;
      this.createIceZones();
    } else if (hpPercent <= 0.5 && this.phase < 2) {
      this.phase = 2;
      this.state = 'spawning_minions';
      this.stateTimer = 0;
      this.speed = BOSS_SPEED * PHASE2_SPEED_MULT;
    }
  }

  private handleIdle(
    players: Map<string, Player>,
    findNearestPlayerInRadius?: FindNearestPlayerInRadius
  ): void {
    if (this.attackTimer > 0) return;

    const nearest = this.findNearestPlayer(
      players,
      BOSS_ACTIVATION_RADIUS,
      findNearestPlayerInRadius
    );
    if (!nearest) return;

    switch (this.phase) {
      case 1: {
        if (
          distanceSquared(this.x, this.y, nearest.x, nearest.y) >
          AOE_ATTACK_RANGE * AOE_ATTACK_RANGE
        )
          return;
        this.state = 'targeting';
        this.targetPlayerId = nearest.id;
        this.stateTimer = AOE_TELEGRAPH_TIME;
        this.aoeIndicators.push({
          ownerId: this.id,
          x: nearest.x,
          y: nearest.y,
          radius: AOE_RADIUS,
          timer: AOE_TELEGRAPH_TIME,
          hit: false,
        });
        break;
      }
      case 2:
        this.state = 'targeting';
        this.targetPlayerId = nearest.id;
        this.stateTimer = TARGETING_DURATION;
        break;
      case 3:
        if (this.waveState || this.waveActive) {
          return;
        }
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
        this.stateTimer = JUMPING_DURATION;
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
          this.stateTimer = CHARGE_DURATION;
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

  private handleCharging(
    dt: number,
    players: Map<string, Player>,
    forEachPlayerInRadius?: ForEachPlayerInRadius
  ): void {
    this.stateTimer -= dt;

    this.x += this.chargeDx * CHARGE_SPEED * (dt / 1000);
    this.y += this.chargeDy * CHARGE_SPEED * (dt / 1000);

    if (!this.hasDealtChargeDamage) {
      const bossCircle = entityCircle(this.x, this.y, BOSS_CONTACT_RADIUS);
      this.forEachPlayerCandidate(
        players,
        this.x,
        this.y,
        CHARGE_CONTACT_QUERY_RADIUS,
        (player) => {
          if (this.hasDealtChargeDamage) return;
          if (player.state === 'dead') return;
          if (player.isProtected(this.safeZoneX, this.safeZoneY, this.safeZoneRadius)) return;
          const playerBox = entityAABB(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
          if (circleAabbOverlap(bossCircle, playerBox)) {
            player.takeDamage(CHARGE_DAMAGE);
            this.hasDealtChargeDamage = true;
          }
        },
        forEachPlayerInRadius
      );
    }

    const distToTargetSq = distanceSquared(this.x, this.y, this.chargeTargetX, this.chargeTargetY);
    if (this.stateTimer <= 0 || distToTargetSq < CHARGE_STOP_DIST * CHARGE_STOP_DIST) {
      this.state = 'idle';
      this.attackTimer = PHASE2_COOLDOWN;
    }
  }

  private handleSpawning(
    dt: number,
    spawnMinions: (x: number, y: number, count: number) => void
  ): void {
    this.stateTimer += dt;
    if (this.stateTimer > SPAWNING_DURATION) {
      spawnMinions(this.x, this.y, 3);
      this.state = 'idle';
      this.attackTimer = PHASE2_COOLDOWN;
    }
  }

  private handleEnraged(dt: number): void {
    this.stateTimer += dt;
    if (this.stateTimer > ENRAGED_TRANSITION_TIME) {
      this.stateTimer = 0;
      this.state = 'idle';
    }
  }

  private updateAoeIndicators(dt: number, spawnPurpleField: (x: number, y: number) => void): void {
    for (let i = this.aoeIndicators.length - 1; i >= 0; i--) {
      const aoe = this.aoeIndicators[i];
      aoe.timer -= dt;

      if (!aoe.hit && aoe.timer <= 0) {
        spawnPurpleField(aoe.x, aoe.y);
        aoe.hit = true;
        aoe.timer = AOE_HIT_FLASH_TIME;
      } else if (aoe.hit && aoe.timer <= 0) {
        this.aoeIndicators.splice(i, 1);
      }
    }
  }

  private startWaveAttack(): void {
    this.waveState = 'windup';
    this.waveActive = false;
    this.waveRadius = WAVE_WINDUP_RADIUS;
    this.waveTrailNextRadius = WAVE_TRAIL_FIRST_RADIUS;
    this.state = 'wave_windup';
    this.stateTimer = WAVE_WINDUP_DURATION;
  }

  private handleWaveWindup(dt: number): void {
    this.stateTimer -= dt;
    if (this.stateTimer > 0) {
      return;
    }

    this.state = 'idle';
    this.waveState = 'expanding';
    this.waveActive = true;
    this.waveRadius = 0;
    this.waveTrailNextRadius = WAVE_TRAIL_FIRST_RADIUS;
  }

  private updateWave(
    dt: number,
    players: Map<string, Player>,
    spawnPurpleField: (x: number, y: number) => void,
    forEachPlayerInRadius?: ForEachPlayerInRadius
  ): void {
    if (!this.waveActive) return;

    const prevRadius = this.waveRadius;
    this.waveRadius += WAVE_SPEED * (dt / 1000);
    this.spawnWaveTrail(prevRadius, spawnPurpleField);

    this.forEachPlayerCandidate(
      players,
      this.x,
      this.y,
      this.waveRadius,
      (player) => {
        if (player.state === 'dead') return;
        if (player.isProtected(this.safeZoneX, this.safeZoneY, this.safeZoneRadius)) return;
        const dist = distance(this.x, this.y, player.x, player.y);
        if (dist >= prevRadius && dist <= this.waveRadius) {
          player.takeDamage(WAVE_DAMAGE);
        }
      },
      forEachPlayerInRadius
    );

    if (this.waveRadius > WAVE_MAX_RADIUS) {
      this.waveActive = false;
      this.waveRadius = 0;
      this.waveState = null;
    }
  }

  private spawnWaveTrail(
    prevRadius: number,
    spawnPurpleField: (x: number, y: number) => void
  ): void {
    while (this.waveTrailNextRadius > prevRadius && this.waveTrailNextRadius <= this.waveRadius) {
      const angleOffset =
        Math.floor(this.waveTrailNextRadius / WAVE_TRAIL_RADIUS_STEP) % 2 === 0
          ? 0
          : Math.PI / WAVE_TRAIL_POINT_COUNT;

      for (let index = 0; index < WAVE_TRAIL_POINT_COUNT; index += 1) {
        const angle = angleOffset + (Math.PI * 2 * index) / WAVE_TRAIL_POINT_COUNT;
        spawnPurpleField(
          this.x + Math.cos(angle) * this.waveTrailNextRadius,
          this.y + Math.sin(angle) * this.waveTrailNextRadius
        );
      }

      this.waveTrailNextRadius += WAVE_TRAIL_RADIUS_STEP;
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
      if (px >= zone.x && px <= zone.x + zone.width && py >= zone.y && py <= zone.y + zone.height) {
        return true;
      }
    }
    return false;
  }

  getWaveIndicator(): BossWaveIndicator | null {
    if (!this.waveState) {
      return null;
    }

    return {
      ownerId: this.id,
      x: this.x,
      y: this.y,
      radius: this.waveRadius,
      state: this.waveState,
    };
  }

  private findNearestPlayer(
    players: Map<string, Player>,
    radius: number,
    findNearestPlayerInRadius?: FindNearestPlayerInRadius
  ): Player | null {
    const predicate = (player: Player) => player.state !== 'dead';

    if (findNearestPlayerInRadius) {
      return findNearestPlayerInRadius(this.x, this.y, radius, predicate);
    }

    let nearest: Player | null = null;
    let minDistSq = radius * radius;

    for (const player of players.values()) {
      if (!predicate(player)) continue;
      const dSq = distanceSquared(this.x, this.y, player.x, player.y);
      if (dSq <= minDistSq) {
        minDistSq = dSq;
        nearest = player;
      }
    }

    return nearest;
  }

  private forEachPlayerCandidate(
    players: Map<string, Player>,
    x: number,
    y: number,
    radius: number,
    callback: (player: Player) => void,
    forEachPlayerInRadius?: ForEachPlayerInRadius
  ): void {
    if (forEachPlayerInRadius) {
      forEachPlayerInRadius(x, y, radius, callback);
      return;
    }

    const radiusSq = radius * radius;
    for (const player of players.values()) {
      const dx = player.x - x;
      const dy = player.y - y;
      if (dx * dx + dy * dy <= radiusSq) {
        callback(player);
      }
    }
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
      this.waveState = null;
      this.respawnTimer = BOSS_RESPAWN_TIME;
      this.deathHandled = false;
    }
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
      phase: this.phase,
    };
  }
}
