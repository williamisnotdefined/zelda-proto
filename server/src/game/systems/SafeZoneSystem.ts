import { DragonLord } from '../../entities/DragonLord.js';
import type { Blob } from '../../entities/Blob.js';
import type { BossActorEntity } from '../World.js';

export interface SafeZoneArea {
  x: number;
  y: number;
  radius: number;
}

export class SafeZoneSystem {
  private wasSpawnSafeZoneActive = false;

  isActive(players: Iterable<{ safeZoneTimer: number }>): boolean {
    for (const player of players) {
      if (player.safeZoneTimer > 0) return true;
    }
    return false;
  }

  update(
    players: Iterable<{ safeZoneTimer: number }>,
    enemies: Iterable<Blob>,
    bosses: Iterable<BossActorEntity>,
    safeZone: SafeZoneArea,
    safeZoneCreatedThisTick: boolean
  ): boolean {
    const active = this.isActive(players);
    if (active && (!this.wasSpawnSafeZoneActive || safeZoneCreatedThisTick)) {
      this.expelHostilesFromSafeZone(enemies, bosses, safeZone);
    }
    this.wasSpawnSafeZoneActive = active;
    return active;
  }

  enforceHostilesOutside(
    enemies: Iterable<Blob>,
    bosses: Iterable<BossActorEntity>,
    safeZone: SafeZoneArea
  ): void {
    this.expelHostilesFromSafeZone(enemies, bosses, safeZone);
  }

  private expelHostilesFromSafeZone(
    enemies: Iterable<Blob>,
    bosses: Iterable<BossActorEntity>,
    safeZone: SafeZoneArea
  ): void {
    const pushDistance = safeZone.radius + 12;

    for (const enemy of enemies) {
      if (enemy.state === 'dead') continue;
      if (!this.pushPointOutsideSafeZone(enemy, safeZone, pushDistance)) continue;
      enemy.targetPlayerId = null;
      enemy.state = 'idle';
    }

    for (const boss of bosses) {
      if (boss.state === 'dead') continue;
      if (!this.pushPointOutsideSafeZone(boss, safeZone, pushDistance)) continue;

      if (boss instanceof DragonLord) {
        boss.targetPlayerId = null;
      }
      boss.state = 'idle';
    }
  }

  private pushPointOutsideSafeZone(
    entity: { x: number; y: number },
    safeZone: SafeZoneArea,
    pushDistance: number
  ): boolean {
    const dx = entity.x - safeZone.x;
    const dy = entity.y - safeZone.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > safeZone.radius * safeZone.radius) {
      return false;
    }

    if (distSq === 0) {
      entity.x = safeZone.x + pushDistance;
      entity.y = safeZone.y;
      return true;
    }

    const dist = Math.sqrt(distSq);
    entity.x = safeZone.x + (dx / dist) * pushDistance;
    entity.y = safeZone.y + (dy / dist) * pushDistance;
    return true;
  }
}
