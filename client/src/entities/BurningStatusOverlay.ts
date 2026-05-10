import Phaser from 'phaser';

const FIRE_FIELD_TEXTURE_KEY = 'fire_field';
const FIRE_FIELD_ANIMATION_KEY = 'fire_field_loop';
const BURNING_OVERLAY_ALPHA = 0.52;
const DEFAULT_BURNING_OVERLAY_SIZE_PX = 58;

interface BurningStatusOverlayOptions {
  sizePx?: number;
  offsetY?: number;
  depth?: number;
}

export class BurningStatusOverlay {
  private readonly overlay: Phaser.GameObjects.Sprite;
  private readonly offsetY: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    { sizePx = DEFAULT_BURNING_OVERLAY_SIZE_PX, offsetY = 0, depth = 13 }: BurningStatusOverlayOptions = {}
  ) {
    this.offsetY = offsetY;

    this.overlay = scene.add.sprite(x, y + offsetY, FIRE_FIELD_TEXTURE_KEY);
    this.overlay.setDepth(depth);
    this.overlay.setAlpha(BURNING_OVERLAY_ALPHA);
    this.overlay.setOrigin(0.5, 0.5);
    this.overlay.setDisplaySize(sizePx, sizePx);
    this.overlay.setVisible(false);
    this.overlay.play(FIRE_FIELD_ANIMATION_KEY);
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
