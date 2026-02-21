import Phaser from 'phaser';

const DROP_SIZE = 16;

export class DropEntity {
  sprite: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: string) {
    const color = kind === 'heal' ? 0xff6688 : 0xffff00;
    this.sprite = scene.add.rectangle(x, y, DROP_SIZE, DROP_SIZE, color);
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
