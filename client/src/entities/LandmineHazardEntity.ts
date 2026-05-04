import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import { HAZARD_KINDS, type HazardKind } from '@/shared';
import Phaser from 'phaser';

const LANDMINE_HIT_RADIUS = 18;
const LANDMINE_EXPLOSION_RADIUS = 180;
const LANDMINE_COLOR = 0xe2c85b;
const LANDMINE_EXPLOSION_COLOR = 0xffd36b;
const LANDMINE_ALPHA = 0.12;
const LANDMINE_STROKE_ALPHA = 0.35;
const EXPLOSION_ALPHA = 0.12;
const EXPLOSION_STROKE_ALPHA = 0.45;
const EXPLOSION_DURATION_MS = 420;
const LERP_BASE = 0.28;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 140;
const LANDMINE_DISPLAY_WIDTH = 24;
const LANDMINE_DISPLAY_HEIGHT = 34;
const LANDMINE_EXPLOSION_DISPLAY_WIDTH = 183;
const LANDMINE_EXPLOSION_DISPLAY_HEIGHT = 225;

export class LandmineHazardEntity {
  sprite: Phaser.GameObjects.Sprite;
  zone: Phaser.GameObjects.Arc;
  private targetX: number;
  private targetY: number;
  private readonly exploding: boolean;
  private explosionElapsedMs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    kind: HazardKind
  ) {
    this.targetX = x;
    this.targetY = y;
    this.exploding = kind === HAZARD_KINDS.LANDMINE_EXPLOSION;

    this.sprite = scene.add.sprite(
      x,
      y,
      this.exploding ? 'explosion' : 'landmine',
      this.exploding ? '0' : undefined
    );
    this.sprite.setDisplaySize(
      this.exploding ? LANDMINE_EXPLOSION_DISPLAY_WIDTH : LANDMINE_DISPLAY_WIDTH,
      this.exploding ? LANDMINE_EXPLOSION_DISPLAY_HEIGHT : LANDMINE_DISPLAY_HEIGHT
    );
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(this.exploding ? 10.25 : 10.15);
    if (this.exploding) {
      this.sprite.setBlendMode('ADD');
      this.sprite.play('explosion');
    }

    this.zone = scene.add.circle(
      x,
      y,
      this.exploding ? LANDMINE_EXPLOSION_RADIUS : LANDMINE_HIT_RADIUS,
      this.exploding ? LANDMINE_EXPLOSION_COLOR : LANDMINE_COLOR,
      this.exploding ? EXPLOSION_ALPHA : LANDMINE_ALPHA
    );
    this.zone.setStrokeStyle(
      2,
      this.exploding ? LANDMINE_EXPLOSION_COLOR : LANDMINE_COLOR,
      this.exploding ? EXPLOSION_STROKE_ALPHA : LANDMINE_STROKE_ALPHA
    );
    this.zone.setDepth(this.exploding ? 10.05 : 10.04);
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
    this.zone.setVisible(inView);
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

    this.zone.x = this.sprite.x;
    this.zone.y = this.sprite.y;

    if (this.exploding) {
      this.explosionElapsedMs = Math.min(this.explosionElapsedMs + dt, EXPLOSION_DURATION_MS);
      const progress = this.explosionElapsedMs / EXPLOSION_DURATION_MS;
      this.zone.setFillStyle(LANDMINE_EXPLOSION_COLOR, EXPLOSION_ALPHA * (1 - progress));
      this.zone.setStrokeStyle(
        2,
        LANDMINE_EXPLOSION_COLOR,
        EXPLOSION_STROKE_ALPHA * (1 - progress)
      );
      this.sprite.setAlpha(1 - progress * 0.22);
      return;
    }

    const pulse = 0.08 + 0.02 * Math.sin(this.scene.time.now / 160);
    this.zone.setFillStyle(LANDMINE_COLOR, pulse);
  }

  destroy(): void {
    this.sprite.destroy();
    this.zone.destroy();
  }
}
