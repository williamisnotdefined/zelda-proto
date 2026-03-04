import Phaser from 'phaser';
import { BlobEntity } from '../entities/Blob';
import { BossDragonLordEntity } from '../entities/BossDragonLord';
import { BossGelehkEntity } from '../entities/BossGelehk';
import { BossPhase3Entity } from '../entities/BossPhase3';
import { HandEntity } from '../entities/Hand';
import { PlayerEntity } from '../entities/Player';
import { SlimeEntity } from '../entities/Slime';

type BossEntity = BossGelehkEntity | BossDragonLordEntity | BossPhase3Entity;

const MINIMAP_RADIUS = 60;
const MINIMAP_SCREEN_MULTIPLIER = 3;
const MINIMAP_MIN_WORLD_RANGE = 900;
const MINIMAP_MAX_WORLD_RANGE = 1800;
const MINIMAP_BG_ALPHA = 0.35;
const MINIMAP_PADDING = 14;

export class Minimap {
  private graphics: Phaser.GameObjects.Graphics;
  private screenX: number;
  private screenY: number;

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    this.screenX = cam.width - MINIMAP_RADIUS - MINIMAP_PADDING;
    this.screenY = cam.height - MINIMAP_RADIUS - MINIMAP_PADDING;

    this.graphics = scene.add.graphics();
    this.graphics.setScrollFactor(0);
    this.graphics.setDepth(100);
  }

  draw(
    localX: number,
    localY: number,
    playerEntities: Map<string, PlayerEntity>,
    blobEntities: Map<string, BlobEntity>,
    slimeEntities: Map<string, SlimeEntity>,
    handEntities: Map<string, HandEntity>,
    bossEntities: Map<string, BossEntity>,
    localPlayerId: string | null
  ): void {
    const g = this.graphics;
    const camera = this.graphics.scene.cameras.main;
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

    // Draw blobs (red dots)
    g.fillStyle(0xff4444, 0.9);
    for (const blob of blobEntities.values()) {
      if (blob.serverState === 'dead') continue;
      this.drawDot(g, localX, localY, blob.sprite.x, blob.sprite.y, scale, 1.5);
    }
    for (const slime of slimeEntities.values()) {
      if (slime.serverState === 'dead') continue;
      this.drawDot(g, localX, localY, slime.x, slime.y, scale, 1.5);
    }
    for (const hand of handEntities.values()) {
      if (hand.serverState === 'dead') continue;
      this.drawDot(g, localX, localY, hand.x, hand.y, scale, 1.5);
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

  destroy(): void {
    this.graphics.destroy();
  }
}
