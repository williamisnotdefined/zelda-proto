import Phaser from 'phaser';
import {
  CONTACT_SHADOW_ALPHA,
  CONTACT_SHADOW_COLOR,
  CONTACT_SHADOW_RADIUS,
  HP_BAR_BG_COLOR,
  HP_BAR_HEIGHT,
  HP_BAR_HIGH_COLOR,
  HP_BAR_LOW_COLOR,
  HP_BAR_MID_COLOR,
  HP_BAR_OFFSET_Y,
  HP_BAR_WIDTH,
  NICKNAME_OFFSET_Y,
  SPRITE_Y_OFFSET,
} from './playerVisualConfig';

export class PlayerPresentation {
  readonly hpBar: Phaser.GameObjects.Rectangle;
  readonly hpBarBg: Phaser.GameObjects.Rectangle;
  readonly nicknameLabel: Phaser.GameObjects.Text;
  private readonly contactShadow: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, x: number, y: number, nickname: string) {
    this.contactShadow = scene.add.circle(
      x,
      y,
      CONTACT_SHADOW_RADIUS,
      CONTACT_SHADOW_COLOR,
      CONTACT_SHADOW_ALPHA
    );
    this.contactShadow.setDepth(8.5);

    this.hpBarBg = scene.add.rectangle(
      x,
      y - HP_BAR_OFFSET_Y,
      HP_BAR_WIDTH,
      HP_BAR_HEIGHT,
      HP_BAR_BG_COLOR
    );
    this.hpBarBg.setDepth(11);

    this.hpBar = scene.add.rectangle(
      x,
      y - HP_BAR_OFFSET_Y,
      HP_BAR_WIDTH,
      HP_BAR_HEIGHT,
      HP_BAR_HIGH_COLOR
    );
    this.hpBar.setDepth(12);

    this.nicknameLabel = scene.add.text(x, y - NICKNAME_OFFSET_Y, nickname, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.nicknameLabel.setOrigin(0.5, 1);
    this.nicknameLabel.setDepth(14);
  }

  sync(spriteX: number, spriteY: number, hp: number, maxHp: number, alive: boolean): void {
    const hpRatio = maxHp > 0 ? hp / maxHp : 0;

    this.hpBarBg.x = spriteX;
    this.hpBarBg.y = spriteY - HP_BAR_OFFSET_Y;

    this.hpBar.width = HP_BAR_WIDTH * hpRatio;
    this.hpBar.x = spriteX - (HP_BAR_WIDTH - this.hpBar.width) / 2;
    this.hpBar.y = spriteY - HP_BAR_OFFSET_Y;
    this.hpBar.fillColor =
      hpRatio > 0.5 ? HP_BAR_HIGH_COLOR : hpRatio > 0.25 ? HP_BAR_MID_COLOR : HP_BAR_LOW_COLOR;

    this.nicknameLabel.x = spriteX;
    this.nicknameLabel.y = spriteY - NICKNAME_OFFSET_Y;

    this.contactShadow.x = spriteX;
    this.contactShadow.y = spriteY - SPRITE_Y_OFFSET;
    this.contactShadow.setVisible(alive);
  }

  setNickname(nickname: string): void {
    this.nicknameLabel.setText(nickname);
  }

  destroy(): void {
    this.contactShadow.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
    this.nicknameLabel.destroy();
  }
}
