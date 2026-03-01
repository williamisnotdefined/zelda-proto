import Phaser from 'phaser';

const PORTAL_GIF_PATH = '/assets/sprites/teleports/Magic_Forcefield_Blue.gif';
const PORTAL_SIZE_PX = 64;

export class PortalEntity {
  element: Phaser.GameObjects.DOMElement;
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;

    const img = document.createElement('img');
    img.src = PORTAL_GIF_PATH;
    img.alt = 'Portal';
    img.draggable = false;
    img.style.width = `${PORTAL_SIZE_PX}px`;
    img.style.height = `${PORTAL_SIZE_PX}px`;
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';

    this.element = scene.add.dom(x, y, img);
    this.element.setDepth(6);
    this.element.setOrigin(0.5, 0.5);
  }

  updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  update(_dt: number): void {
    this.element.x = Phaser.Math.Linear(this.element.x, this.targetX, 0.25);
    this.element.y = Phaser.Math.Linear(this.element.y, this.targetY, 0.25);
  }

  destroy(): void {
    this.element.destroy();
  }
}
