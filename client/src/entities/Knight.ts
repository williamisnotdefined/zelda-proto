import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import Phaser from 'phaser';
import { EnemyHealthBar } from './EnemyHealthBar';

const LERP_BASE = 0.32;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 220;
const KNIGHT_SCALE = 2;
const HP_BAR_WIDTH = 32;
const HP_BAR_OFFSET_Y = 35;
const ELITE_SCALE_MULTIPLIER = 1.24;
const NORMAL_GLOW_TINT = 0xffd36b;
const ELITE_TINT = 0xff5c6c;
const ELITE_GLOW_TINT = 0xff314f;
const VENOM_TINT = 0x6dff8c;
const AURA_RADIUS = 27;
const ELITE_AURA_RADIUS = 36;
const AFTERIMAGE_COUNT = 3;
const SPARKLE_COUNT = 7;

type FacingDirection = 'left' | 'right';
type EnemyVisualLod = {
  tier: 'near' | 'mid' | 'far';
  animate: boolean;
  animationTimeScale: number;
};

const KNIGHT_TEXTURES = {
  IDLE: 'knight_idle',
  RUN: 'knight_run',
  ATTACK: 'knight_attack',
  ROLL: 'knight_roll',
  JUMP: 'knight_jump',
  SHIELD: 'knight_shield',
  DEATH: 'knight_death',
} as const;

const KNIGHT_ANIMS = {
  IDLE: 'knight_idle',
  RUN: 'knight_run',
  ATTACK: 'knight_attack',
  ROLL: 'knight_roll',
  JUMP: 'knight_jump',
  SHIELD: 'knight_shield',
  DEATH: 'knight_death',
} as const;

const NORMAL_SPARKLE_TINTS = [0xffffff, 0xfff0a3, 0xffc15f, 0xff7a5f];
const ELITE_SPARKLE_TINTS = [0xff3f6d, 0xff8f4f, 0xffd36b, 0x91fff0];

export class KnightEntity {
  sprite: Phaser.GameObjects.Sprite;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  serverState: string;
  elite: boolean;
  venomMarked: boolean;

  private prevX: number;
  private prevY: number;
  private facing: FacingDirection;
  private currentAnimKey: string;
  private oneShotAnimKey: string | null;
  private deathPlayed: boolean;
  private isUsingStaticFrame: boolean;
  private staticFrameFacing: FacingDirection | null;
  private spriteVisible: boolean;
  private animationTimeScale: number;
  private effectElapsedMs: number;
  private readonly aura: Phaser.GameObjects.Arc;
  private readonly shieldRing: Phaser.GameObjects.Arc;
  private readonly glow: Phaser.GameObjects.Sprite;
  private readonly afterimages: Phaser.GameObjects.Sprite[] = [];
  private readonly sparkles: Phaser.GameObjects.Arc[] = [];
  private readonly healthBar: EnemyHealthBar;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.prevX = x;
    this.prevY = y;
    this.hp = 70;
    this.maxHp = 70;
    this.serverState = 'idle';
    this.elite = false;
    this.venomMarked = false;
    this.facing = 'right';
    this.currentAnimKey = '';
    this.oneShotAnimKey = null;
    this.deathPlayed = false;
    this.isUsingStaticFrame = false;
    this.staticFrameFacing = null;
    this.spriteVisible = true;
    this.animationTimeScale = 1;
    this.effectElapsedMs = 0;

    this.aura = scene.add.circle(x, y, AURA_RADIUS, NORMAL_GLOW_TINT, 0.06);
    this.aura.setDepth(7.35);
    this.aura.setBlendMode(Phaser.BlendModes.ADD);
    this.aura.setVisible(false);

    this.glow = scene.add.sprite(x, y, KNIGHT_TEXTURES.IDLE);
    this.glow.setDepth(7.75);
    this.glow.setScale(KNIGHT_SCALE * 1.08);
    this.glow.setTint(NORMAL_GLOW_TINT);
    this.glow.setAlpha(0.18);
    this.glow.setBlendMode(Phaser.BlendModes.ADD);
    this.glow.setVisible(false);

    for (let i = 0; i < AFTERIMAGE_COUNT; i += 1) {
      const afterimage = scene.add.sprite(x, y, KNIGHT_TEXTURES.IDLE);
      afterimage.setDepth(7.65 - i * 0.01);
      afterimage.setScale(KNIGHT_SCALE);
      afterimage.setTint(NORMAL_GLOW_TINT);
      afterimage.setAlpha(0);
      afterimage.setBlendMode(Phaser.BlendModes.ADD);
      afterimage.setVisible(false);
      this.afterimages.push(afterimage);
    }

    this.sprite = scene.add.sprite(x, y, KNIGHT_TEXTURES.IDLE);
    this.sprite.setDepth(8);
    this.sprite.setScale(KNIGHT_SCALE);

    this.shieldRing = scene.add.circle(x, y, 1);
    this.shieldRing.setDepth(8.15);
    this.shieldRing.setFillStyle(NORMAL_GLOW_TINT, 0.05);
    this.shieldRing.setStrokeStyle(3, NORMAL_GLOW_TINT, 0.72);
    this.shieldRing.setBlendMode(Phaser.BlendModes.ADD);
    this.shieldRing.setVisible(false);

    for (let i = 0; i < SPARKLE_COUNT; i += 1) {
      const sparkle = scene.add.circle(x, y, 2.1, NORMAL_GLOW_TINT, 0);
      sparkle.setDepth(8.3);
      sparkle.setBlendMode(Phaser.BlendModes.ADD);
      sparkle.setVisible(false);
      this.sparkles.push(sparkle);
    }

    this.healthBar = new EnemyHealthBar(scene, x, y, {
      width: HP_BAR_WIDTH,
      offsetY: HP_BAR_OFFSET_Y,
    });
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
    elite = false,
    venomMarked = false
  ): void {
    const previousHp = this.hp;
    const previousState = this.serverState;
    this.prevX = this.targetX;
    this.prevY = this.targetY;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.applyElite(elite);
    this.applyVenomMarked(venomMarked);

    const dx = this.targetX - this.prevX;
    this.updateFacing(dx, 0.35);

    if (state === 'dead') {
      return;
    }
    if (hp < previousHp) {
      this.queueOneShot(KNIGHT_ANIMS.SHIELD);
      return;
    }
    if (state !== previousState) {
      if (state === 'rolling') this.queueOneShot(KNIGHT_ANIMS.ROLL);
      if (state === 'casting' || state === 'attacking') this.queueOneShot(KNIGHT_ANIMS.ATTACK);
      if (state === 'shielding') this.queueOneShot(KNIGHT_ANIMS.SHIELD);
    }
  }

  restoreFromServer(
    x: number,
    y: number,
    hp: number,
    maxHp: number,
    state: string,
    elite = false,
    venomMarked = false
  ): void {
    this.prevX = x;
    this.prevY = y;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.resetVisualState();
    this.applyElite(elite);
    this.applyVenomMarked(venomMarked);
    this.sprite.x = x;
    this.sprite.y = y;
    this.syncEffectPositions();
    this.setSpriteVisible(true);
    this.animationTimeScale = 1;
    this.healthBar.sync(
      this.sprite.x,
      this.sprite.y,
      this.hp,
      this.maxHp,
      this.serverState !== 'dead'
    );
  }

  setDormant(): void {
    this.resetVisualState();
    this.sprite.setVisible(false);
    this.spriteVisible = false;
    this.setEffectsVisible(false);
    this.healthBar.setVisible(false);
  }

  update(dt: number, inView: boolean, lod: EnemyVisualLod): void {
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;
    }

    const logicalDx = this.targetX - this.sprite.x;
    this.updateFacing(logicalDx, 0.5);

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = getExponentialInterpolationFactor(LERP_BASE, dtMs);
    this.sprite.x += (this.targetX - this.sprite.x) * factor;
    this.sprite.y += (this.targetY - this.sprite.y) * factor;

    const isDead = this.serverState === 'dead';
    const visible = inView;
    this.setSpriteVisible(visible);
    this.healthBar.sync(this.sprite.x, this.sprite.y, this.hp, this.maxHp, visible && !isDead);

    if (!visible) {
      if (this.currentAnimKey !== '' || this.isUsingStaticFrame || this.sprite.anims.isPlaying) {
        this.sprite.anims.stop();
        this.currentAnimKey = '';
        this.isUsingStaticFrame = false;
        this.staticFrameFacing = null;
      }
      this.setEffectsVisible(false);
      return;
    }

    if (isDead) {
      this.updateAnimation();
      this.setEffectsVisible(false);
      return;
    }

    if (!lod.animate) {
      this.oneShotAnimKey = null;
      this.applyStaticFrame();
      this.updateEffects(dt, false);
      return;
    }

    const desiredTimeScale =
      this.serverState === 'sprinting' ? lod.animationTimeScale * 1.45 : lod.animationTimeScale;
    if (this.animationTimeScale !== desiredTimeScale) {
      this.sprite.anims.timeScale = desiredTimeScale;
      this.animationTimeScale = desiredTimeScale;
    }
    this.updateAnimation();
    this.updateEffects(dt, true);
  }

  destroy(): void {
    this.healthBar.destroy();
    this.aura.destroy();
    this.glow.destroy();
    this.shieldRing.destroy();
    for (const afterimage of this.afterimages) afterimage.destroy();
    for (const sparkle of this.sparkles) sparkle.destroy();
    this.sprite.destroy();
  }

  private updateAnimation(): void {
    if (this.serverState === 'dead') {
      this.sprite.setFlipX(false);
      if (!this.deathPlayed) {
        this.playIfExists(KNIGHT_ANIMS.DEATH);
        this.currentAnimKey = KNIGHT_ANIMS.DEATH;
        this.deathPlayed = true;
      }
      this.oneShotAnimKey = null;
      this.isUsingStaticFrame = false;
      this.staticFrameFacing = null;
      return;
    }

    this.deathPlayed = false;
    this.sprite.setFlipX(this.facing === 'left');

    if (this.oneShotAnimKey) {
      if (this.currentAnimKey !== this.oneShotAnimKey) {
        this.playIfExists(this.oneShotAnimKey, false);
        this.currentAnimKey = this.oneShotAnimKey;
        this.isUsingStaticFrame = false;
        this.staticFrameFacing = null;
        return;
      }
      if (
        this.sprite.anims.isPlaying &&
        this.sprite.anims.currentAnim?.key === this.oneShotAnimKey
      ) {
        return;
      }
      this.oneShotAnimKey = null;
    }

    let animKey: string = KNIGHT_ANIMS.IDLE;
    if (this.serverState === 'attacking' || this.serverState === 'casting') {
      animKey = KNIGHT_ANIMS.ATTACK;
    } else if (this.serverState === 'sprinting') {
      animKey = KNIGHT_ANIMS.RUN;
    } else if (this.serverState === 'rolling') {
      animKey = KNIGHT_ANIMS.ROLL;
    } else if (this.serverState === 'shielding') {
      animKey = KNIGHT_ANIMS.SHIELD;
    } else if (this.serverState === 'chasing') {
      animKey = KNIGHT_ANIMS.RUN;
    }

    if (this.currentAnimKey === animKey && !this.isUsingStaticFrame) {
      return;
    }

    this.playIfExists(animKey);
    this.currentAnimKey = animKey;
    this.isUsingStaticFrame = false;
    this.staticFrameFacing = null;
  }

  private queueOneShot(animKey: string): void {
    this.oneShotAnimKey = animKey;
    this.currentAnimKey = '';
  }

  private playIfExists(animKey: string, ignoreIfPlaying = true): void {
    const anim = this.sprite.scene.anims.get(animKey);
    if (!anim || !anim.frames || anim.frames.length === 0) {
      return;
    }

    try {
      this.sprite.play(animKey, ignoreIfPlaying);
    } catch {
      return;
    }
  }

  private updateFacing(dx: number, threshold: number): void {
    if (Math.abs(dx) > threshold) {
      this.facing = dx < 0 ? 'left' : 'right';
    }
  }

  private resetVisualState(): void {
    this.facing = 'right';
    this.currentAnimKey = '';
    this.oneShotAnimKey = null;
    this.deathPlayed = false;
    this.isUsingStaticFrame = false;
    this.staticFrameFacing = null;
    this.effectElapsedMs = 0;
    this.sprite.anims.stop();
    this.sprite.anims.timeScale = 1;
    this.animationTimeScale = 1;
    this.sprite.setFlipX(false);
    this.sprite.clearTint();
    this.sprite.setTexture(KNIGHT_TEXTURES.IDLE);
    this.sprite.setFrame(0);
    this.setEffectsVisible(false);
  }

  private applyVenomMarked(venomMarked: boolean): void {
    this.venomMarked = venomMarked;
    this.applyStatusTint();
  }

  private applyStatusTint(): void {
    if (this.venomMarked) {
      this.sprite.setTint(VENOM_TINT);
      return;
    }
    if (this.elite) {
      this.sprite.setTint(ELITE_TINT);
      return;
    }
    this.sprite.clearTint();
  }

  private setSpriteVisible(visible: boolean): void {
    if (this.spriteVisible === visible) {
      return;
    }

    this.sprite.setVisible(visible);
    this.spriteVisible = visible;
  }

  private applyStaticFrame(): void {
    if (this.isUsingStaticFrame && this.staticFrameFacing === this.facing) {
      return;
    }

    this.sprite.anims.stop();
    this.sprite.setTexture(KNIGHT_TEXTURES.IDLE);
    this.sprite.setFrame(0);
    this.sprite.setFlipX(this.facing === 'left');
    this.currentAnimKey = '';
    this.isUsingStaticFrame = true;
    this.staticFrameFacing = this.facing;
  }

  private applyElite(elite: boolean): void {
    this.elite = elite;
    const eliteScale = elite ? ELITE_SCALE_MULTIPLIER : 1;
    this.sprite.setScale(KNIGHT_SCALE * eliteScale);
    this.glow.setScale(KNIGHT_SCALE * eliteScale * 1.08);
    for (const afterimage of this.afterimages) afterimage.setScale(KNIGHT_SCALE * eliteScale);
    this.healthBar.setLayout(HP_BAR_WIDTH * eliteScale, HP_BAR_OFFSET_Y * eliteScale);
    this.applyStatusTint();
  }

  private updateEffects(dt: number, animate: boolean): void {
    this.effectElapsedMs += dt;
    this.syncEffectPositions();
    this.syncGlowSprite();

    const active = this.isSpecialState() || this.serverState === 'attacking';
    const showEffects = animate && (this.elite || active);
    this.aura.setVisible(showEffects);
    this.glow.setVisible(showEffects);

    if (showEffects) {
      const pulse = (Math.sin(this.effectElapsedMs * 0.009) + 1) / 2;
      const auraColor = this.elite ? ELITE_GLOW_TINT : NORMAL_GLOW_TINT;
      const auraRadius = (this.elite ? ELITE_AURA_RADIUS : AURA_RADIUS) + pulse * 4;
      const auraAlpha = this.elite ? 0.12 + pulse * 0.05 : 0.07 + pulse * 0.04;
      this.aura.setRadius(auraRadius);
      this.aura.setFillStyle(auraColor, auraAlpha);
      this.aura.setStrokeStyle(2, NORMAL_GLOW_TINT, this.elite ? 0.48 : 0.28);
      this.glow.setTint(auraColor);
      this.glow.setAlpha((this.elite ? 0.26 : 0.16) + pulse * 0.08);
    }

    this.updateShieldRing(animate);
    this.updateAfterimages(animate);
    this.updateSparkles(animate, showEffects);
  }

  private syncEffectPositions(): void {
    this.aura.setPosition(this.sprite.x, this.sprite.y + 7);
    this.glow.setPosition(this.sprite.x, this.sprite.y);
    this.shieldRing.setPosition(this.sprite.x, this.sprite.y + 1);
  }

  private syncGlowSprite(): void {
    this.glow.setTexture(this.sprite.texture.key);
    this.glow.setFrame(this.sprite.frame.name);
    this.glow.setFlipX(this.sprite.flipX);
  }

  private updateShieldRing(animate: boolean): void {
    const shielding = animate && this.serverState === 'shielding';
    this.shieldRing.setVisible(shielding);
    if (!shielding) {
      return;
    }

    const pulse = (Math.sin(this.effectElapsedMs * 0.018) + 1) / 2;
    const color = this.elite ? 0xff6685 : NORMAL_GLOW_TINT;
    this.shieldRing.setRadius((this.elite ? 39 : 31) + pulse * 5);
    this.shieldRing.setFillStyle(color, 0.08 + pulse * 0.04);
    this.shieldRing.setStrokeStyle(3, color, 0.68 + pulse * 0.2);
  }

  private updateAfterimages(animate: boolean): void {
    const trailing =
      animate && (this.serverState === 'sprinting' || this.serverState === 'rolling');
    const dir = this.facing === 'left' ? 1 : -1;
    for (let i = 0; i < this.afterimages.length; i += 1) {
      const afterimage = this.afterimages[i];
      afterimage.setVisible(trailing);
      if (!trailing) {
        continue;
      }

      const gap = this.serverState === 'rolling' ? 9 : 15;
      const wobble = Math.sin(this.effectElapsedMs * 0.02 + i) * 3;
      afterimage.setTexture(this.sprite.texture.key);
      afterimage.setFrame(this.sprite.frame.name);
      afterimage.setFlipX(this.sprite.flipX);
      afterimage.setPosition(this.sprite.x + dir * gap * (i + 1), this.sprite.y + wobble);
      afterimage.setTint(this.elite ? ELITE_GLOW_TINT : NORMAL_GLOW_TINT);
      afterimage.setAlpha((0.24 - i * 0.06) * (this.elite ? 1.15 : 1));
    }
  }

  private updateSparkles(animate: boolean, showEffects: boolean): void {
    const palette = this.elite ? ELITE_SPARKLE_TINTS : NORMAL_SPARKLE_TINTS;
    const active = showEffects && animate;
    for (let i = 0; i < this.sparkles.length; i += 1) {
      const sparkle = this.sparkles[i];
      sparkle.setVisible(active);
      if (!active) {
        continue;
      }

      const angle = this.effectElapsedMs * 0.004 + (i / this.sparkles.length) * Math.PI * 2;
      const wave = (Math.sin(this.effectElapsedMs * 0.012 + i * 1.9) + 1) / 2;
      const radius = (this.elite ? 43 : 32) + wave * 9;
      sparkle.setPosition(
        this.sprite.x + Math.cos(angle) * radius,
        this.sprite.y + Math.sin(angle) * radius * 0.66
      );
      sparkle.setFillStyle(
        palette[(i + Math.floor(this.effectElapsedMs / 150)) % palette.length],
        0.22 + wave * 0.5
      );
      sparkle.setScale(0.7 + wave * 0.75);
    }
  }

  private setEffectsVisible(visible: boolean): void {
    this.aura.setVisible(visible);
    this.glow.setVisible(visible);
    this.shieldRing.setVisible(visible);
    for (const afterimage of this.afterimages) afterimage.setVisible(visible);
    for (const sparkle of this.sparkles) sparkle.setVisible(visible);
  }

  private isSpecialState(): boolean {
    return (
      this.serverState === 'shielding' ||
      this.serverState === 'sprinting' ||
      this.serverState === 'rolling' ||
      this.serverState === 'casting'
    );
  }
}
