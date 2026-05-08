import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import Phaser from 'phaser';
import { EnemyHealthBar } from './EnemyHealthBar';

/** Base lerp factor per 16.667ms (60fps) frame. */
const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;
const HP_BAR_WIDTH = 30;
const HP_BAR_OFFSET_Y = 28;
const ELITE_SCALE_MULTIPLIER = 2;

type FacingDirection = 'up' | 'down' | 'left' | 'right';
type EnemyVisualLod = {
  tier: 'near' | 'mid' | 'far';
  animate: boolean;
  animationTimeScale: number;
};

const STATIC_FRAME_BY_FACING: Record<Exclude<FacingDirection, 'left'>, number> = {
  down: 0,
  right: 7,
  up: 14,
};

export class BlobEntity {
  sprite: Phaser.GameObjects.Sprite;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  serverState: string;
  elite: boolean;

  private prevX: number;
  private prevY: number;
  private currentAnimKey: string;
  private deathPlayed: boolean;
  private facing: FacingDirection;
  private isUsingStaticFrame: boolean;
  private staticFrameFacing: FacingDirection | null;
  private spriteVisible: boolean;
  private animationTimeScale: number;
  private readonly healthBar: EnemyHealthBar;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.prevX = x;
    this.prevY = y;
    this.hp = 30;
    this.maxHp = 30;
    this.serverState = 'idle';
    this.elite = false;
    this.currentAnimKey = '';
    this.deathPlayed = false;
    this.facing = 'down';
    this.isUsingStaticFrame = false;
    this.staticFrameFacing = null;
    this.spriteVisible = true;
    this.animationTimeScale = 1;

    this.sprite = scene.add.sprite(x, y, 'blob');
    this.sprite.setScale(2);
    this.sprite.setDepth(8);
    this.healthBar = new EnemyHealthBar(scene, x, y, {
      width: HP_BAR_WIDTH,
      offsetY: HP_BAR_OFFSET_Y,
    });
  }

  updateFromServer(x: number, y: number, hp: number, maxHp: number, state: string, elite = false): void {
    this.prevX = this.targetX;
    this.prevY = this.targetY;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.applyElite(elite);

    const dx = x - this.prevX;
    const dy = y - this.prevY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      if (Math.abs(dx) > Math.abs(dy)) {
        this.facing = dx > 0 ? 'right' : 'left';
      } else {
        this.facing = dy > 0 ? 'down' : 'up';
      }
    }
  }

  restoreFromServer(x: number, y: number, hp: number, maxHp: number, state: string, elite = false): void {
    this.prevX = x;
    this.prevY = y;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.applyElite(elite);
    this.resetVisualState();
    this.sprite.x = x;
    this.sprite.y = y;
    this.setSpriteVisible(true);
    this.animationTimeScale = 1;
    this.healthBar.sync(this.sprite.x, this.sprite.y, this.hp, this.maxHp, this.serverState !== 'dead');
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
    const state = this.serverState;

    let animKey: string;
    let flipX = false;

    if (state === 'dead') {
      animKey = 'blob_death';
      if (!this.deathPlayed) {
        this.sprite.setFlipX(false);
        this.playIfExists(animKey);
        this.deathPlayed = true;
        this.currentAnimKey = animKey;
      }
      this.isUsingStaticFrame = false;
      this.staticFrameFacing = null;
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

    if (this.currentAnimKey !== animKey || this.isUsingStaticFrame) {
      this.playIfExists(animKey);
      this.currentAnimKey = animKey;
    }

    this.isUsingStaticFrame = false;
    this.staticFrameFacing = null;
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

  private applyElite(elite: boolean): void {
    this.elite = elite;
    const scale = 2 * (elite ? ELITE_SCALE_MULTIPLIER : 1);
    this.sprite.setScale(scale);
    this.healthBar.setLayout(
      HP_BAR_WIDTH * (elite ? ELITE_SCALE_MULTIPLIER : 1),
      HP_BAR_OFFSET_Y * (elite ? ELITE_SCALE_MULTIPLIER : 1)
    );
  }

  private resetVisualState(): void {
    this.facing = 'down';
    this.currentAnimKey = '';
    this.deathPlayed = false;
    this.isUsingStaticFrame = false;
    this.staticFrameFacing = null;
    this.sprite.anims.stop();
    this.sprite.anims.timeScale = 1;
    this.animationTimeScale = 1;
    this.sprite.setFlipX(false);
    this.sprite.setFrame(STATIC_FRAME_BY_FACING.down);
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

    const frame =
      this.facing === 'left' ? STATIC_FRAME_BY_FACING.right : STATIC_FRAME_BY_FACING[this.facing];
    this.sprite.anims.stop();
    this.sprite.setFlipX(this.facing === 'left');
    this.sprite.setFrame(frame);
    this.currentAnimKey = '';
    this.isUsingStaticFrame = true;
    this.staticFrameFacing = this.facing;
  }

  destroy(): void {
    this.healthBar.destroy();
    this.sprite.destroy();
  }
}
