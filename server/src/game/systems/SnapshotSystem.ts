import { WORLD_VIEW_RADIUS } from '@gelehka/shared/constants';
import { PROTOCOL_VERSION, SERVER_MESSAGE_TYPES } from '@gelehka/shared';
import type {
  AoeIndicator,
  BossWaveIndicator,
  IceZone,
  LeaderboardMessage,
  PlayerSnapshot,
  PortalSnapshot,
  HazardSnapshot,
} from '../../network/MessageTypes.js';
import type { SnapshotBundle } from '../../network/SnapshotSerializer.js';
import { World } from '../World.js';
import { getBossRuntimeDefinition } from '../registries/bossRegistry.js';

const SNAPSHOT_POSITION_PRECISION = 10;
const ENEMY_SNAPSHOT_RADIUS = 1300;
const DROP_SNAPSHOT_RADIUS = 850;
const MAX_DROPS_PER_PLAYER_SNAPSHOT = 180;

function quantizePosition(value: number): number {
  return Math.round(value * SNAPSHOT_POSITION_PRECISION) / SNAPSHOT_POSITION_PRECISION;
}

export class SnapshotSystem {
  beginTick(_world: World): void {
    return;
  }

  getSnapshotBundle(world: World): SnapshotBundle {
    const { iceZones, aoeIndicators, waveIndicators } = this.collectBossEffects(world);

    const enemies = [] as SnapshotBundle['enemies'];
    for (const enemy of world.getAllEnemies()) {
      enemies.push(enemy.toSnapshot());
    }

    const bosses = [];
    for (const boss of world.bosses.values()) {
      bosses.push(boss.toSnapshot());
    }

    const drops = [] as SnapshotBundle['drops'];
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
      waveIndicators,
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

    const players: PlayerSnapshot[] = [];
    let sawSelf = false;
    world.forEachPlayerInRadius(vx, vy, WORLD_VIEW_RADIUS, (player) => {
      players.push(player.toSnapshot());
      if (player.id === playerId) {
        sawSelf = true;
      }
    });

    if (!sawSelf) {
      players.push(viewer.toSnapshot());
    }

    const enemies: SnapshotBundle['enemies'] = [];
    world.forEachEnemyInRadius(
      vx,
      vy,
      ENEMY_SNAPSHOT_RADIUS,
      (blob) => {
        enemies.push(blob.toSnapshot());
      },
      { includeDead: true }
    );

    const bosses: SnapshotBundle['bosses'] = [];
    for (const boss of world.queryBossesInRadius(vx, vy, WORLD_VIEW_RADIUS)) {
      bosses.push(boss.toSnapshot());
    }

    const nearbyDrops: Array<{ drop: SnapshotBundle['drops'][number]; distSq: number }> = [];
    world.forEachDropInRadius(vx, vy, DROP_SNAPSHOT_RADIUS, (drop) => {
      const dx = drop.x - vx;
      const dy = drop.y - vy;
      nearbyDrops.push({ drop, distSq: dx * dx + dy * dy });
    });

    if (nearbyDrops.length > MAX_DROPS_PER_PLAYER_SNAPSHOT) {
      nearbyDrops.sort((a, b) => a.distSq - b.distSq);
    }

    const drops: SnapshotBundle['drops'] = [];
    const dropCount = Math.min(nearbyDrops.length, MAX_DROPS_PER_PLAYER_SNAPSHOT);
    for (let index = 0; index < dropCount; index += 1) {
      drops.push(nearbyDrops[index].drop);
    }

    const portals: PortalSnapshot[] = [];
    world.forEachPortalInRadius(vx, vy, WORLD_VIEW_RADIUS, (portal) => {
      portals.push({
        id: portal.id,
        x: quantizePosition(portal.x),
        y: quantizePosition(portal.y),
        kind: portal.kind,
      });
    });

    const hazards: HazardSnapshot[] = [];
    world.forEachHazardInRadius(vx, vy, WORLD_VIEW_RADIUS, (hazard) => {
      hazards.push({
        id: hazard.id,
        x: quantizePosition(hazard.x),
        y: quantizePosition(hazard.y),
        kind: hazard.kind,
        ttlMs: Math.max(0, Math.round(hazard.ttlMs)),
      });
    });

    const { iceZones, aoeIndicators, waveIndicators } = this.collectBossEffects(world, inRange);

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
      waveIndicators,
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
  ): { iceZones: IceZone[]; aoeIndicators: AoeIndicator[]; waveIndicators: BossWaveIndicator[] } {
    const iceZones: IceZone[] = [];
    const aoeIndicators: AoeIndicator[] = [];
    const waveIndicators: BossWaveIndicator[] = [];

    for (const boss of world.getAliveBosses()) {
      if (filterFn && !filterFn(boss.x, boss.y)) continue;

      const effects = getBossRuntimeDefinition(boss.kind).collectSnapshotEffects?.(boss);
      for (const zone of effects?.iceZones ?? []) {
        iceZones.push(zone);
      }
      for (const aoe of effects?.aoeIndicators ?? []) {
        aoeIndicators.push({
          ownerId: aoe.ownerId,
          x: quantizePosition(aoe.x),
          y: quantizePosition(aoe.y),
          radius: Math.round(aoe.radius),
          timer: Math.round(aoe.timer),
          hit: aoe.hit,
        });
      }
      for (const wave of effects?.waveIndicators ?? []) {
        waveIndicators.push({
          ownerId: wave.ownerId,
          x: quantizePosition(wave.x),
          y: quantizePosition(wave.y),
          radius: Math.round(wave.radius),
          state: wave.state,
        });
      }
    }

    return { iceZones, aoeIndicators, waveIndicators };
  }
}
