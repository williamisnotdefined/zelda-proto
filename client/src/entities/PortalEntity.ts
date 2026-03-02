import Phaser from 'phaser';

const PORTAL_GIF_PATH = '/assets/sprites/teleports/Magic_Forcefield_Blue.gif';
const PORTAL_SIZE_PX = 36;
const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;

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

  get x(): number {
    return this.element.x;
  }

  get y(): number {
    return this.element.y;
  }

  update(dt: number, inView: boolean): void {
    this.element.setVisible(inView);
    if (!inView) {
      return;
    }

    const dx = this.targetX - this.element.x;
    const dy = this.targetY - this.element.y;
    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.element.x = this.targetX;
      this.element.y = this.targetY;
      return;
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
    this.element.x += dx * factor;
    this.element.y += dy * factor;
  }

  destroy(): void {
    this.element.destroy();
  }
}
