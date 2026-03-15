import Phaser from 'phaser';

const LERP_BASE = 0.35;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 120;

import { DROP_KINDS } from '@gelehka/shared';
import type { DropKind } from '@gelehka/shared';

export class DropEntity {
  sprite: Phaser.GameObjects.Sprite;
  private targetX: number;
  private targetY: number;
  private kind: DropKind;
  private visible: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: DropKind) {
    this.kind = kind;
    const usesLargeHeartSprite =
      this.kind === DROP_KINDS.HEART_LARGE || this.kind === DROP_KINDS.HEART_PACMAN;
    this.sprite = scene.add.sprite(x, y, usesLargeHeartSprite ? 'heart_large' : 'heart');
    this.sprite.setDepth(5);
    this.sprite.setScale(
      this.kind === DROP_KINDS.HEART_PACMAN ? 1 : usesLargeHeartSprite ? 0.8 : 1
    );
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
    const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
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
