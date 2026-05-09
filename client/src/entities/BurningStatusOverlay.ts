import Phaser from 'phaser';

const FIRE_FIELD_GIF_PATH = '/assets/sprites/fields/Fire_Field.gif';
const BURNING_OVERLAY_ALPHA = 0.52;
const DEFAULT_BURNING_OVERLAY_SIZE_PX = 58;

interface BurningStatusOverlayOptions {
  sizePx?: number;
  offsetY?: number;
  depth?: number;
}

export class BurningStatusOverlay {
  private readonly overlay: Phaser.GameObjects.DOMElement;
  private readonly offsetY: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    { sizePx = DEFAULT_BURNING_OVERLAY_SIZE_PX, offsetY = 0, depth = 13 }: BurningStatusOverlayOptions = {}
  ) {
    this.offsetY = offsetY;

    const image = document.createElement('img');
    image.src = FIRE_FIELD_GIF_PATH;
    image.alt = 'Burning effect';
    image.draggable = false;
    image.style.width = `${sizePx}px`;
    image.style.height = `${sizePx}px`;
    image.style.pointerEvents = 'none';
    image.style.userSelect = 'none';
    image.style.opacity = `${BURNING_OVERLAY_ALPHA}`;

    this.overlay = scene.add.dom(x, y + offsetY, image);
    this.overlay.setDepth(depth);
    this.overlay.setAlpha(BURNING_OVERLAY_ALPHA);
    this.overlay.setOrigin(0.5, 0.5);
    this.overlay.setVisible(false);
  }

  sync(x: number, y: number, visible: boolean): void {
    this.overlay.x = x;
    this.overlay.y = y + this.offsetY;
    this.overlay.setVisible(visible);
  }

  destroy(): void {
    this.overlay.destroy();
  }
}
