import Phaser from 'phaser';

const SLIME_SIZE = 28;
const LERP_SPEED = 0.3;

export class SlimeEntity {
  sprite: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  serverState: string;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.hp = 30;
    this.maxHp = 30;
    this.serverState = 'idle';

    this.sprite = scene.add.rectangle(x, y, SLIME_SIZE, SLIME_SIZE, 0x22cc66);
    this.sprite.setDepth(8);

    this.hpBarBg = scene.add.rectangle(x, y - 20, 24, 3, 0x333333);
    this.hpBarBg.setDepth(9);

    this.hpBar = scene.add.rectangle(x, y - 20, 24, 3, 0xff4444);
    this.hpBar.setDepth(10);
  }

  updateFromServer(x: number, y: number, hp: number, maxHp: number, state: string): void {
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
  }

  update(): void {
    this.sprite.x += (this.targetX - this.sprite.x) * LERP_SPEED;
    this.sprite.y += (this.targetY - this.sprite.y) * LERP_SPEED;

    this.hpBarBg.x = this.sprite.x;
    this.hpBarBg.y = this.sprite.y - 20;

    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBar.width = 24 * hpRatio;
    this.hpBar.x = this.sprite.x - (24 - this.hpBar.width) / 2;
    this.hpBar.y = this.sprite.y - 20;
  }

  destroy(): void {
    this.sprite.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
