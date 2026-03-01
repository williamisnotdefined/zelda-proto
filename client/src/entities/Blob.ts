import Phaser from 'phaser';

/** Base lerp factor per 16.667ms (60fps) frame. */
const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;
const CONTACT_SHADOW_RADIUS = 14;
const CONTACT_SHADOW_COLOR = 0x000000;
const CONTACT_SHADOW_ALPHA = 0.3;
const EXPULSION_PULSE_ALPHA = 0.55;
const EXPULSION_PULSE_DISTANCE = 36;
const EXPULSION_PULSE_DURATION_MS = 130;

export class BlobEntity {
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
  private currentAnimKey: string;
  private deathPlayed: boolean;
  private facing: string;
  private shadowPulseTween: Phaser.Tweens.Tween | null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.prevX = x;
    this.prevY = y;
    this.hp = 30;
    this.maxHp = 30;
    this.serverState = 'idle';
    this.currentAnimKey = '';
    this.deathPlayed = false;
    this.facing = 'down';
    this.shadowPulseTween = null;

    this.sprite = scene.add.sprite(x, y, 'blob');
    this.sprite.setScale(2);
    this.sprite.setDepth(8);

    this.collisionShadow = scene.add.circle(
      x,
      y,
      CONTACT_SHADOW_RADIUS,
      CONTACT_SHADOW_COLOR,
      CONTACT_SHADOW_ALPHA
    );
    this.collisionShadow.setDepth(7.5);

    this.hpBarBg = scene.add.rectangle(x, y - 20, 24, 3, 0x333333);
    this.hpBarBg.setDepth(9);

    this.hpBar = scene.add.rectangle(x, y - 20, 24, 3, 0xff4444);
    this.hpBar.setDepth(10);
  }

  updateFromServer(x: number, y: number, hp: number, maxHp: number, state: string): void {
    this.prevX = this.targetX;
    this.prevY = this.targetY;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;

    const dx = x - this.prevX;
    const dy = y - this.prevY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      if (Math.abs(dx) > Math.abs(dy)) {
        this.facing = dx > 0 ? 'right' : 'left';
      } else {
        this.facing = dy > 0 ? 'down' : 'up';
      }
    }

    if (Math.sqrt(dx * dx + dy * dy) >= EXPULSION_PULSE_DISTANCE) {
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

  update(dt: number): void {
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > SNAP_DISTANCE) {
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
    this.sprite.x += (this.targetX - this.sprite.x) * factor;
    this.sprite.y += (this.targetY - this.sprite.y) * factor;

    this.hpBarBg.x = this.sprite.x;
    this.hpBarBg.y = this.sprite.y - 20;

    this.collisionShadow.x = this.sprite.x;
    this.collisionShadow.y = this.sprite.y;

    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBar.width = 24 * hpRatio;
    this.hpBar.x = this.sprite.x - (24 - this.hpBar.width) / 2;
    this.hpBar.y = this.sprite.y - 20;

    this.updateAnimation();

    const visible = this.serverState !== 'dead';
    this.collisionShadow.setVisible(visible);
  }

  private updateAnimation(): void {
    const state = this.serverState;

    let animKey: string;
    let flipX = false;

    if (state === 'dead') {
      animKey = 'blob_death';
      if (!this.deathPlayed) {
        this.playIfExists(animKey);
        this.deathPlayed = true;
        this.currentAnimKey = animKey;
      }
      return;
    }

    this.deathPlayed = false;
    const dirSuffix = this.facing === 'left' ? 'right' : this.facing;
    flipX = this.facing === 'left';

    if (state === 'attacking') {
      animKey = `blob_attack_${dirSuffix}`;
    } else if (state === 'chasing') {
      animKey = `blob_move_${dirSuffix}`;
    } else {
      animKey = `blob_idle_${dirSuffix}`;
    }

    this.sprite.setFlipX(flipX);

    if (this.currentAnimKey !== animKey) {
      this.playIfExists(animKey);
      this.currentAnimKey = animKey;
    }
  }

  private playIfExists(animKey: string): void {
    const anim = this.sprite.anims.animationManager.get(animKey);
    if (!anim) {
      return;
    }

    try {
      this.sprite.play(animKey);
    } catch {
      return;
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadowPulseTween?.stop();
    this.collisionShadow.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
