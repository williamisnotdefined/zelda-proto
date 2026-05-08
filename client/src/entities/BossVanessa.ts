import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import Phaser from 'phaser';

const LERP_BASE = 0.25;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 260;
const BOSS_SCALE = 2;
const LABEL_OFFSET_Y = 72;
const HP_BAR_OFFSET_Y = 58;
const HP_BAR_WIDTH = 108;
const CONTACT_SHADOW_RADIUS = 44;
const CONTACT_SHADOW_COLOR = 0x000000;
const CONTACT_SHADOW_ALPHA = 0.3;
const EXPULSION_PULSE_ALPHA = 0.55;
const EXPULSION_PULSE_DISTANCE = 72;
const EXPULSION_PULSE_DURATION_MS = 140;
const SPEECH_OFFSET_Y = 92;
const VENOM_TINT = 0x6dff8c;

type FacingDirection = 'up' | 'down' | 'left' | 'right';

export class BossVanessaEntity {
  sprite: Phaser.GameObjects.Sprite;
  collisionShadow: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  speechLabel: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  serverState: string;
  phase: number;
  private prevX: number;
  private prevY: number;
  private facing: FacingDirection;
  private currentAnimKey: string;
  private shadowPulseTween: Phaser.Tweens.Tween | null;
  private speechText: string | null;
  private speechColor: string;
  private venomMarked: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.prevX = x;
    this.prevY = y;
    this.hp = 175;
    this.maxHp = 175;
    this.serverState = 'idle';
    this.phase = 4;
    this.facing = 'down';
    this.currentAnimKey = '';
    this.shadowPulseTween = null;
    this.speechText = null;
    this.speechColor = '#ff3b30';
    this.venomMarked = false;

    this.sprite = scene.add.sprite(x, y, 'vanessa');
    this.sprite.setDepth(8);
    this.sprite.setScale(BOSS_SCALE);

    this.collisionShadow = scene.add.circle(
      x,
      y,
      CONTACT_SHADOW_RADIUS,
      CONTACT_SHADOW_COLOR,
      CONTACT_SHADOW_ALPHA
    );
    this.collisionShadow.setDepth(7.5);

    this.label = scene.add.text(x, y - LABEL_OFFSET_Y, 'VANESSA THE RUTHLESS', {
      fontSize: '12px',
      color: '#ffdf8d',
      fontStyle: 'bold',
      align: 'center',
    });
    this.label.setOrigin(0.5, 1);
    this.label.setDepth(13);

    this.speechLabel = scene.add.text(x, y - SPEECH_OFFSET_Y, '', {
      fontSize: '12px',
      color: this.speechColor,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 220, useAdvancedWrap: true },
      stroke: '#330000',
      strokeThickness: 2,
    });
    this.speechLabel.setOrigin(0.5, 1);
    this.speechLabel.setDepth(14);
    this.speechLabel.setVisible(false);

    this.hpBarBg = scene.add.rectangle(x, y - HP_BAR_OFFSET_Y, HP_BAR_WIDTH, 6, 0x222222, 0.9);
    this.hpBarBg.setDepth(12);

    this.hpBar = scene.add.rectangle(x, y - HP_BAR_OFFSET_Y, HP_BAR_WIDTH, 6, 0xff5577);
    this.hpBar.setDepth(13);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  updateFromServer(
    x: number,
    y: number,
    hp: number,
    maxHp: number,
    state: string,
    phase: number,
    venomMarked: boolean,
    speechText?: string,
    speechColor?: string
  ): void {
    this.prevX = this.targetX;
    this.prevY = this.targetY;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.phase = phase;
    this.venomMarked = venomMarked;
    this.speechText = speechText ?? null;
    this.speechColor = speechColor ?? '#ff3b30';

    const dx = this.targetX - this.prevX;
    const dy = this.targetY - this.prevY;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.facing = dx < 0 ? 'left' : 'right';
      } else {
        this.facing = dy < 0 ? 'up' : 'down';
      }
    }

    if (dx * dx + dy * dy >= EXPULSION_PULSE_DISTANCE * EXPULSION_PULSE_DISTANCE) {
      this.pulseCollisionShadow();
    }

    this.speechLabel.setText(this.speechText ?? '');
    this.speechLabel.setColor(this.speechColor);
  }

  private pulseCollisionShadow(): void {
    this.shadowPulseTween?.stop();
    this.collisionShadow.setFillStyle(CONTACT_SHADOW_COLOR, EXPULSION_PULSE_ALPHA);
    this.shadowPulseTween = this.sprite.scene.tweens.add({
      targets: this.collisionShadow,
      alpha: CONTACT_SHADOW_ALPHA,
      duration: EXPULSION_PULSE_DURATION_MS,
      ease: 'Sine.Out',
      onComplete: () => {
        this.shadowPulseTween = null;
      },
    });
  }

  update(dt: number): void {
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;

    if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.facing = dx < 0 ? 'left' : 'right';
      } else {
        this.facing = dy < 0 ? 'up' : 'down';
      }
    }

    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = getExponentialInterpolationFactor(LERP_BASE, dtMs);
    this.sprite.x += (this.targetX - this.sprite.x) * factor;
    this.sprite.y += (this.targetY - this.sprite.y) * factor;

    this.label.x = this.sprite.x;
    this.label.y = this.sprite.y - LABEL_OFFSET_Y;
    this.speechLabel.x = this.sprite.x;
    this.speechLabel.y = this.sprite.y - SPEECH_OFFSET_Y;
    this.collisionShadow.x = this.sprite.x;
    this.collisionShadow.y = this.sprite.y;

    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBarBg.x = this.sprite.x;
    this.hpBarBg.y = this.sprite.y - HP_BAR_OFFSET_Y;
    this.hpBar.width = HP_BAR_WIDTH * hpRatio;
    this.hpBar.x = this.sprite.x - (HP_BAR_WIDTH - this.hpBar.width) / 2;
    this.hpBar.y = this.sprite.y - HP_BAR_OFFSET_Y;
    this.hpBar.fillColor = 0xff5577;

    const alive = this.serverState !== 'dead';
    this.sprite.setVisible(alive);
    this.sprite.setDepth(alive ? 8 : 7);
    this.collisionShadow.setVisible(alive);
    this.label.setVisible(alive);
    this.speechLabel.setVisible(alive && !!this.speechText);
    this.hpBar.setVisible(alive);
    this.hpBarBg.setVisible(alive);

    if (!alive) {
      this.sprite.anims.stop();
      this.currentAnimKey = '';
      return;
    }

    this.updateAnimation();
    this.updateTint();
  }

  private updateAnimation(): void {
    const preferredKey = `vanessa_${this.facing}`;
    const fallbackKey = 'vanessa_down';
    const animKey = this.sprite.scene.anims.exists(preferredKey)
      ? preferredKey
      : this.sprite.scene.anims.exists(fallbackKey)
        ? fallbackKey
        : '';

    if (!animKey) {
      this.sprite.anims.stop();
      this.currentAnimKey = '';
      return;
    }

    const anim = this.sprite.scene.anims.get(animKey);
    if (!anim || !anim.frames || anim.frames.length === 0) {
      this.sprite.anims.stop();
      this.currentAnimKey = '';
      return;
    }

    if (this.currentAnimKey === animKey) {
      return;
    }

    this.sprite.play(animKey, true);
    this.currentAnimKey = animKey;
  }

  private updateTint(): void {
    if (this.venomMarked) {
      this.sprite.setTint(VENOM_TINT);
      return;
    }

    if (this.serverState === 'attacking') {
      this.sprite.setTint(0xffd36e);
      return;
    }

    if (this.serverState === 'chasing') {
      this.sprite.setTint(0xff9fb3);
      return;
    }

    this.sprite.clearTint();
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadowPulseTween?.stop();
    this.collisionShadow.destroy();
    this.label.destroy();
    this.speechLabel.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
