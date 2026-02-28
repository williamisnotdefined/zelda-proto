import Phaser from 'phaser';

const LERP_BASE = 0.35;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 120;

export class DropEntity {
  sprite: Phaser.GameObjects.Sprite;
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, _kind: string) {
    this.sprite = scene.add.sprite(x, y, 'heart');
    this.sprite.setDepth(5);
    this.targetX = x;
    this.targetY = y;
  }

  updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  update(dt: number): void {
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > SNAP_DISTANCE) {
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;
      return;
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
    this.sprite.x += (this.targetX - this.sprite.x) * factor;
    this.sprite.y += (this.targetY - this.sprite.y) * factor;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
