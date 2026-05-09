import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import Phaser from 'phaser';

const LERP_BASE = 0.35;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 120;
const FOOD_FRAME_SIZE = 32;
const SMALL_FOOD_DISPLAY_SIZE = 16;
const LARGE_FOOD_DISPLAY_SIZE = 32;

const FOOD_FRAME_COORDS = [
  [2, 2],
  [38, 2],
  [74, 2],
  [110, 2],
  [146, 2],
  [182, 2],
  [218, 2],
  [254, 2],
  [290, 2],
  [326, 2],
  [362, 2],
  [398, 2],
  [434, 2],
  [470, 2],
  [2, 38],
  [38, 38],
  [74, 38],
  [110, 38],
  [146, 38],
  [182, 38],
  [218, 38],
  [254, 38],
  [290, 38],
  [326, 38],
  [362, 38],
  [398, 38],
  [434, 38],
  [470, 38],
  [2, 76],
  [38, 76],
  [74, 76],
  [110, 76],
  [146, 76],
  [182, 76],
  [218, 76],
  [254, 76],
  [290, 76],
  [326, 76],
  [362, 76],
  [398, 76],
  [434, 76],
  [470, 76],
  [2, 110],
  [38, 110],
  [74, 110],
  [110, 110],
  [146, 110],
  [182, 110],
  [218, 110],
  [254, 110],
  [290, 110],
  [326, 110],
  [362, 110],
  [398, 110],
  [434, 110],
  [470, 110],
  [2, 146],
  [38, 146],
  [74, 146],
  [110, 146],
  [146, 146],
  [182, 146],
  [218, 146],
  [254, 146],
  [290, 146],
  [326, 146],
  [362, 146],
  [398, 146],
  [434, 146],
  [470, 146],
  [2, 182],
  [38, 182],
  [74, 182],
  [110, 182],
  [146, 182],
  [182, 182],
  [218, 182],
  [254, 182],
  [290, 182],
  [326, 182],
  [362, 182],
  [398, 182],
  [434, 182],
  [470, 182],
  [2, 218],
  [38, 218],
  [74, 218],
  [110, 218],
  [146, 218],
  [182, 218],
  [218, 218],
  [254, 218],
  [290, 218],
  [326, 218],
  [362, 218],
  [398, 218],
  [434, 218],
  [470, 218],
  [2, 254],
  [38, 254],
  [74, 254],
  [110, 254],
  [146, 254],
  [182, 254],
  [218, 254],
  [254, 254],
  [290, 254],
  [326, 254],
  [362, 254],
  [398, 254],
  [434, 254],
  [470, 254],
  [2, 290],
  [38, 290],
  [74, 290],
  [110, 290],
  [146, 290],
  [182, 290],
  [218, 290],
  [254, 290],
  [290, 290],
  [326, 290],
  [362, 290],
  [398, 290],
  [434, 290],
  [470, 290],
  [2, 326],
  [38, 326],
  [74, 326],
  [110, 326],
  [146, 326],
  [182, 326],
  [218, 326],
  [254, 326],
  [290, 326],
  [326, 326],
  [362, 326],
  [398, 326],
  [434, 326],
  [470, 326],
  [2, 362],
  [38, 362],
  [74, 362],
  [110, 362],
  [146, 362],
  [182, 362],
  [218, 362],
  [254, 362],
  [290, 362],
  [326, 362],
  [362, 362],
  [398, 362],
  [434, 362],
  [470, 362],
  [2, 398],
  [38, 398],
  [74, 398],
  [110, 398],
  [146, 398],
  [182, 398],
  [218, 398],
  [254, 398],
  [290, 398],
  [326, 398],
  [362, 398],
  [398, 398],
  [434, 398],
  [470, 398],
  [2, 434],
  [38, 434],
  [74, 434],
  [110, 434],
  [146, 434],
  [182, 434],
  [218, 434],
  [254, 434],
  [290, 434],
  [326, 434],
  [362, 434],
  [398, 434],
  [434, 434],
  [470, 434],
  [2, 472],
  [38, 472],
  [74, 472],
  [110, 472],
  [146, 472],
  [182, 472],
] as const;

import { DROP_KINDS } from '@/shared';
import type { DropKind } from '@/shared';

export class DropEntity {
  sprite: Phaser.GameObjects.Image;
  private targetX: number;
  private targetY: number;
  private kind: DropKind;
  private visible: boolean;

  constructor(scene: Phaser.Scene, id: string, x: number, y: number, kind: DropKind) {
    this.kind = kind;
    const usesLargeFoodSprite =
      this.kind === DROP_KINDS.FOOD_LARGE || this.kind === DROP_KINDS.FOOD_PACMAN;
    const [frameX, frameY] = FOOD_FRAME_COORDS[getStableFoodFrameIndex(id)];
    this.sprite = scene.add.image(x, y, 'food');
    this.sprite.setCrop(frameX, frameY, FOOD_FRAME_SIZE, FOOD_FRAME_SIZE);
    this.sprite.setDisplaySize(
      usesLargeFoodSprite ? LARGE_FOOD_DISPLAY_SIZE : SMALL_FOOD_DISPLAY_SIZE,
      usesLargeFoodSprite ? LARGE_FOOD_DISPLAY_SIZE : SMALL_FOOD_DISPLAY_SIZE
    );
    this.sprite.setDepth(5);
    this.targetX = x;
    this.targetY = y;
    this.visible = true;
  }

  updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  update(dt: number, inView: boolean): void {
    this.setVisible(inView);
    if (!inView) {
      return;
    }

    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    if (Math.abs(dx) <= 0.05 && Math.abs(dy) <= 0.05) {
      return;
    }

    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;
      return;
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = getExponentialInterpolationFactor(LERP_BASE, dtMs);
    this.sprite.x += (this.targetX - this.sprite.x) * factor;
    this.sprite.y += (this.targetY - this.sprite.y) * factor;
  }

  private setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return;
    }

    this.sprite.setVisible(visible);
    this.visible = visible;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

function getStableFoodFrameIndex(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }

  return hash % FOOD_FRAME_COORDS.length;
}
