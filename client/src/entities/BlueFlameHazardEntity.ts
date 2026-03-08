import Phaser from 'phaser';

const FIRE_FIELD_HIT_RADIUS = 18;
const FIRE_FIELD_SPRITE_OFFSET_X = -6;
const FIRE_FIELD_SPRITE_OFFSET_Y = -6;
const HIT_ZONE_COLOR = 0x58a6ff;
const HIT_ZONE_ALPHA = 0.14;
const HIT_ZONE_STROKE_ALPHA = 0.45;
const LERP_BASE = 0.28;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 140;
const BLUE_FLAME_ALPHA = 0.62;

export class BlueFlameHazardEntity {
  sprite: Phaser.GameObjects.Image;
  hitZone: Phaser.GameObjects.Arc;
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;

    this.sprite = scene.add.image(
      x + FIRE_FIELD_SPRITE_OFFSET_X,
      y + FIRE_FIELD_SPRITE_OFFSET_Y,
      'blue_flame'
    );
    this.sprite.setDepth(4);
    this.sprite.setAlpha(BLUE_FLAME_ALPHA);

    this.hitZone = scene.add.circle(x, y, FIRE_FIELD_HIT_RADIUS, HIT_ZONE_COLOR, HIT_ZONE_ALPHA);
    this.hitZone.setStrokeStyle(2, HIT_ZONE_COLOR, HIT_ZONE_STROKE_ALPHA);
    this.hitZone.setDepth(3.9);
  }

  updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  get x(): number {
    return this.sprite.x - FIRE_FIELD_SPRITE_OFFSET_X;
  }

  get y(): number {
    return this.sprite.y - FIRE_FIELD_SPRITE_OFFSET_Y;
  }

  update(dt: number, inView: boolean): void {
    this.sprite.setVisible(inView);
    this.hitZone.setVisible(inView);
    if (!inView) {
      return;
    }

    const targetX = this.targetX + FIRE_FIELD_SPRITE_OFFSET_X;
    const targetY = this.targetY + FIRE_FIELD_SPRITE_OFFSET_Y;
    const dx = targetX - this.sprite.x;
    const dy = targetY - this.sprite.y;

    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.sprite.x = targetX;
      this.sprite.y = targetY;
    } else {
      const dtMs = Math.min(dt, MAX_LERP_DT_MS);
      const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
      this.sprite.x += dx * factor;
      this.sprite.y += dy * factor;
    }

    this.hitZone.x = this.sprite.x - FIRE_FIELD_SPRITE_OFFSET_X;
    this.hitZone.y = this.sprite.y - FIRE_FIELD_SPRITE_OFFSET_Y;
  }

  destroy(): void {
    this.sprite.destroy();
    this.hitZone.destroy();
  }
}
