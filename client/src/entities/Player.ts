import Phaser from 'phaser';

const LERP_SPEED = 0.3;

export class PlayerEntity {
  sprite: Phaser.GameObjects.Sprite;
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

  private currentAnimKey: string;
  private deathPlayed: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, isLocal: boolean, id: string) {
    this.isLocal = isLocal;
    this.targetX = x;
    this.targetY = y;
    this.serverState = 'idle';
    this.serverDirection = 'down';
    this.hp = 100;
    this.maxHp = 100;
    this.currentAnimKey = '';
    this.deathPlayed = false;

    this.sprite = scene.add.sprite(x, y, 'player');
    this.sprite.setDepth(10);

    this.hpBarBg = scene.add.rectangle(x, y - 26, 32, 4, 0x333333);
    this.hpBarBg.setDepth(11);

    this.hpBar = scene.add.rectangle(x, y - 26, 32, 4, 0x44ff44);
    this.hpBar.setDepth(12);

    const label = isLocal ? 'YOU' : id.substring(0, 5);
    this.nameText = scene.add.text(x, y - 34, label, {
      fontSize: '10px',
      color: '#ffffff',
      align: 'center',
    });
    this.nameText.setOrigin(0.5, 1);
    this.nameText.setDepth(13);

    if (isLocal) {
      this.sprite.setTint(0xaaffaa);
    }
  }

  updateFromServer(x: number, y: number, hp: number, maxHp: number, state: string, direction: string): void {
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.serverDirection = direction;
  }

  update(_scene: Phaser.Scene, _dt: number): void {
    if (this.isLocal) {
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;
    } else {
      this.sprite.x += (this.targetX - this.sprite.x) * LERP_SPEED;
      this.sprite.y += (this.targetY - this.sprite.y) * LERP_SPEED;
    }

    this.hpBarBg.x = this.sprite.x;
    this.hpBarBg.y = this.sprite.y - 26;
    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBar.width = 32 * hpRatio;
    this.hpBar.x = this.sprite.x - (32 - this.hpBar.width) / 2;
    this.hpBar.y = this.sprite.y - 26;
    this.hpBar.fillColor = hpRatio > 0.5 ? 0x44ff44 : hpRatio > 0.25 ? 0xffaa00 : 0xff4444;

    this.nameText.x = this.sprite.x;
    this.nameText.y = this.sprite.y - 32;

    this.updateAnimation();
  }

  private updateAnimation(): void {
    const dir = this.serverDirection;
    const state = this.serverState;

    let animKey: string;
    let flipX = false;

    if (state === 'dead') {
      animKey = 'player_death';
      if (!this.deathPlayed) {
        this.sprite.setAlpha(1);
        this.sprite.play(animKey);
        this.deathPlayed = true;
        this.currentAnimKey = animKey;
      }
      return;
    }

    this.deathPlayed = false;
    this.sprite.setAlpha(1);

    const dirSuffix = dir === 'left' ? 'right' : dir;

    if (state === 'attacking') {
      animKey = `player_attack_${dirSuffix}`;
    } else if (state === 'moving') {
      animKey = `player_move_${dirSuffix}`;
    } else {
      animKey = `player_idle_${dirSuffix}`;
    }

    flipX = dir === 'left';
    this.sprite.setFlipX(flipX);

    if (this.currentAnimKey !== animKey) {
      this.sprite.play(animKey);
      this.currentAnimKey = animKey;
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameText.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
