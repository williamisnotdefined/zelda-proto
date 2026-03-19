import { HAZARD_KINDS } from '@gelehka/shared';
import type { HazardKind } from '@gelehka/shared';
import { nanoid } from 'nanoid';
import { BLOB_DAMAGE } from '../../entities/Blob.js';
import { Player, PLAYER_HEIGHT, PLAYER_WIDTH } from '../../entities/Player.js';
import type { Hazard } from '../World.js';
import { getHazardRuntimeDefinition } from '../registries/hazardRegistry.js';
import type { SafeZoneArea } from './SafeZoneSystem.js';

const FIRE_FIELD_SEGMENTS = 7;
const FIRE_FIELD_SPACING = 36;
const FIRE_FIELD_SEGMENT_INTERVAL_MS = 40;
const PURPLE_FIELD_BLAST_RADIUS = 80;
const PURPLE_FIELD_TILE_STEP = 34;
const PLAYER_HALF_DIAGONAL = Math.hypot(PLAYER_WIDTH / 2, PLAYER_HEIGHT / 2);

type PlayerRadiusQuery = (
  x: number,
  y: number,
  radius: number,
  callback: (player: Player) => void
) => void;

interface PendingFireFieldLine {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  kind: HazardKind;
  nextSegment: number;
  nextSpawnAtMs: number;
}

export class HazardSystem {
  private pendingFireFieldLines: PendingFireFieldLine[] = [];

  spawnPurpleField(hazards: Map<string, Hazard>, x: number, y: number): void {
    const definition = getHazardRuntimeDefinition(HAZARD_KINDS.PURPLE_FIELD);

    for (
      let offsetY = -PURPLE_FIELD_BLAST_RADIUS;
      offsetY <= PURPLE_FIELD_BLAST_RADIUS;
      offsetY += PURPLE_FIELD_TILE_STEP
    ) {
      for (
        let offsetX = -PURPLE_FIELD_BLAST_RADIUS;
        offsetX <= PURPLE_FIELD_BLAST_RADIUS;
        offsetX += PURPLE_FIELD_TILE_STEP
      ) {
        const distSq = offsetX * offsetX + offsetY * offsetY;
        if (distSq > PURPLE_FIELD_BLAST_RADIUS * PURPLE_FIELD_BLAST_RADIUS) continue;
        const id = `${definition.idPrefix}_${nanoid(8)}`;
        hazards.set(id, {
          id,
          x: x + offsetX,
          y: y + offsetY,
          kind: HAZARD_KINDS.PURPLE_FIELD,
          ttlMs: definition.ttlMs,
          damage: BLOB_DAMAGE,
          burningTicks: definition.burningTicks,
          hitPlayerIds: new Set<string>(),
        });
      }
    }
  }

  spawnFireFieldLine(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    now: number,
    kind: HazardKind = HAZARD_KINDS.FIRE_FIELD
  ): void {
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
      kind,
      nextSegment: 1,
      nextSpawnAtMs: now,
    });
  }

  update(
    dt: number,
    now: number,
    players: Map<string, Player>,
    hazards: Map<string, Hazard>,
    safeZone: SafeZoneArea,
    forEachPlayerInRadius: PlayerRadiusQuery
  ): void {
    this.updateHazards(dt, hazards);
    this.updatePendingFireFieldLines(now, hazards);
    this.resolveHazardDamage(players, hazards, safeZone, forEachPlayerInRadius);
  }

  private spawnFireFieldSegment(
    hazards: Map<string, Hazard>,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    kind: HazardKind,
    segmentIndex: number
  ): void {
    const definition = getHazardRuntimeDefinition(kind);
    const hx = x + dirX * FIRE_FIELD_SPACING * segmentIndex;
    const hy = y + dirY * FIRE_FIELD_SPACING * segmentIndex;
    const id = `${definition.idPrefix}_${nanoid(8)}`;
    hazards.set(id, {
      id,
      x: hx,
      y: hy,
      kind,
      ttlMs: definition.ttlMs,
      damage: BLOB_DAMAGE,
      burningTicks: definition.burningTicks,
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
        this.spawnFireFieldSegment(
          hazards,
          line.x,
          line.y,
          line.dirX,
          line.dirY,
          line.kind,
          line.nextSegment
        );
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
    safeZone: SafeZoneArea,
    forEachPlayerInRadius: PlayerRadiusQuery
  ): void {
    const purpleHitThisTick = new Set<string>();

    for (const hazard of hazards.values()) {
      const definition = getHazardRuntimeDefinition(hazard.kind);
      const queryRadius = definition.hitRadius + PLAYER_HALF_DIAGONAL;
      const hitRadiusSq = definition.hitRadius * definition.hitRadius;
      forEachPlayerInRadius(hazard.x, hazard.y, queryRadius, (player) => {
        if (player.state === 'dead') return;
        if (!players.has(player.id)) return;
        if (hazard.hitPlayerIds.has(player.id)) return;
        if (hazard.kind === HAZARD_KINDS.PURPLE_FIELD && purpleHitThisTick.has(player.id)) return;
        if (player.isProtected(safeZone.x, safeZone.y, safeZone.radius)) {
          return;
        }

        const dx = player.x - hazard.x;
        const dy = player.y - hazard.y;
        if (dx * dx + dy * dy <= hitRadiusSq) {
          player.takeDamage(hazard.damage);
          if (hazard.kind === HAZARD_KINDS.PURPLE_FIELD) {
            purpleHitThisTick.add(player.id);
          }
          definition.apply(player);
          hazard.hitPlayerIds.add(player.id);
        }
      });
    }
  }
}
