import Phaser from 'phaser';

const FIRE_FIELD_GIF_PATH = '/assets/sprites/fields/Fire_Field.gif';

export class FireFieldHazardEntity {
  element: Phaser.GameObjects.DOMElement;
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

    this.element = scene.add.dom(x, y, img);
    this.element.setDepth(4);
    this.element.setOrigin(0.5, 0.5);
  }

  updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  update(_dt: number): void {
    this.element.x = Phaser.Math.Linear(this.element.x, this.targetX, 0.2);
    this.element.y = Phaser.Math.Linear(this.element.y, this.targetY, 0.2);
  }

  destroy(): void {
    this.element.destroy();
  }
}
