import Phaser from 'phaser';

const LERP_BASE = 0.25;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 260;
const DRAGON_SCALE = 2;
const LABEL_OFFSET_Y = 72;
const HP_BAR_OFFSET_Y = 58;
const HP_BAR_WIDTH = 86;
const CONTACT_SHADOW_RADIUS = 48;
const CONTACT_SHADOW_COLOR = 0x000000;
const CONTACT_SHADOW_ALPHA = 0.3;
const EXPULSION_PULSE_ALPHA = 0.55;
const EXPULSION_PULSE_DISTANCE = 72;
const EXPULSION_PULSE_DURATION_MS = 140;

type FacingDirection = 'up' | 'down' | 'left' | 'right';

export class BossDragonLordEntity {
  sprite: Phaser.GameObjects.Sprite;
  collisionShadow: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
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

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.prevX = x;
    this.prevY = y;
    this.hp = 220;
    this.maxHp = 220;
    this.serverState = 'idle';
    this.phase = 1;
    this.facing = 'down';
    this.currentAnimKey = '';
    this.shadowPulseTween = null;

    this.sprite = scene.add.sprite(x, y, 'dragon_lord');
    this.sprite.setDepth(8);
    this.sprite.setScale(DRAGON_SCALE);

    this.collisionShadow = scene.add.circle(
      x,
      y,
      CONTACT_SHADOW_RADIUS,
      CONTACT_SHADOW_COLOR,
      CONTACT_SHADOW_ALPHA
    );
    this.collisionShadow.setDepth(7.5);

    this.label = scene.add.text(x, y - LABEL_OFFSET_Y, 'DRAGON LORD', {
      fontSize: '12px',
      color: '#ffb07a',
      fontStyle: 'bold',
      align: 'center',
    });
    this.label.setOrigin(0.5, 1);
    this.label.setDepth(13);

    this.hpBarBg = scene.add.rectangle(x, y - HP_BAR_OFFSET_Y, HP_BAR_WIDTH, 6, 0x222222, 0.9);
    this.hpBarBg.setDepth(12);

    this.hpBar = scene.add.rectangle(x, y - HP_BAR_OFFSET_Y, HP_BAR_WIDTH, 6, 0xff8844);
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
    phase: number
  ): void {
    this.prevX = this.targetX;
    this.prevY = this.targetY;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.phase = phase;

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
    const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
    this.sprite.x += (this.targetX - this.sprite.x) * factor;
    this.sprite.y += (this.targetY - this.sprite.y) * factor;

    this.label.x = this.sprite.x;
    this.label.y = this.sprite.y - LABEL_OFFSET_Y;
    this.collisionShadow.x = this.sprite.x;
    this.collisionShadow.y = this.sprite.y;

    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBarBg.x = this.sprite.x;
    this.hpBarBg.y = this.sprite.y - HP_BAR_OFFSET_Y;
    this.hpBar.width = HP_BAR_WIDTH * hpRatio;
    this.hpBar.x = this.sprite.x - (HP_BAR_WIDTH - this.hpBar.width) / 2;
    this.hpBar.y = this.sprite.y - HP_BAR_OFFSET_Y;
    this.hpBar.fillColor = 0xff8844;

    this.updateAnimation();

    const alive = this.serverState !== 'dead';
    this.sprite.setDepth(alive ? 8 : 7);
    this.collisionShadow.setVisible(alive);
    this.label.setVisible(alive);
    this.hpBar.setVisible(alive);
    this.hpBarBg.setVisible(alive);
  }

  private updateAnimation(): void {
    const preferredKey = this.serverState === 'dead' ? 'dragon_dead' : `dragon_${this.facing}`;
    const fallbackKey = 'dragon_dead';
    const animKey = this.sprite.scene.anims.exists(preferredKey)
      ? preferredKey
      : this.sprite.scene.anims.exists(fallbackKey)
        ? fallbackKey
        : '';

    if (!animKey) {
      this.sprite.setFrame(0);
      this.currentAnimKey = '';
      return;
    }

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
    this.label.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
