import type { Direction } from '@/shared';
import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import type Phaser from 'phaser';

const FIREBALL_HIT_RADIUS = 18;
const FIREBALL_COLOR = 0xff8a3d;
const FIREBALL_GLOW_ALPHA = 0.14;
const FIREBALL_GLOW_STROKE_ALPHA = 0.45;
const LERP_BASE = 0.28;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 140;
const FIREBALL_DISPLAY_SIZE = 48;

const FIREBALL_FRAME_BY_DIRECTION: Record<Direction, number> = {
  up: 0,
  right: 1,
  left: 2,
  down: 3,
};

export class FireballHazardEntity {
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Arc;
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, direction: Direction = 'right') {
    this.targetX = x;
    this.targetY = y;

    this.sprite = scene.add.image(x, y, 'fireball', FIREBALL_FRAME_BY_DIRECTION[direction]);
    this.sprite.setDisplaySize(FIREBALL_DISPLAY_SIZE, FIREBALL_DISPLAY_SIZE);
    this.sprite.setBlendMode('ADD');
    this.sprite.setDepth(10.2);

    this.glow = scene.add.circle(x, y, FIREBALL_HIT_RADIUS, FIREBALL_COLOR, FIREBALL_GLOW_ALPHA);
    this.glow.setStrokeStyle(2, FIREBALL_COLOR, FIREBALL_GLOW_STROKE_ALPHA);
    this.glow.setDepth(10.1);
  }

  updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  update(dt: number, inView: boolean): void {
    this.sprite.setVisible(inView);
    this.glow.setVisible(inView);
    if (!inView) {
      return;
    }

    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;

    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;
    } else {
      const dtMs = Math.min(dt, MAX_LERP_DT_MS);
      const factor = getExponentialInterpolationFactor(LERP_BASE, dtMs);
      this.sprite.x += dx * factor;
      this.sprite.y += dy * factor;
    }

    this.glow.x = this.sprite.x;
    this.glow.y = this.sprite.y;
  }

  destroy(): void {
    this.sprite.destroy();
    this.glow.destroy();
  }
}
