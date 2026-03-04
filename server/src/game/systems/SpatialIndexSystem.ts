import { SpatialHash } from '../../core/SpatialHash.js';
import type { Blob } from '../../entities/Blob.js';
import type { Player } from '../../entities/Player.js';
import type { BossActorEntity, Drop, Hazard, Portal } from '../World.js';

export class SpatialIndexSystem {
  private readonly playerSpatialIndex: SpatialHash<Player>;
  private readonly enemySpatialIndex: SpatialHash<Blob>;
  private readonly bossSpatialIndex: SpatialHash<BossActorEntity>;
  private readonly dropSpatialIndex: SpatialHash<Drop>;
  private readonly portalSpatialIndex: SpatialHash<Portal>;
  private readonly hazardSpatialIndex: SpatialHash<Hazard>;

  constructor(cellSize = 512) {
    this.playerSpatialIndex = new SpatialHash(cellSize);
    this.enemySpatialIndex = new SpatialHash(cellSize);
    this.bossSpatialIndex = new SpatialHash(cellSize);
    this.dropSpatialIndex = new SpatialHash(cellSize);
    this.portalSpatialIndex = new SpatialHash(cellSize);
    this.hazardSpatialIndex = new SpatialHash(cellSize);
  }

  rebuild(
    players: Map<string, Player>,
    blobs: Map<string, Blob>,
    slimes: Map<string, Blob>,
    hands: Map<string, Blob>,
    bosses: Map<string, BossActorEntity>,
    drops: Map<string, Drop>,
    portals: Map<string, Portal>,
    hazards: Map<string, Hazard>
  ): void {
    this.playerSpatialIndex.clear();
    this.enemySpatialIndex.clear();
    this.bossSpatialIndex.clear();
    this.dropSpatialIndex.clear();
    this.portalSpatialIndex.clear();
    this.hazardSpatialIndex.clear();

    for (const player of players.values()) {
      this.playerSpatialIndex.insert(player.x, player.y, player);
    }

    for (const blob of blobs.values()) {
      if (blob.state === 'dead') continue;
      this.enemySpatialIndex.insert(blob.x, blob.y, blob);
    }

    for (const slime of slimes.values()) {
      if (slime.state === 'dead') continue;
      this.enemySpatialIndex.insert(slime.x, slime.y, slime);
    }

    for (const hand of hands.values()) {
      if (hand.state === 'dead') continue;
      this.enemySpatialIndex.insert(hand.x, hand.y, hand);
    }

    for (const boss of bosses.values()) {
      if (boss.state === 'dead') continue;
      this.bossSpatialIndex.insert(boss.x, boss.y, boss);
    }

    for (const drop of drops.values()) {
      this.dropSpatialIndex.insert(drop.x, drop.y, drop);
    }

    for (const portal of portals.values()) {
      this.portalSpatialIndex.insert(portal.x, portal.y, portal);
    }

    for (const hazard of hazards.values()) {
      this.hazardSpatialIndex.insert(hazard.x, hazard.y, hazard);
    }
  }

  queryPlayersInRadius(x: number, y: number, radius: number): Player[] {
    return this.playerSpatialIndex.queryRadius(x, y, radius);
  }

  queryEnemiesInRadius(x: number, y: number, radius: number): Blob[] {
    return this.enemySpatialIndex.queryRadius(x, y, radius);
  }

  queryBossesInRadius(
    x: number,
    y: number,
    radius: number,
    allBosses: Map<string, BossActorEntity>
  ): BossActorEntity[] {
    const bossesInRadius = this.bossSpatialIndex.queryRadius(x, y, radius);
    const radiusSq = radius * radius;

    for (const boss of allBosses.values()) {
      if (boss.state !== 'dead') continue;
      const dx = boss.x - x;
      const dy = boss.y - y;
      if (dx * dx + dy * dy <= radiusSq) {
        bossesInRadius.push(boss);
      }
    }

    return bossesInRadius;
  }

  queryDropsInRadius(x: number, y: number, radius: number): Drop[] {
    return this.dropSpatialIndex.queryRadius(x, y, radius);
  }

  queryPortalsInRadius(x: number, y: number, radius: number): Portal[] {
    return this.portalSpatialIndex.queryRadius(x, y, radius);
  }

  queryHazardsInRadius(x: number, y: number, radius: number): Hazard[] {
    return this.hazardSpatialIndex.queryRadius(x, y, radius);
  }
}
