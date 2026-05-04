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
const LANDMINE_EXPLOSION_DISPLAY_WIDTH = 221;
const LANDMINE_EXPLOSION_DISPLAY_HEIGHT = 241;
const LANDMINE_EXPLOSION_TEXTURE_KEYS = [
  'explosion_0',
  'explosion_1',
  'explosion_2',
  'explosion_3',
  'explosion_4',
  'explosion_5',
  'explosion_6',
] as const;
const LANDMINE_EXPLOSION_FIRST_TEXTURE_KEY = LANDMINE_EXPLOSION_TEXTURE_KEYS[0];
const LANDMINE_EXPLOSION_BOTTOM_TRIM_PX = 8;
const LANDMINE_EXPLOSION_ORIGIN_Y =
  1 -
  (LANDMINE_DISPLAY_HEIGHT / 2 + LANDMINE_EXPLOSION_BOTTOM_TRIM_PX) /
    LANDMINE_EXPLOSION_DISPLAY_HEIGHT;
const LANDMINE_EXPLOSION_FRAME_DURATION_MS =
  EXPLOSION_DURATION_MS / LANDMINE_EXPLOSION_TEXTURE_KEYS.length;

export class LandmineHazardEntity {
  sprite: Phaser.GameObjects.Image;
  zone: Phaser.GameObjects.Arc;
  private targetX: number;
  private targetY: number;
  private readonly exploding: boolean;
  private explosionElapsedMs = 0;
  private explosionFinished = false;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    kind: HazardKind
  ) {
    this.targetX = x;
    this.targetY = y;
    this.exploding = kind === HAZARD_KINDS.LANDMINE_EXPLOSION;

    const spriteX = this.exploding ? Math.round(x) : x;
    const spriteY = this.exploding ? Math.round(y) : y;

    this.sprite = scene.add.image(
      spriteX,
      spriteY,
      this.exploding ? LANDMINE_EXPLOSION_FIRST_TEXTURE_KEY : 'landmine'
    );
    this.sprite.setDisplaySize(
      this.exploding ? LANDMINE_EXPLOSION_DISPLAY_WIDTH : LANDMINE_DISPLAY_WIDTH,
      this.exploding ? LANDMINE_EXPLOSION_DISPLAY_HEIGHT : LANDMINE_DISPLAY_HEIGHT
    );
    this.sprite.setOrigin(0.5, this.exploding ? LANDMINE_EXPLOSION_ORIGIN_Y : 0.5);
    this.sprite.setDepth(this.exploding ? 10.25 : 10.15);

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
    if (this.exploding && this.explosionFinished) {
      this.sprite.setVisible(false);
      this.zone.setVisible(false);
      return;
    }

    this.sprite.setVisible(inView);
    this.zone.setVisible(inView);
    if (!inView) {
      return;
    }

    if (this.exploding) {
      const spriteX = Math.round(this.targetX);
      const spriteY = Math.round(this.targetY);

      this.sprite.setPosition(spriteX, spriteY);
      this.zone.x = spriteX;
      this.zone.y = spriteY;

      this.explosionElapsedMs = Math.min(this.explosionElapsedMs + dt, EXPLOSION_DURATION_MS);
      const frameIndex = Math.min(
        Math.floor(this.explosionElapsedMs / LANDMINE_EXPLOSION_FRAME_DURATION_MS),
        LANDMINE_EXPLOSION_TEXTURE_KEYS.length - 1
      );
      const textureKey = LANDMINE_EXPLOSION_TEXTURE_KEYS[frameIndex];

      if (this.sprite.texture.key !== textureKey) {
        this.sprite.setTexture(textureKey);
      }

      const progress = this.explosionElapsedMs / EXPLOSION_DURATION_MS;
      this.zone.setFillStyle(LANDMINE_EXPLOSION_COLOR, EXPLOSION_ALPHA * (1 - progress));
      this.zone.setStrokeStyle(
        2,
        LANDMINE_EXPLOSION_COLOR,
        EXPLOSION_STROKE_ALPHA * (1 - progress)
      );
      this.sprite.setAlpha(1 - progress * 0.22);

      if (this.explosionElapsedMs >= EXPLOSION_DURATION_MS) {
        this.explosionFinished = true;
        this.sprite.setVisible(false);
        this.zone.setVisible(false);
      }

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

    const pulse = 0.08 + 0.02 * Math.sin(this.scene.time.now / 160);
    this.zone.setFillStyle(LANDMINE_COLOR, pulse);
  }

  destroy(): void {
    this.sprite.destroy();
    this.zone.destroy();
  }
}
