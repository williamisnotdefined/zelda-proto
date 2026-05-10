import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import Phaser from 'phaser';

const FIELD_HAZARD_SPRITE_OFFSET_X = -6;
const FIELD_HAZARD_SPRITE_OFFSET_Y = -6;
const FIELD_HAZARD_HIT_ZONE_ALPHA = 0.14;
const FIELD_HAZARD_HIT_ZONE_STROKE_ALPHA = 0.45;
const LERP_BASE = 0.28;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 140;

interface FieldHazardConfig {
  textureKey: string;
  animationKey: string;
  alpha: number;
  hitRadius: number;
  hitZoneColor: number;
  sizePx?: number;
  tint?: number;
}

export class FieldHazardEntity {
  sprite: Phaser.GameObjects.Sprite;
  hitZone: Phaser.GameObjects.Arc;
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, config: FieldHazardConfig) {
    this.targetX = x;
    this.targetY = y;

    this.sprite = scene.add.sprite(
      x + FIELD_HAZARD_SPRITE_OFFSET_X,
      y + FIELD_HAZARD_SPRITE_OFFSET_Y,
      config.textureKey
    );
    this.sprite.setDepth(4);
    this.sprite.setAlpha(config.alpha);
    if (config.sizePx !== undefined) {
      this.sprite.setDisplaySize(config.sizePx, config.sizePx);
    }
    if (config.tint !== undefined) {
      this.sprite.setTint(config.tint);
    }
    this.sprite.play(config.animationKey);

    const hitZoneColor = config.tint ?? config.hitZoneColor;
    this.hitZone = scene.add.circle(
      x,
      y,
      config.hitRadius,
      hitZoneColor,
      FIELD_HAZARD_HIT_ZONE_ALPHA
    );
    this.hitZone.setStrokeStyle(2, hitZoneColor, FIELD_HAZARD_HIT_ZONE_STROKE_ALPHA);
    this.hitZone.setDepth(3.9);
  }

  updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  get x(): number {
    return this.sprite.x - FIELD_HAZARD_SPRITE_OFFSET_X;
  }

  get y(): number {
    return this.sprite.y - FIELD_HAZARD_SPRITE_OFFSET_Y;
  }

  update(dt: number, inView: boolean): void {
    this.sprite.setVisible(inView);
    this.hitZone.setVisible(inView);
    if (!inView) {
      return;
    }

    const targetX = this.targetX + FIELD_HAZARD_SPRITE_OFFSET_X;
    const targetY = this.targetY + FIELD_HAZARD_SPRITE_OFFSET_Y;
    const dx = targetX - this.sprite.x;
    const dy = targetY - this.sprite.y;

    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.sprite.x = targetX;
      this.sprite.y = targetY;
    } else {
      const dtMs = Math.min(dt, MAX_LERP_DT_MS);
      const factor = getExponentialInterpolationFactor(LERP_BASE, dtMs);
      this.sprite.x += dx * factor;
      this.sprite.y += dy * factor;
    }

    this.hitZone.x = this.sprite.x - FIELD_HAZARD_SPRITE_OFFSET_X;
    this.hitZone.y = this.sprite.y - FIELD_HAZARD_SPRITE_OFFSET_Y;
  }

  destroy(): void {
    this.sprite.destroy();
    this.hitZone.destroy();
  }
}
