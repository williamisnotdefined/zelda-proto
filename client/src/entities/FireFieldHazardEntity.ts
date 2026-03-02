import Phaser from 'phaser';

const FIRE_FIELD_HIT_RADIUS = 18;
const FIRE_FIELD_SPRITE_OFFSET_X = -6;
const FIRE_FIELD_SPRITE_OFFSET_Y = -6;
const HIT_ZONE_COLOR = 0xff3b30;
const HIT_ZONE_ALPHA = 0.22;
const HIT_ZONE_STROKE_ALPHA = 0.8;
const LERP_BASE = 0.28;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 140;

export class FireFieldHazardEntity {
  sprite: Phaser.GameObjects.Image;
  hitZone: Phaser.GameObjects.Arc;
  private targetX: number;
  private targetY: number;
  private pulseTween: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;

    this.sprite = scene.add.image(
      x + FIRE_FIELD_SPRITE_OFFSET_X,
      y + FIRE_FIELD_SPRITE_OFFSET_Y,
      'fire_field'
    );
    this.sprite.setDepth(4);
    this.sprite.setAlpha(0.7);

    this.pulseTween = scene.tweens.add({
      targets: this.sprite,
      alpha: 0.86,
      scale: 1.05,
      duration: 240,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

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
    this.pulseTween.stop();
    this.sprite.destroy();
    this.hitZone.destroy();
  }
}
