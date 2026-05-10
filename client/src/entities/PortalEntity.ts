import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import Phaser from 'phaser';
import type { PortalKind } from '@/shared';
import { getPortalVisualConfig } from '../game/runtime/world/portalRegistry';

const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;

export class PortalEntity {
  sprite: Phaser.GameObjects.Sprite;
  kind: PortalKind;
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: PortalKind) {
    this.targetX = x;
    this.targetY = y;
    this.kind = kind;
    const visual = getPortalVisualConfig(kind);

    this.sprite = scene.add.sprite(x, y, visual.textureKey);
    this.sprite.setDepth(6);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDisplaySize(visual.sizePx, visual.sizePx);
    this.sprite.play(visual.animationKey);
  }

  updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  updateKind(kind: PortalKind): void {
    if (this.kind === kind) return;
    this.kind = kind;
    const visual = getPortalVisualConfig(kind);
    this.sprite.setTexture(visual.textureKey);
    this.sprite.setDisplaySize(visual.sizePx, visual.sizePx);
    this.sprite.play(visual.animationKey);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  update(dt: number, inView: boolean): void {
    this.sprite.setVisible(inView);
    if (!inView) {
      return;
    }

    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;
      return;
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = getExponentialInterpolationFactor(LERP_BASE, dtMs);
    this.sprite.x += dx * factor;
    this.sprite.y += dy * factor;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
