import { WORLD_VIEW_RADIUS } from '@gelehka/shared/constants';
import { PROTOCOL_VERSION, SERVER_MESSAGE_TYPES } from '@gelehka/shared';
import type {
  AoeIndicator,
  IceZone,
  LeaderboardMessage,
  PlayerSnapshot,
  PortalSnapshot,
  HazardSnapshot,
} from '../../network/MessageTypes.js';
import type { SnapshotBundle } from '../../network/SnapshotSerializer.js';
import { World } from '../World.js';
import { BossGelehk } from '../../entities/BossGelehk.js';

const SNAPSHOT_POSITION_PRECISION = 10;

function quantizePosition(value: number): number {
  return Math.round(value * SNAPSHOT_POSITION_PRECISION) / SNAPSHOT_POSITION_PRECISION;
}

export class SnapshotSystem {
  beginTick(_world: World): void {
    return;
  }

  getSnapshotBundle(world: World): SnapshotBundle {
    const { iceZones, aoeIndicators } = this.collectBossEffects(world);

    const enemies = [];
    for (const blob of world.blobs.values()) {
      if (blob.state !== 'dead') enemies.push(blob.toSnapshot());
    }
    for (const slime of world.slimes.values()) {
      if (slime.state !== 'dead') enemies.push(slime.toSnapshot());
    }
    for (const hand of world.hands.values()) {
      if (hand.state !== 'dead') enemies.push(hand.toSnapshot());
    }

    const bosses = [];
    for (const boss of world.bosses.values()) {
      bosses.push(boss.toSnapshot());
    }

    const drops = [];
    for (const drop of world.drops.values()) {
      drops.push(drop);
    }

    const portals: PortalSnapshot[] = [];
    for (const portal of world.portals.values()) {
      portals.push({
        id: portal.id,
        x: quantizePosition(portal.x),
        y: quantizePosition(portal.y),
        kind: portal.kind,
      });
    }

    const hazards: HazardSnapshot[] = [];
    for (const hazard of world.hazards.values()) {
      hazards.push({
        id: hazard.id,
        x: quantizePosition(hazard.x),
        y: quantizePosition(hazard.y),
        kind: hazard.kind,
        ttlMs: Math.max(0, Math.round(hazard.ttlMs)),
      });
    }

    return {
      instanceId: world.instanceId,
      players: this.getPlayerSnapshots(world),
      enemies,
      bosses,
      drops,
      portals,
      hazards,
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
    for (const blob of world.queryEnemiesInRadius(vx, vy, WORLD_VIEW_RADIUS)) {
      enemies.push(blob.toSnapshot());
    }

    const bosses = [];
    for (const boss of world.queryBossesInRadius(vx, vy, WORLD_VIEW_RADIUS)) {
      bosses.push(boss.toSnapshot());
    }

    const drops = [];
    for (const drop of world.queryDropsInRadius(vx, vy, WORLD_VIEW_RADIUS)) {
      drops.push(drop);
    }

    const portals: PortalSnapshot[] = [];
    for (const portal of world.queryPortalsInRadius(vx, vy, WORLD_VIEW_RADIUS)) {
      portals.push({
        id: portal.id,
        x: quantizePosition(portal.x),
        y: quantizePosition(portal.y),
        kind: portal.kind,
      });
    }

    const hazards: HazardSnapshot[] = [];
    for (const hazard of world.queryHazardsInRadius(vx, vy, WORLD_VIEW_RADIUS)) {
      hazards.push({
        id: hazard.id,
        x: quantizePosition(hazard.x),
        y: quantizePosition(hazard.y),
        kind: hazard.kind,
        ttlMs: Math.max(0, Math.round(hazard.ttlMs)),
      });
    }

    const { iceZones, aoeIndicators } = this.collectBossEffects(world, inRange);

    return {
      instanceId: world.instanceId,
      players,
      enemies,
      bosses,
      drops,
      portals,
      hazards,
      iceZones,
      aoeIndicators,
    };
  }

  getLeaderboard(world: World): LeaderboardMessage {
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: SERVER_MESSAGE_TYPES.LEADERBOARD,
      players: this.getPlayerSnapshots(world),
    };
  }

  private getPlayerSnapshots(world: World): PlayerSnapshot[] {
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
      if (!(boss instanceof BossGelehk)) continue;
      if (filterFn && !filterFn(boss.x, boss.y)) continue;

      for (const zone of boss.iceZones) {
        iceZones.push(zone);
      }
      for (const aoe of boss.aoeIndicators) {
        aoeIndicators.push({
          x: quantizePosition(aoe.x),
          y: quantizePosition(aoe.y),
          radius: aoe.radius,
          timer: Math.round(aoe.timer),
          hit: aoe.hit,
        });
      }
    }

    return { iceZones, aoeIndicators };
  }
}
