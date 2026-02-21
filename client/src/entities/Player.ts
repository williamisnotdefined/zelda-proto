import Phaser from 'phaser';

const PLAYER_SIZE = 28;
const LERP_SPEED = 0.3;

export class PlayerEntity {
  sprite: Phaser.GameObjects.Rectangle;
  nameText: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  isLocal: boolean;
  targetX: number;
  targetY: number;
  serverState: string;
  serverDirection: string;
  hp: number;
  maxHp: number;

  private attackIndicator: Phaser.GameObjects.Rectangle | null;
  private attackTimer: number;

  constructor(scene: Phaser.Scene, x: number, y: number, isLocal: boolean, id: string) {
    this.isLocal = isLocal;
    this.targetX = x;
    this.targetY = y;
    this.serverState = 'idle';
    this.serverDirection = 'down';
    this.hp = 100;
    this.maxHp = 100;
    this.attackIndicator = null;
    this.attackTimer = 0;

    const color = isLocal ? 0x44aa44 : 0x4444aa;
    this.sprite = scene.add.rectangle(x, y, PLAYER_SIZE, PLAYER_SIZE, color);
    this.sprite.setDepth(10);

    this.hpBarBg = scene.add.rectangle(x, y - 22, 32, 4, 0x333333);
    this.hpBarBg.setDepth(11);

    this.hpBar = scene.add.rectangle(x, y - 22, 32, 4, 0x44ff44);
    this.hpBar.setDepth(12);

    const label = isLocal ? 'YOU' : id.substring(0, 5);
    this.nameText = scene.add.text(x, y - 30, label, {
      fontSize: '10px',
      color: '#ffffff',
      align: 'center',
    });
    this.nameText.setOrigin(0.5, 1);
    this.nameText.setDepth(13);
  }

  updateFromServer(x: number, y: number, hp: number, maxHp: number, state: string, direction: string): void {
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.serverDirection = direction;
  }

  update(scene: Phaser.Scene, dt: number): void {
    if (this.isLocal) {
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;
    } else {
      this.sprite.x += (this.targetX - this.sprite.x) * LERP_SPEED;
      this.sprite.y += (this.targetY - this.sprite.y) * LERP_SPEED;
    }

    this.hpBarBg.x = this.sprite.x;
    this.hpBarBg.y = this.sprite.y - 22;
    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBar.width = 32 * hpRatio;
    this.hpBar.x = this.sprite.x - (32 - this.hpBar.width) / 2;
    this.hpBar.y = this.sprite.y - 22;
    this.hpBar.fillColor = hpRatio > 0.5 ? 0x44ff44 : hpRatio > 0.25 ? 0xffaa00 : 0xff4444;

    this.nameText.x = this.sprite.x;
    this.nameText.y = this.sprite.y - 28;

    if (this.serverState === 'dead') {
      this.sprite.setAlpha(0.3);
    } else {
      this.sprite.setAlpha(1);
    }

    if (this.serverState === 'attacking') {
      this.showAttackIndicator(scene);
    }

    if (this.attackIndicator) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackIndicator.destroy();
        this.attackIndicator = null;
      }
    }
  }

  private showAttackIndicator(scene: Phaser.Scene): void {
    if (this.attackIndicator) return;

    let ax = this.sprite.x;
    let ay = this.sprite.y;
    const range = 32;

    switch (this.serverDirection) {
      case 'up': ay -= range; break;
      case 'down': ay += range; break;
      case 'left': ax -= range; break;
      case 'right': ax += range; break;
    }

    this.attackIndicator = scene.add.rectangle(ax, ay, 20, 20, 0xffff00, 0.6);
    this.attackIndicator.setDepth(9);
    this.attackTimer = 150;
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameText.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
    this.attackIndicator?.destroy();
  }
}
