import Phaser from 'phaser';

const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;
const HP_BAR_WIDTH = 24;
const HP_BAR_OFFSET_Y = 40;
const CONTACT_SHADOW_RADIUS = 24;
const CONTACT_SHADOW_COLOR = 0x000000;
const CONTACT_SHADOW_ALPHA = 0.3;
const HAND_SCALE = 1.24;
const EXPULSION_PULSE_ALPHA = 0.55;
const EXPULSION_PULSE_DISTANCE = 44;
const EXPULSION_PULSE_DURATION_MS = 130;

type FacingDirection = 'up' | 'down' | 'left' | 'right';

export class HandEntity {
  sprite: Phaser.GameObjects.Sprite;
  collisionShadow: Phaser.GameObjects.Arc;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  serverState: string;
  private prevX: number;
  private prevY: number;
  private shadowPulseTween: Phaser.Tweens.Tween | null;
  private facing: FacingDirection;
  private currentAnimKey: string;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.hp = 38;
    this.maxHp = 38;
    this.serverState = 'idle';
    this.prevX = x;
    this.prevY = y;
    this.shadowPulseTween = null;
    this.facing = 'down';
    this.currentAnimKey = '';

    this.sprite = scene.add.sprite(x, y, 'hand');
    this.sprite.setDepth(8);
    this.sprite.setScale(HAND_SCALE);

    this.collisionShadow = scene.add.circle(
      x,
      y,
      CONTACT_SHADOW_RADIUS,
      CONTACT_SHADOW_COLOR,
      CONTACT_SHADOW_ALPHA
    );
    this.collisionShadow.setDepth(7.5);

    this.hpBarBg = scene.add.rectangle(x, y - HP_BAR_OFFSET_Y, HP_BAR_WIDTH, 3, 0x333333);
    this.hpBarBg.setDepth(9);

    this.hpBar = scene.add.rectangle(x, y - HP_BAR_OFFSET_Y, HP_BAR_WIDTH, 3, 0xff4444);
    this.hpBar.setDepth(10);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  updateFromServer(x: number, y: number, hp: number, maxHp: number, state: string): void {
    this.prevX = this.targetX;
    this.prevY = this.targetY;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;

    const dx = this.targetX - this.prevX;
    const dy = this.targetY - this.prevY;
    if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.facing = dx < 0 ? 'left' : 'right';
      } else {
        this.facing = dy < 0 ? 'up' : 'down';
      }
    }

    if (dx * dx + dy * dy >= EXPULSION_PULSE_DISTANCE * EXPULSION_PULSE_DISTANCE) {
      this.pulseCollisionShadow();
    }
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

  update(dt: number, inView: boolean, animationTimeScale: number): void {
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;
    }

    if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.facing = dx < 0 ? 'left' : 'right';
      } else {
        this.facing = dy < 0 ? 'up' : 'down';
      }
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
    this.sprite.x += (this.targetX - this.sprite.x) * factor;
    this.sprite.y += (this.targetY - this.sprite.y) * factor;

    const alive = this.serverState !== 'dead';
    const visible = alive && inView;
    this.sprite.setVisible(visible);
    this.collisionShadow.setVisible(visible);
    this.hpBar.setVisible(visible);
    this.hpBarBg.setVisible(visible);

    if (!visible) {
      this.sprite.anims.stop();
      this.currentAnimKey = '';
      return;
    }

    this.sprite.anims.timeScale = animationTimeScale;

    this.collisionShadow.x = this.sprite.x;
    this.collisionShadow.y = this.sprite.y;
    this.hpBarBg.x = this.sprite.x;
    this.hpBarBg.y = this.sprite.y - HP_BAR_OFFSET_Y;

    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBar.width = HP_BAR_WIDTH * hpRatio;
    this.hpBar.x = this.sprite.x - (HP_BAR_WIDTH - this.hpBar.width) / 2;
    this.hpBar.y = this.sprite.y - HP_BAR_OFFSET_Y;

    this.updateAnimation();
  }

  private updateAnimation(): void {
    const preferredKey = `hand_${this.facing}`;
    const animKey = this.sprite.scene.anims.exists(preferredKey) ? preferredKey : 'hand_down';
    if (this.currentAnimKey === animKey) {
      return;
    }

    this.sprite.play(animKey, true);
    this.currentAnimKey = animKey;
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadowPulseTween?.stop();
    this.collisionShadow.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
