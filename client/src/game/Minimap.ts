import { PORTAL_KINDS } from '@gelehka/shared';
import type { EnemySnapshot } from '@gelehka/shared';
import Phaser from 'phaser';
import { BossDragonLordEntity } from '../entities/BossDragonLord';
import { BossGelehkEntity } from '../entities/BossGelehk';
import { BossPhase3Entity } from '../entities/BossPhase3';
import { PlayerEntity } from '../entities/Player';
import { PortalEntity } from '../entities/PortalEntity';

type BossEntity = BossGelehkEntity | BossDragonLordEntity | BossPhase3Entity;
type EnemyRadiusQuery = (
  x: number,
  y: number,
  radius: number,
  callback: (enemy: EnemySnapshot) => void
) => void;

const MINIMAP_RADIUS = 60;
const MINIMAP_SCREEN_MULTIPLIER = 3;
const MINIMAP_MIN_WORLD_RANGE = 900;
const MINIMAP_MAX_WORLD_RANGE = 1800;
const MINIMAP_BG_ALPHA = 0.35;
const MINIMAP_PADDING = 14;
const MINIMAP_ENEMY_CLUSTER_SIZE_PX = 4;
const MINIMAP_MAX_ENEMY_MARKERS = 180;

export class Minimap {
  private graphics: Phaser.GameObjects.Graphics;
  private screenX = 0;
  private screenY = 0;

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    this.updateScreenPosition(cam);

    this.graphics = scene.add.graphics();
    this.graphics.setScrollFactor(0);
    this.graphics.setDepth(100);
  }

  draw(
    localX: number,
    localY: number,
    playerEntities: Map<string, PlayerEntity>,
    forEachEnemyInRadius: EnemyRadiusQuery,
    bossEntities: Map<string, BossEntity>,
    portalEntities: Map<string, PortalEntity>,
    localPlayerId: string | null
  ): void {
    const g = this.graphics;
    const camera = this.graphics.scene.cameras.main;
    this.updateScreenPosition(camera);
    g.clear();

    // Background circle
    g.fillStyle(0x000000, MINIMAP_BG_ALPHA);
    g.fillCircle(this.screenX, this.screenY, MINIMAP_RADIUS);

    // Border ring
    g.lineStyle(1.5, 0x88ff88, 0.5);
    g.strokeCircle(this.screenX, this.screenY, MINIMAP_RADIUS);

    const screenRange = (Math.max(camera.width, camera.height) * MINIMAP_SCREEN_MULTIPLIER) / 2;
    const worldRange = Phaser.Math.Clamp(
      screenRange,
      MINIMAP_MIN_WORLD_RANGE,
      MINIMAP_MAX_WORLD_RANGE
    );
    const scale = (MINIMAP_RADIUS - 4) / worldRange;

    // Draw enemies (clustered red dots)
    g.fillStyle(0xff4444, 0.9);
    const enemyClusters = new Map<string, { x: number; y: number; count: number }>();
    const maxEnemyDist = MINIMAP_RADIUS - 1.5;
    const maxEnemyDistSq = maxEnemyDist * maxEnemyDist;
    forEachEnemyInRadius(localX, localY, worldRange, (enemy) => {
      if (enemy.state === 'dead') return;

      const dx = (enemy.x - localX) * scale;
      const dy = (enemy.y - localY) * scale;
      const distSq = dx * dx + dy * dy;
      if (distSq > maxEnemyDistSq) return;

      const clusterX = Math.round(dx / MINIMAP_ENEMY_CLUSTER_SIZE_PX);
      const clusterY = Math.round(dy / MINIMAP_ENEMY_CLUSTER_SIZE_PX);
      const key = `${clusterX},${clusterY}`;
      const cluster = enemyClusters.get(key);
      if (cluster) {
        cluster.count += 1;
        return;
      }

      if (enemyClusters.size >= MINIMAP_MAX_ENEMY_MARKERS) {
        return;
      }

      enemyClusters.set(key, {
        x: clusterX * MINIMAP_ENEMY_CLUSTER_SIZE_PX,
        y: clusterY * MINIMAP_ENEMY_CLUSTER_SIZE_PX,
        count: 1,
      });
    });

    for (const cluster of enemyClusters.values()) {
      const radius = cluster.count >= 12 ? 2.6 : cluster.count >= 5 ? 2.1 : 1.5;
      g.fillCircle(this.screenX + cluster.x, this.screenY + cluster.y, radius);
    }

    // Draw bosses (purple dots, larger)
    g.fillStyle(0xaa66ff, 1);
    for (const boss of bossEntities.values()) {
      if (boss.serverState === 'dead') continue;
      this.drawDot(g, localX, localY, boss.x, boss.y, scale, 4);
    }

    // Draw other players (green dots)
    g.fillStyle(0x44ff44, 0.9);
    for (const [id, player] of playerEntities) {
      if (id === localPlayerId) continue;
      if (player.serverState === 'dead') continue;
      this.drawDot(g, localX, localY, player.sprite.x, player.sprite.y, scale, 2);
    }

    // Draw portals (different colors by direction)
    for (const portal of portalEntities.values()) {
      const isAdvancePortal =
        portal.kind === PORTAL_KINDS.PHASE1_TO_PHASE2 ||
        portal.kind === PORTAL_KINDS.PHASE2_TO_PHASE3 ||
        portal.kind === PORTAL_KINDS.PHASE3_TO_PHASE4;
      g.fillStyle(isAdvancePortal ? 0xc98a3a : 0x4aa3ff, 0.95);
      this.drawDot(g, localX, localY, portal.x, portal.y, scale, 2.4);
    }

    // Draw local player (white dot, center)
    g.fillStyle(0xffffff, 1);
    g.fillCircle(this.screenX, this.screenY, 3);
  }

  private drawDot(
    g: Phaser.GameObjects.Graphics,
    localX: number,
    localY: number,
    entityX: number,
    entityY: number,
    scale: number,
    radius: number
  ): void {
    const dx = (entityX - localX) * scale;
    const dy = (entityY - localY) * scale;
    const distSq = dx * dx + dy * dy;
    const maxDist = MINIMAP_RADIUS - radius;
    const maxDistSq = maxDist * maxDist;

    if (distSq > maxDistSq) return;

    g.fillCircle(this.screenX + dx, this.screenY + dy, radius);
  }

  private updateScreenPosition(camera: Phaser.Cameras.Scene2D.Camera): void {
    this.screenX = camera.width - MINIMAP_RADIUS - MINIMAP_PADDING;
    this.screenY = camera.height - MINIMAP_RADIUS - MINIMAP_PADDING;
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
