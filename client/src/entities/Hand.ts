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
type EnemyVisualLod = {
  tier: 'near' | 'mid' | 'far';
  animate: boolean;
  animationTimeScale: number;
  showHud: boolean;
  showShadow: boolean;
};

const STATIC_FRAME_BY_FACING: Record<FacingDirection, number> = {
  down: 0,
  left: 2,
  right: 4,
  up: 6,
};

export class HandEntity {
  sprite: Phaser.GameObjects.Sprite;
  collisionShadow: Phaser.GameObjects.Arc;
  hpBar: Phaser.GameObjects.Rectangle | null;
  hpBarBg: Phaser.GameObjects.Rectangle | null;
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
  private isUsingStaticFrame: boolean;
  private staticFrameFacing: FacingDirection | null;
  private spriteVisible: boolean;
  private shadowVisible: boolean;
  private hudVisible: boolean;
  private animationTimeScale: number;

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
    this.isUsingStaticFrame = false;
    this.staticFrameFacing = null;
    this.spriteVisible = true;
    this.shadowVisible = true;
    this.hudVisible = false;
    this.animationTimeScale = 1;

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
    this.hpBar = null;
    this.hpBarBg = null;
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

  restoreFromServer(x: number, y: number, hp: number, maxHp: number, state: string): void {
    this.prevX = x;
    this.prevY = y;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.shadowPulseTween?.stop();
    this.shadowPulseTween = null;
    this.resetVisualState();
    this.sprite.x = x;
    this.sprite.y = y;
    this.collisionShadow.x = x;
    this.collisionShadow.y = y;
    this.setSpriteVisible(true);
    this.setShadowVisible(true);
    this.setHudVisible(false);
    this.animationTimeScale = 1;
  }

  setDormant(): void {
    this.shadowPulseTween?.stop();
    this.shadowPulseTween = null;
    this.resetVisualState();
    this.sprite.setVisible(false);
    this.collisionShadow.setVisible(false);
    this.hpBar?.setVisible(false);
    this.hpBarBg?.setVisible(false);
    this.spriteVisible = false;
    this.shadowVisible = false;
    this.hudVisible = false;
  }

  private pulseCollisionShadow(): void {
    if (!this.sprite.visible || !this.collisionShadow.visible) {
      return;
    }

    this.shadowPulseTween?.stop();
    this.collisionShadow.setFillStyle(CONTACT_SHADOW_COLOR, EXPULSION_PULSE_ALPHA);
    this.collisionShadow.setAlpha(EXPULSION_PULSE_ALPHA);
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

  update(dt: number, inView: boolean, lod: EnemyVisualLod): void {
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
    const hudVisible = visible && lod.showHud;
    const shadowVisible = visible && lod.showShadow;
    this.setSpriteVisible(visible);
    this.setShadowVisible(shadowVisible);
    this.setHudVisible(hudVisible);

    if (!shadowVisible) {
      this.shadowPulseTween?.stop();
      this.shadowPulseTween = null;
      this.resetCollisionShadowAppearance();
    }

    this.collisionShadow.x = this.sprite.x;
    this.collisionShadow.y = this.sprite.y;

    if (!visible) {
      if (this.currentAnimKey !== '' || this.isUsingStaticFrame || this.sprite.anims.isPlaying) {
        this.sprite.anims.stop();
        this.currentAnimKey = '';
        this.isUsingStaticFrame = false;
        this.staticFrameFacing = null;
      }
      return;
    }

    if (hudVisible) {
      this.ensureHealthBars();
      const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
      this.hpBarBg!.x = this.sprite.x;
      this.hpBarBg!.y = this.sprite.y - HP_BAR_OFFSET_Y;
      this.hpBar!.width = HP_BAR_WIDTH * hpRatio;
      this.hpBar!.x = this.sprite.x - (HP_BAR_WIDTH - this.hpBar!.width) / 2;
      this.hpBar!.y = this.sprite.y - HP_BAR_OFFSET_Y;
    }

    if (!lod.animate) {
      this.applyStaticFrame();
      return;
    }

    if (this.animationTimeScale !== lod.animationTimeScale) {
      this.sprite.anims.timeScale = lod.animationTimeScale;
      this.animationTimeScale = lod.animationTimeScale;
    }
    this.updateAnimation();
  }

  private ensureHealthBars(): void {
    if (this.hpBar && this.hpBarBg) {
      return;
    }

    const scene = this.sprite.scene;
    this.hpBarBg = scene.add.rectangle(
      this.sprite.x,
      this.sprite.y - HP_BAR_OFFSET_Y,
      HP_BAR_WIDTH,
      3,
      0x333333
    );
    this.hpBarBg.setDepth(9);

    this.hpBar = scene.add.rectangle(
      this.sprite.x,
      this.sprite.y - HP_BAR_OFFSET_Y,
      HP_BAR_WIDTH,
      3,
      0xff4444
    );
    this.hpBar.setDepth(10);
  }

  private updateAnimation(): void {
    const preferredKey = `hand_${this.facing}`;
    const animKey = this.sprite.scene.anims.exists(preferredKey) ? preferredKey : 'hand_down';
    const anim = this.sprite.scene.anims.get(animKey);
    if (!anim || !anim.frames || anim.frames.length === 0) {
      this.sprite.anims.stop();
      this.currentAnimKey = '';
      return;
    }

    if (this.currentAnimKey === animKey && !this.isUsingStaticFrame) {
      return;
    }

    this.sprite.play(animKey, true);
    this.currentAnimKey = animKey;
    this.isUsingStaticFrame = false;
    this.staticFrameFacing = null;
  }

  private resetVisualState(): void {
    this.facing = 'down';
    this.currentAnimKey = '';
    this.isUsingStaticFrame = false;
    this.staticFrameFacing = null;
    this.sprite.anims.stop();
    this.sprite.anims.timeScale = 1;
    this.animationTimeScale = 1;
    this.sprite.setFlipX(false);
    this.sprite.setFrame(STATIC_FRAME_BY_FACING.down);
    this.resetCollisionShadowAppearance();
  }

  private setSpriteVisible(visible: boolean): void {
    if (this.spriteVisible === visible) {
      return;
    }

    this.sprite.setVisible(visible);
    this.spriteVisible = visible;
  }

  private setShadowVisible(visible: boolean): void {
    if (this.shadowVisible === visible) {
      return;
    }

    this.collisionShadow.setVisible(visible);
    this.shadowVisible = visible;
  }

  private setHudVisible(visible: boolean): void {
    if (this.hudVisible === visible) {
      return;
    }

    this.hpBar?.setVisible(visible);
    this.hpBarBg?.setVisible(visible);
    this.hudVisible = visible;
  }

  private resetCollisionShadowAppearance(): void {
    this.collisionShadow.setFillStyle(CONTACT_SHADOW_COLOR, CONTACT_SHADOW_ALPHA);
    this.collisionShadow.setAlpha(CONTACT_SHADOW_ALPHA);
  }

  private applyStaticFrame(): void {
    if (this.isUsingStaticFrame && this.staticFrameFacing === this.facing) {
      return;
    }

    this.sprite.anims.stop();
    this.sprite.setFrame(STATIC_FRAME_BY_FACING[this.facing]);
    this.currentAnimKey = '';
    this.isUsingStaticFrame = true;
    this.staticFrameFacing = this.facing;
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadowPulseTween?.stop();
    this.collisionShadow.destroy();
    this.hpBar?.destroy();
    this.hpBarBg?.destroy();
  }
}
