import { HAZARD_KINDS } from '@gelehka/shared';
import { nanoid } from 'nanoid';
import { BLOB_DAMAGE } from '../../entities/Blob.js';
import { Player } from '../../entities/Player.js';
import type { Hazard } from '../World.js';
import type { SafeZoneArea } from './SafeZoneSystem.js';

const FIRE_FIELD_DURATION_MS = 1800;
const FIRE_FIELD_SEGMENTS = 7;
const FIRE_FIELD_SPACING = 36;
const FIRE_FIELD_SEGMENT_INTERVAL_MS = 40;
const FIRE_FIELD_HIT_RADIUS = 18;

interface PendingFireFieldLine {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  nextSegment: number;
  nextSpawnAtMs: number;
}

export class HazardSystem {
  private pendingFireFieldLines: PendingFireFieldLine[] = [];

  spawnFireFieldLine(x: number, y: number, dirX: number, dirY: number, now: number): void {
    const normalizedDirX = Math.sign(dirX);
    const normalizedDirY = Math.sign(dirY);
    if (normalizedDirX === 0 && normalizedDirY === 0) {
      return;
    }

    this.pendingFireFieldLines.push({
      x,
      y,
      dirX: normalizedDirX,
      dirY: normalizedDirY,
      nextSegment: 1,
      nextSpawnAtMs: now,
    });
  }

  update(
    dt: number,
    now: number,
    players: Map<string, Player>,
    hazards: Map<string, Hazard>,
    safeZone: SafeZoneArea
  ): void {
    this.updateHazards(dt, hazards);
    this.updatePendingFireFieldLines(now, hazards);
    this.resolveHazardDamage(players, hazards, safeZone);
  }

  private spawnFireFieldSegment(
    hazards: Map<string, Hazard>,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    segmentIndex: number
  ): void {
    const hx = x + dirX * FIRE_FIELD_SPACING * segmentIndex;
    const hy = y + dirY * FIRE_FIELD_SPACING * segmentIndex;
    const id = `hazard_fire_${nanoid(8)}`;
    hazards.set(id, {
      id,
      x: hx,
      y: hy,
      kind: HAZARD_KINDS.FIRE_FIELD,
      ttlMs: FIRE_FIELD_DURATION_MS,
      damage: BLOB_DAMAGE,
      burningTicks: 3,
      hitPlayerIds: new Set<string>(),
    });
  }

  private updatePendingFireFieldLines(now: number, hazards: Map<string, Hazard>): void {
    if (this.pendingFireFieldLines.length === 0) {
      return;
    }

    for (let i = this.pendingFireFieldLines.length - 1; i >= 0; i -= 1) {
      const line = this.pendingFireFieldLines[i];

      while (line.nextSegment <= FIRE_FIELD_SEGMENTS && line.nextSpawnAtMs <= now) {
        this.spawnFireFieldSegment(hazards, line.x, line.y, line.dirX, line.dirY, line.nextSegment);
        line.nextSegment += 1;
        line.nextSpawnAtMs += FIRE_FIELD_SEGMENT_INTERVAL_MS;
      }

      if (line.nextSegment > FIRE_FIELD_SEGMENTS) {
        this.pendingFireFieldLines.splice(i, 1);
      }
    }
  }

  private updateHazards(dt: number, hazards: Map<string, Hazard>): void {
    for (const [hazardId, hazard] of hazards) {
      hazard.ttlMs -= dt;
      if (hazard.ttlMs <= 0) {
        hazards.delete(hazardId);
      }
    }
  }

  private resolveHazardDamage(
    players: Map<string, Player>,
    hazards: Map<string, Hazard>,
    safeZone: SafeZoneArea
  ): void {
    const hitRadiusSq = FIRE_FIELD_HIT_RADIUS * FIRE_FIELD_HIT_RADIUS;
    for (const hazard of hazards.values()) {
      for (const player of players.values()) {
        if (player.state === 'dead') continue;
        if (hazard.hitPlayerIds.has(player.id)) continue;
        if (player.isProtected(safeZone.x, safeZone.y, safeZone.radius)) {
          continue;
        }

        const dx = player.x - hazard.x;
        const dy = player.y - hazard.y;
        if (dx * dx + dy * dy <= hitRadiusSq) {
          player.takeDamage(hazard.damage);
          player.applyBurning(hazard.burningTicks);
          hazard.hitPlayerIds.add(player.id);
        }
      }
    }
  }
}
