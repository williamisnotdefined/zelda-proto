import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import Phaser from 'phaser';
import { EnemyHealthBar } from './EnemyHealthBar';

const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;
const SKELETON_SCALE = 2;
const HP_BAR_WIDTH = 28;
const HP_BAR_OFFSET_Y = 24;
const ELITE_SCALE_MULTIPLIER = 1.3;
const ELITE_TINT = 0xff6b6b;
const VENOM_TINT = 0x6dff8c;

type FacingDirection = 'left' | 'right';
type EnemyVisualLod = {
  tier: 'near' | 'mid' | 'far';
  animate: boolean;
  animationTimeScale: number;
};

const SKELETON_TEXTURES = {
  IDLE: 'skeleton_enemy_idle',
  WALK: 'skeleton_enemy_walk',
  ATTACK: 'skeleton_enemy_attack',
  HIT: 'skeleton_enemy_hit',
  REACT: 'skeleton_enemy_react',
  DEAD: 'skeleton_enemy_dead',
} as const;

const SKELETON_ANIMS = {
  IDLE: 'skeleton_enemy_idle',
  WALK: 'skeleton_enemy_walk',
  ATTACK: 'skeleton_enemy_attack',
  HIT: 'skeleton_enemy_hit',
  REACT: 'skeleton_enemy_react',
  DEAD: 'skeleton_enemy_dead',
};

export class SkeletonEntity {
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
  private readonly healthBar: EnemyHealthBar;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.hp = 45;
    this.maxHp = 45;
    this.serverState = 'idle';
    this.elite = false;
    this.prevX = x;
    this.prevY = y;
    this.facing = 'right';
    this.currentAnimKey = '';
    this.oneShotAnimKey = null;
    this.deathPlayed = false;
    this.isUsingStaticFrame = false;
    this.venomMarked = false;
    this.staticFrameFacing = null;
    this.spriteVisible = true;
    this.animationTimeScale = 1;

    this.sprite = scene.add.sprite(x, y, SKELETON_TEXTURES.IDLE);
    this.sprite.setDepth(8);
    this.sprite.setScale(SKELETON_SCALE);
    this.healthBar = new EnemyHealthBar(scene, this.sprite.x, y, {
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
    this.updateFacing(dx, 0.4);

    if (state === 'dead') {
      return;
    }
    if (hp < previousHp) {
      this.queueOneShot(SKELETON_ANIMS.HIT);
      return;
    }
    if (state === 'attacking') {
      if (previousState !== 'attacking') {
        this.queueOneShot(SKELETON_ANIMS.ATTACK);
      }
      return;
    }
    if (previousState === 'idle' && state !== 'idle') {
      this.queueOneShot(SKELETON_ANIMS.REACT);
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
    this.updateFacing(logicalDx, 0.6);

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
      return;
    }

    if (isDead) {
      this.updateAnimation();
      return;
    }

    if (!lod.animate) {
      this.oneShotAnimKey = null;
      this.applyStaticFrame();
      return;
    }

    if (this.animationTimeScale !== lod.animationTimeScale) {
      this.sprite.anims.timeScale = lod.animationTimeScale;
      this.animationTimeScale = lod.animationTimeScale;
    }
    this.updateAnimation();
  }

  private updateAnimation(): void {
    if (this.serverState === 'dead') {
      this.sprite.setFlipX(false);
      if (!this.deathPlayed) {
        this.playIfExists(SKELETON_ANIMS.DEAD);
        this.currentAnimKey = SKELETON_ANIMS.DEAD;
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

    let animKey = SKELETON_ANIMS.IDLE;
    if (this.serverState === 'attacking') {
      animKey = SKELETON_ANIMS.ATTACK;
    } else if (this.serverState === 'chasing') {
      animKey = SKELETON_ANIMS.WALK;
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
    this.sprite.anims.stop();
    this.sprite.anims.timeScale = 1;
    this.animationTimeScale = 1;
    this.sprite.setFlipX(false);
    this.sprite.clearTint();
    this.sprite.setTexture(SKELETON_TEXTURES.IDLE);
    this.sprite.setFrame(0);
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
    this.sprite.setTexture(SKELETON_TEXTURES.IDLE);
    this.sprite.setFrame(0);
    this.sprite.setFlipX(this.facing === 'left');
    this.currentAnimKey = '';
    this.isUsingStaticFrame = true;
    this.staticFrameFacing = this.facing;
  }

  private applyElite(elite: boolean): void {
    this.elite = elite;
    const scale = SKELETON_SCALE * (elite ? ELITE_SCALE_MULTIPLIER : 1);
    this.sprite.setScale(scale);
    this.healthBar.setLayout(
      HP_BAR_WIDTH * (elite ? ELITE_SCALE_MULTIPLIER : 1),
      HP_BAR_OFFSET_Y * (elite ? ELITE_SCALE_MULTIPLIER : 1)
    );
    this.applyStatusTint();
  }

  destroy(): void {
    this.healthBar.destroy();
    this.sprite.destroy();
  }
}
