import Phaser from 'phaser';

const FIRE_FIELD_GIF_PATH = '/assets/sprites/fields/Fire_Field.gif';
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
  element: Phaser.GameObjects.DOMElement;
  hitZone: Phaser.GameObjects.Arc;
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;

    const img = document.createElement('img');
    img.src = FIRE_FIELD_GIF_PATH;
    img.alt = 'Fire field';
    img.draggable = false;
    img.style.width = '58px';
    img.style.height = '58px';
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';
    img.style.opacity = '0.7';

    this.element = scene.add.dom(
      x + FIRE_FIELD_SPRITE_OFFSET_X,
      y + FIRE_FIELD_SPRITE_OFFSET_Y,
      img
    );
    this.element.setDepth(4);
    this.element.setOrigin(0.5, 0.5);

    this.hitZone = scene.add.circle(x, y, FIRE_FIELD_HIT_RADIUS, HIT_ZONE_COLOR, HIT_ZONE_ALPHA);
    this.hitZone.setStrokeStyle(2, HIT_ZONE_COLOR, HIT_ZONE_STROKE_ALPHA);
    this.hitZone.setDepth(3.9);
  }

  updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  get x(): number {
    return this.element.x - FIRE_FIELD_SPRITE_OFFSET_X;
  }

  get y(): number {
    return this.element.y - FIRE_FIELD_SPRITE_OFFSET_Y;
  }

  update(dt: number, inView: boolean): void {
    this.element.setVisible(inView);
    this.hitZone.setVisible(inView);
    if (!inView) {
      return;
    }

    const targetX = this.targetX + FIRE_FIELD_SPRITE_OFFSET_X;
    const targetY = this.targetY + FIRE_FIELD_SPRITE_OFFSET_Y;
    const dx = targetX - this.element.x;
    const dy = targetY - this.element.y;

    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.element.x = targetX;
      this.element.y = targetY;
    } else {
      const dtMs = Math.min(dt, MAX_LERP_DT_MS);
      const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
      this.element.x += dx * factor;
      this.element.y += dy * factor;
    }

    this.hitZone.x = this.element.x - FIRE_FIELD_SPRITE_OFFSET_X;
    this.hitZone.y = this.element.y - FIRE_FIELD_SPRITE_OFFSET_Y;
  }

  destroy(): void {
    this.element.destroy();
    this.hitZone.destroy();
  }
}
