import type { PlayerStatusSnapshot } from '@/shared';
import Phaser from 'phaser';
import {
  BLUE_BURNING_GIF_PATH,
  BURNING_OVERLAY_ALPHA,
  BURNING_OVERLAY_OFFSET_FROM_HIT_CENTER,
  BURNING_OVERLAY_SIZE_PX,
  BURNING_OVERLAY_STACK_STEP,
  FIRE_FIELD_GIF_PATH,
  PURPLE_FIRE_FIELD_GIF_PATH,
  SPRITE_Y_OFFSET,
} from './playerVisualConfig';

type KnownStatusKey = 'burning' | 'purpleBurning' | 'blueBurning';

type StatusOverlayConfig = {
  key: KnownStatusKey;
  gifPath: string;
  alt: string;
  depth: number;
};

type StatusOverlaySlot = StatusOverlayConfig & {
  overlay: Phaser.GameObjects.DOMElement | null;
};

const STATUS_OVERLAY_CONFIGS: StatusOverlayConfig[] = [
  {
    key: 'burning',
    gifPath: FIRE_FIELD_GIF_PATH,
    alt: 'Burning effect',
    depth: 13,
  },
  {
    key: 'purpleBurning',
    gifPath: PURPLE_FIRE_FIELD_GIF_PATH,
    alt: 'Purple burning effect',
    depth: 13.2,
  },
  {
    key: 'blueBurning',
    gifPath: BLUE_BURNING_GIF_PATH,
    alt: 'Blue burning effect',
    depth: 13.1,
  },
];

function createBurningOverlay(
  scene: Phaser.Scene,
  x: number,
  y: number,
  gifPath: string,
  alt: string,
  depth: number
): Phaser.GameObjects.DOMElement {
  const image = document.createElement('img');
  image.src = gifPath;
  image.alt = alt;
  image.draggable = false;
  image.style.width = `${BURNING_OVERLAY_SIZE_PX}px`;
  image.style.height = `${BURNING_OVERLAY_SIZE_PX}px`;
  image.style.pointerEvents = 'none';
  image.style.userSelect = 'none';
  image.style.opacity = `${BURNING_OVERLAY_ALPHA}`;

  const overlay = scene.add.dom(x, y + BURNING_OVERLAY_OFFSET_FROM_HIT_CENTER, image);
  overlay.setDepth(depth);
  overlay.setAlpha(BURNING_OVERLAY_ALPHA);
  overlay.setOrigin(0.5, 0.5);
  overlay.setVisible(false);
  return overlay;
}

export class PlayerStatusOverlays {
  private readonly overlays: StatusOverlaySlot[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly initialX: number,
    private readonly initialY: number
  ) {
    this.overlays = STATUS_OVERLAY_CONFIGS.map((config) => ({
      ...config,
      overlay: null,
    }));
  }

  sync(spriteX: number, spriteY: number, statusEffects: PlayerStatusSnapshot): void {
    const baseBurnY = spriteY - SPRITE_Y_OFFSET + BURNING_OVERLAY_OFFSET_FROM_HIT_CENTER;
    let visibleIndex = 0;

    for (const slot of this.overlays) {
      const { key } = slot;
      if (!statusEffects[key]) {
        slot.overlay?.setVisible(false);
        continue;
      }

      const overlay = this.ensureOverlay(slot);
      overlay.x = spriteX;
      overlay.y = baseBurnY - visibleIndex * BURNING_OVERLAY_STACK_STEP;
      overlay.setVisible(true);
      visibleIndex += 1;
    }
  }

  destroy(): void {
    for (const slot of this.overlays) {
      slot.overlay?.destroy();
      slot.overlay = null;
    }
  }

  private ensureOverlay(slot: StatusOverlaySlot): Phaser.GameObjects.DOMElement {
    if (!slot.overlay) {
      slot.overlay = createBurningOverlay(
        this.scene,
        this.initialX,
        this.initialY,
        slot.gifPath,
        slot.alt,
        slot.depth
      );
    }

    return slot.overlay;
  }
}
