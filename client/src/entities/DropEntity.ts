import Phaser from 'phaser';

export class DropEntity {
  sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, x: number, y: number, _kind: string) {
    this.sprite = scene.add.sprite(x, y, 'heart');
    this.sprite.setDepth(5);
  }

  updatePosition(x: number, y: number): void {
    this.sprite.x = x;
    this.sprite.y = y;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
