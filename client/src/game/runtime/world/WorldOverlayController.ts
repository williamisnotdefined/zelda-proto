import type { InstanceId } from '@gelehka/shared';
import { INSTANCE_IDS } from '@gelehka/shared';
import Phaser from 'phaser';
import { type BossEntity } from '../bosses/bossRegistry';
import { EnemyRuntime } from '../enemies/EnemyRuntime';
import type { EnemyVisualStats } from '../enemies/enemyVisualRegistry';
import { PerformanceOverlay } from '../../debug/PerformanceOverlay';
import { Minimap } from '../../Minimap';
import { PlayerEntity } from '../../../entities/Player';
import { PortalEntity } from '../../../entities/PortalEntity';
import type { NetworkPerformanceStats } from '../../../network/NetworkManager';

const MINIMAP_UPDATE_INTERVAL_MS = 100;
const PHASE4_MINIMAP_UPDATE_INTERVAL_MS = 200;

interface OverlayUpdateParams {
  delta: number;
  currentInstanceId: InstanceId | null;
  localPlayerId: string | null;
  localEntity: PlayerEntity | null;
  playerEntities: ReadonlyMap<string, PlayerEntity>;
  enemyRuntime: EnemyRuntime;
  enemyVisualStats: EnemyVisualStats;
  bossEntities: ReadonlyMap<string, BossEntity>;
  portalEntities: ReadonlyMap<string, PortalEntity>;
  dropCount: number;
  hazardCount: number;
}

export class WorldOverlayController {
  private readonly minimap: Minimap;
  private readonly perfOverlay: PerformanceOverlay;
  private minimapAccumulatorMs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly getNetworkStats: () => NetworkPerformanceStats
  ) {
    this.minimap = new Minimap(scene);
    this.perfOverlay = new PerformanceOverlay(scene);
  }

  update(params: OverlayUpdateParams): void {
    const {
      delta,
      currentInstanceId,
      localPlayerId,
      localEntity,
      playerEntities,
      enemyRuntime,
      enemyVisualStats,
      bossEntities,
      portalEntities,
      dropCount,
      hazardCount,
    } = params;

    if (localEntity) {
      this.minimapAccumulatorMs += delta;
      if (
        this.minimapAccumulatorMs >= this.getMinimapUpdateInterval(currentInstanceId, enemyRuntime)
      ) {
        this.minimapAccumulatorMs = 0;
        this.minimap.draw(
          localEntity.sprite.x,
          localEntity.sprite.y,
          playerEntities,
          (x, y, radius, callback) => enemyRuntime.forEachSnapshotInRadius(x, y, radius, callback),
          bossEntities,
          portalEntities,
          localPlayerId
        );
      }
    }

    if (!this.perfOverlay.isEnabled()) {
      return;
    }

    this.perfOverlay.update(delta, {
      fps: this.scene.game.loop.actualFps,
      frameMs: delta,
      enemySnapshots: enemyRuntime.getSnapshotCount(),
      visibleEnemies: enemyVisualStats.visibleCount,
      enemyVisuals: enemyRuntime.getVisualCount(),
      pooledEnemyVisuals: enemyRuntime.getPooledVisualCount(),
      enemyVisualMode: enemyVisualStats.usingBudget ? 'budget' : 'smooth',
      players: playerEntities.size,
      bosses: bossEntities.size,
      drops: dropCount,
      portals: portalEntities.size,
      hazards: hazardCount,
      displayObjects: this.scene.children.list.length,
      enemyVisualLodNear: enemyVisualStats.nearCount,
      enemyVisualLodMid: enemyVisualStats.midCount,
      enemyVisualLodFar: enemyVisualStats.farCount,
      animatedEnemies: enemyVisualStats.animatedCount,
      network: this.getNetworkStats(),
    });
  }

  reset(): void {
    this.minimapAccumulatorMs = 0;
  }

  destroy(): void {
    this.minimap.destroy();
    this.perfOverlay.destroy();
  }

  private getMinimapUpdateInterval(
    currentInstanceId: InstanceId | null,
    enemyRuntime: EnemyRuntime
  ): number {
    const baseInterval =
      currentInstanceId === INSTANCE_IDS.PHASE4
        ? PHASE4_MINIMAP_UPDATE_INTERVAL_MS
        : MINIMAP_UPDATE_INTERVAL_MS;

    const enemyCount = enemyRuntime.getSnapshotCount();
    if (enemyCount >= 1000) {
      return Math.max(baseInterval, 400);
    }
    if (enemyCount >= 800) {
      return Math.max(baseInterval, 300);
    }
    if (enemyCount >= 600) {
      return Math.max(baseInterval, 220);
    }
    if (enemyCount >= 400) {
      return Math.max(baseInterval, 150);
    }

    return baseInterval;
  }
}
