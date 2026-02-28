import { WORLD_VIEW_RADIUS } from '@gelehka/shared/constants';
import {
  AoeIndicator,
  IceZone,
  LeaderboardMessage,
  PlayerSnapshot,
} from '../../network/MessageTypes.js';
import { SnapshotBundle } from '../../network/SnapshotSerializer.js';
import { World } from '../World.js';

export class SnapshotSystem {
  private cachedPlayerSnapshots: PlayerSnapshot[] | null = null;

  beginTick(world: World): void {
    const snapshots: PlayerSnapshot[] = [];
    for (const player of world.players.values()) {
      snapshots.push(player.toSnapshot());
    }
    this.cachedPlayerSnapshots = snapshots;
  }

  getSnapshotBundle(world: World): SnapshotBundle {
    const { iceZones, aoeIndicators } = this.collectBossEffects(world);

    const enemies = [];
    for (const slime of world.slimes.values()) {
      if (slime.state !== 'dead') enemies.push(slime.toSnapshot());
    }

    const bosses = [];
    for (const boss of world.bosses.values()) {
      bosses.push(boss.toSnapshot());
    }

    const drops = [];
    for (const drop of world.drops.values()) {
      drops.push(drop);
    }

    return {
      players: this.getPlayerSnapshots(world),
      enemies,
      bosses,
      drops,
      iceZones,
      aoeIndicators,
    };
  }

  getSnapshotForPlayer(world: World, playerId: string): SnapshotBundle {
    const viewer = world.players.get(playerId);
    if (!viewer) return this.getSnapshotBundle(world);

    const viewRadiusSq = WORLD_VIEW_RADIUS * WORLD_VIEW_RADIUS;
    const vx = viewer.x;
    const vy = viewer.y;
    const inRange = (ex: number, ey: number) => {
      const dx = ex - vx;
      const dy = ey - vy;
      return dx * dx + dy * dy <= viewRadiusSq;
    };

    const players = [];
    for (const player of world.queryPlayersInRadius(vx, vy, WORLD_VIEW_RADIUS)) {
      players.push(player.toSnapshot());
    }

    const selfSnapshot = world.players.get(playerId)?.toSnapshot();
    if (selfSnapshot && !players.some((p) => p.id === selfSnapshot.id)) {
      players.push(selfSnapshot);
    }

    const enemies = [];
    for (const slime of world.queryEnemiesInRadius(vx, vy, WORLD_VIEW_RADIUS)) {
      enemies.push(slime.toSnapshot());
    }

    const bosses = [];
    for (const boss of world.queryBossesInRadius(vx, vy, WORLD_VIEW_RADIUS)) {
      bosses.push(boss.toSnapshot());
    }

    const drops = [];
    for (const drop of world.queryDropsInRadius(vx, vy, WORLD_VIEW_RADIUS)) {
      drops.push(drop);
    }

    const { iceZones, aoeIndicators } = this.collectBossEffects(world, inRange);

    return {
      players,
      enemies,
      bosses,
      drops,
      iceZones,
      aoeIndicators,
    };
  }

  getLeaderboard(world: World): LeaderboardMessage {
    return {
      type: 'leaderboard',
      players: this.getPlayerSnapshots(world),
    };
  }

  private getPlayerSnapshots(world: World): PlayerSnapshot[] {
    if (this.cachedPlayerSnapshots) return this.cachedPlayerSnapshots;
    const snapshots: PlayerSnapshot[] = [];
    for (const player of world.players.values()) {
      snapshots.push(player.toSnapshot());
    }
    return snapshots;
  }

  private collectBossEffects(
    world: World,
    filterFn?: (x: number, y: number) => boolean
  ): { iceZones: IceZone[]; aoeIndicators: AoeIndicator[] } {
    const iceZones: IceZone[] = [];
    const aoeIndicators: AoeIndicator[] = [];

    for (const boss of world.bosses.values()) {
      if (boss.state === 'dead') continue;
      if (filterFn && !filterFn(boss.x, boss.y)) continue;

      for (const zone of boss.iceZones) {
        iceZones.push(zone);
      }
      for (const aoe of boss.aoeIndicators) {
        aoeIndicators.push({
          x: Math.round(aoe.x),
          y: Math.round(aoe.y),
          radius: aoe.radius,
          timer: Math.round(aoe.timer),
        });
      }
    }

    return { iceZones, aoeIndicators };
  }
}
