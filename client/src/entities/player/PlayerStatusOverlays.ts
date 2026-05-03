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
  private readonly overlays: Array<{ key: KnownStatusKey; overlay: Phaser.GameObjects.DOMElement }>;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.overlays = [
      {
        key: 'burning',
        overlay: createBurningOverlay(scene, x, y, FIRE_FIELD_GIF_PATH, 'Burning effect', 13),
      },
      {
        key: 'purpleBurning',
        overlay: createBurningOverlay(
          scene,
          x,
          y,
          PURPLE_FIRE_FIELD_GIF_PATH,
          'Purple burning effect',
          13.2
        ),
      },
      {
        key: 'blueBurning',
        overlay: createBurningOverlay(
          scene,
          x,
          y,
          BLUE_BURNING_GIF_PATH,
          'Blue burning effect',
          13.1
        ),
      },
    ];
  }

  sync(spriteX: number, spriteY: number, statusEffects: PlayerStatusSnapshot): void {
    const baseBurnY = spriteY - SPRITE_Y_OFFSET + BURNING_OVERLAY_OFFSET_FROM_HIT_CENTER;
    let visibleIndex = 0;

    for (const { key, overlay } of this.overlays) {
      if (!statusEffects[key]) {
        overlay.setVisible(false);
        continue;
      }

      overlay.x = spriteX;
      overlay.y = baseBurnY - visibleIndex * BURNING_OVERLAY_STACK_STEP;
      overlay.setVisible(true);
      visibleIndex += 1;
    }
  }

  destroy(): void {
    for (const { overlay } of this.overlays) {
      overlay.destroy();
    }
  }
}
