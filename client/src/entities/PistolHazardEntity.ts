import type { Direction, HazardSnapshot } from '@/shared';
import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import type Phaser from 'phaser';

const PISTOL_HIT_RADIUS = 12;
const PISTOL_COLOR = 0xffb14d;
const PISTOL_GLOW_ALPHA = 0.16;
const PISTOL_GLOW_STROKE_ALPHA = 0.45;
const LERP_BASE = 0.34;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 100;
const PISTOL_SPRITE_WIDTH = 18;
const PISTOL_SPRITE_HEIGHT = 6;

const PISTOL_ANGLE_BY_DIRECTION: Record<Direction, number> = {
  up: -90,
  left: 180,
  down: 90,
  right: 0,
};

export class PistolHazardEntity {
  sprite: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Arc;
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, direction: Direction = 'right') {
    this.targetX = x;
    this.targetY = y;

    this.sprite = scene.add.rectangle(
      x,
      y,
      PISTOL_SPRITE_WIDTH,
      PISTOL_SPRITE_HEIGHT,
      PISTOL_COLOR
    );
    this.sprite.setDepth(10.24);
    this.sprite.setBlendMode('ADD');

    this.glow = scene.add.circle(
      x,
      y,
      PISTOL_HIT_RADIUS,
      PISTOL_COLOR,
      PISTOL_GLOW_ALPHA
    );
    this.glow.setStrokeStyle(2, PISTOL_COLOR, PISTOL_GLOW_STROKE_ALPHA);
    this.glow.setDepth(10.23);

    this.syncDirection(direction);
  }

  syncSnapshot(snapshot: HazardSnapshot): void {
    this.targetX = snapshot.x;
    this.targetY = snapshot.y;
    if (snapshot.direction) {
      this.syncDirection(snapshot.direction);
    }
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

  private syncDirection(direction: Direction): void {
    this.sprite.setAngle(PISTOL_ANGLE_BY_DIRECTION[direction]);
  }
}
