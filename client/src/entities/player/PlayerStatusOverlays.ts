import type { PlayerStatusSnapshot } from '@/shared';
import Phaser from 'phaser';
import {
  BLUE_FLAME_ANIMATION_KEY,
  BLUE_FLAME_TEXTURE_KEY,
  BURNING_OVERLAY_ALPHA,
  BURNING_OVERLAY_OFFSET_FROM_HIT_CENTER,
  BURNING_OVERLAY_SIZE_PX,
  BURNING_OVERLAY_STACK_STEP,
  FIRE_FIELD_ANIMATION_KEY,
  FIRE_FIELD_TEXTURE_KEY,
  PURPLE_FIELD_ANIMATION_KEY,
  PURPLE_FIELD_TEXTURE_KEY,
  SPRITE_Y_OFFSET,
} from './playerVisualConfig';

type KnownStatusKey = 'burning' | 'purpleBurning' | 'blueBurning';

type StatusOverlayConfig = {
  key: KnownStatusKey;
  textureKey: string;
  animationKey: string;
  depth: number;
};

type StatusOverlaySlot = StatusOverlayConfig & {
  overlay: Phaser.GameObjects.Sprite | null;
};

const STATUS_OVERLAY_CONFIGS: StatusOverlayConfig[] = [
  {
    key: 'burning',
    textureKey: FIRE_FIELD_TEXTURE_KEY,
    animationKey: FIRE_FIELD_ANIMATION_KEY,
    depth: 13,
  },
  {
    key: 'purpleBurning',
    textureKey: PURPLE_FIELD_TEXTURE_KEY,
    animationKey: PURPLE_FIELD_ANIMATION_KEY,
    depth: 13.2,
  },
  {
    key: 'blueBurning',
    textureKey: BLUE_FLAME_TEXTURE_KEY,
    animationKey: BLUE_FLAME_ANIMATION_KEY,
    depth: 13.1,
  },
];

function createBurningOverlay(
  scene: Phaser.Scene,
  x: number,
  y: number,
  textureKey: string,
  animationKey: string,
  depth: number
): Phaser.GameObjects.Sprite {
  const overlay = scene.add.sprite(x, y + BURNING_OVERLAY_OFFSET_FROM_HIT_CENTER, textureKey);
  overlay.setDepth(depth);
  overlay.setAlpha(BURNING_OVERLAY_ALPHA);
  overlay.setOrigin(0.5, 0.5);
  overlay.setDisplaySize(BURNING_OVERLAY_SIZE_PX, BURNING_OVERLAY_SIZE_PX);
  overlay.setVisible(false);
  overlay.play(animationKey);
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

  private ensureOverlay(slot: StatusOverlaySlot): Phaser.GameObjects.Sprite {
    if (!slot.overlay) {
      slot.overlay = createBurningOverlay(
        this.scene,
        this.initialX,
        this.initialY,
        slot.textureKey,
        slot.animationKey,
        slot.depth
      );
    }

    return slot.overlay;
  }
}
