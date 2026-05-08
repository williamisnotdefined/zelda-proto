import Phaser from 'phaser';

const DEFAULT_HEIGHT = 4;
const HP_BAR_BG_COLOR = 0x333333;
const HP_BAR_HIGH_COLOR = 0x44ff44;
const HP_BAR_MID_COLOR = 0xffaa00;
const HP_BAR_LOW_COLOR = 0xff4444;

type EnemyHealthBarOptions = {
  width: number;
  offsetY: number;
  height?: number;
};

export class EnemyHealthBar {
  private readonly hpBar: Phaser.GameObjects.Rectangle;
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private width: number;
  private offsetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, options: EnemyHealthBarOptions) {
    const height = options.height ?? DEFAULT_HEIGHT;

    this.width = options.width;
    this.offsetY = options.offsetY;

    this.hpBarBg = scene.add.rectangle(x, y - this.offsetY, this.width, height, HP_BAR_BG_COLOR, 0.9);
    this.hpBarBg.setDepth(10);

    this.hpBar = scene.add.rectangle(x, y - this.offsetY, this.width, height, HP_BAR_HIGH_COLOR);
    this.hpBar.setDepth(11);
  }

  sync(spriteX: number, spriteY: number, hp: number, maxHp: number, visible: boolean): void {
    const hpRatio = maxHp > 0 ? Phaser.Math.Clamp(hp / maxHp, 0, 1) : 0;

    this.hpBarBg.x = spriteX;
    this.hpBarBg.y = spriteY - this.offsetY;

    this.hpBar.width = this.width * hpRatio;
    this.hpBar.x = spriteX - (this.width - this.hpBar.width) / 2;
    this.hpBar.y = spriteY - this.offsetY;
    this.hpBar.fillColor =
      hpRatio > 0.5 ? HP_BAR_HIGH_COLOR : hpRatio > 0.25 ? HP_BAR_MID_COLOR : HP_BAR_LOW_COLOR;

    this.setVisible(visible);
  }

  setLayout(width: number, offsetY: number): void {
    this.width = width;
    this.offsetY = offsetY;
  }

  setVisible(visible: boolean): void {
    this.hpBar.setVisible(visible);
    this.hpBarBg.setVisible(visible);
  }

  destroy(): void {
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
