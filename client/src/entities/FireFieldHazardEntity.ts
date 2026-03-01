import Phaser from 'phaser';

const FIRE_FIELD_GIF_PATH = '/assets/sprites/fields/Fire_Field.gif';
const FIRE_FIELD_HIT_RADIUS = 18;
const FIRE_FIELD_SPRITE_OFFSET_X = -6;
const FIRE_FIELD_SPRITE_OFFSET_Y = -6;
const HIT_ZONE_COLOR = 0xff3b30;
const HIT_ZONE_ALPHA = 0.22;
const HIT_ZONE_STROKE_ALPHA = 0.8;

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

  update(_dt: number): void {
    this.element.x = Phaser.Math.Linear(
      this.element.x,
      this.targetX + FIRE_FIELD_SPRITE_OFFSET_X,
      0.2
    );
    this.element.y = Phaser.Math.Linear(
      this.element.y,
      this.targetY + FIRE_FIELD_SPRITE_OFFSET_Y,
      0.2
    );
    this.hitZone.x = this.element.x - FIRE_FIELD_SPRITE_OFFSET_X;
    this.hitZone.y = this.element.y - FIRE_FIELD_SPRITE_OFFSET_Y;
  }

  destroy(): void {
    this.element.destroy();
    this.hitZone.destroy();
  }
}
