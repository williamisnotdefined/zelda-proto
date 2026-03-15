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
    this.playerSpatialIndex = new SpatialHash(
      cellSize,
      (player) => player.x,
      (player) => player.y
    );
    this.enemySpatialIndex = new SpatialHash(
      cellSize,
      (enemy) => enemy.x,
      (enemy) => enemy.y
    );
    this.bossSpatialIndex = new SpatialHash(
      cellSize,
      (boss) => boss.x,
      (boss) => boss.y
    );
    this.dropSpatialIndex = new SpatialHash(
      cellSize,
      (drop) => drop.x,
      (drop) => drop.y
    );
    this.portalSpatialIndex = new SpatialHash(
      cellSize,
      (portal) => portal.x,
      (portal) => portal.y
    );
    this.hazardSpatialIndex = new SpatialHash(
      cellSize,
      (hazard) => hazard.x,
      (hazard) => hazard.y
    );
  }

  rebuildPlayerIndex(players: Map<string, Player>): void {
    this.playerSpatialIndex.clear();

    for (const player of players.values()) {
      this.playerSpatialIndex.insert(player);
    }
  }

  rebuildEnemyBossIndexes(
    blobs: Map<string, Blob>,
    slimes: Map<string, Blob>,
    hands: Map<string, Blob>,
    pacmanGhosts: Map<string, Blob>,
    bosses: Map<string, BossActorEntity>
  ): void {
    this.enemySpatialIndex.clear();
    this.bossSpatialIndex.clear();

    for (const blob of blobs.values()) {
      if (blob.state === 'dead') continue;
      this.enemySpatialIndex.insert(blob);
    }

    for (const slime of slimes.values()) {
      if (slime.state === 'dead') continue;
      this.enemySpatialIndex.insert(slime);
    }

    for (const hand of hands.values()) {
      if (hand.state === 'dead') continue;
      this.enemySpatialIndex.insert(hand);
    }

    for (const pacmanGhost of pacmanGhosts.values()) {
      if (pacmanGhost.state === 'dead') continue;
      this.enemySpatialIndex.insert(pacmanGhost);
    }

    for (const boss of bosses.values()) {
      if (boss.state === 'dead') continue;
      this.bossSpatialIndex.insert(boss);
    }
  }

  rebuildStaticIndexes(
    drops: Map<string, Drop>,
    portals: Map<string, Portal>,
    hazards: Map<string, Hazard>
  ): void {
    this.dropSpatialIndex.clear();
    this.portalSpatialIndex.clear();
    this.hazardSpatialIndex.clear();

    for (const drop of drops.values()) {
      this.dropSpatialIndex.insert(drop);
    }

    for (const portal of portals.values()) {
      this.portalSpatialIndex.insert(portal);
    }

    for (const hazard of hazards.values()) {
      this.hazardSpatialIndex.insert(hazard);
    }
  }

  rebuild(
    players: Map<string, Player>,
    blobs: Map<string, Blob>,
    slimes: Map<string, Blob>,
    hands: Map<string, Blob>,
    pacmanGhosts: Map<string, Blob>,
    bosses: Map<string, BossActorEntity>,
    drops: Map<string, Drop>,
    portals: Map<string, Portal>,
    hazards: Map<string, Hazard>
  ): void {
    this.rebuildPlayerIndex(players);
    this.rebuildEnemyBossIndexes(blobs, slimes, hands, pacmanGhosts, bosses);
    this.rebuildStaticIndexes(drops, portals, hazards);
  }

  queryPlayersInRadius(x: number, y: number, radius: number): Player[] {
    return this.playerSpatialIndex.queryRadius(x, y, radius);
  }

  forEachPlayerInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (player: Player) => void
  ): void {
    this.playerSpatialIndex.forEachInRadius(x, y, radius, callback);
  }

  findNearestPlayerInRadius(
    x: number,
    y: number,
    radius: number,
    predicate?: (player: Player) => boolean
  ): Player | null {
    return this.playerSpatialIndex.findNearestInRadius(x, y, radius, predicate);
  }

  queryEnemiesInRadius(x: number, y: number, radius: number): Blob[] {
    return this.enemySpatialIndex.queryRadius(x, y, radius);
  }

  forEachEnemyInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (enemy: Blob) => void
  ): void {
    this.enemySpatialIndex.forEachInRadius(x, y, radius, callback);
  }

  forEachBossInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (boss: BossActorEntity) => void
  ): void {
    this.bossSpatialIndex.forEachInRadius(x, y, radius, callback);
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

  forEachDropInRadius(x: number, y: number, radius: number, callback: (drop: Drop) => void): void {
    this.dropSpatialIndex.forEachInRadius(x, y, radius, callback);
  }

  queryPortalsInRadius(x: number, y: number, radius: number): Portal[] {
    return this.portalSpatialIndex.queryRadius(x, y, radius);
  }

  forEachPortalInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (portal: Portal) => void
  ): void {
    this.portalSpatialIndex.forEachInRadius(x, y, radius, callback);
  }

  queryHazardsInRadius(x: number, y: number, radius: number): Hazard[] {
    return this.hazardSpatialIndex.queryRadius(x, y, radius);
  }

  forEachHazardInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (hazard: Hazard) => void
  ): void {
    this.hazardSpatialIndex.forEachInRadius(x, y, radius, callback);
  }
}
