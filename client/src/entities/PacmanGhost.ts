import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import type { PacmanGhostVariant } from '@/shared';
import Phaser from 'phaser';
import { EnemyHealthBar } from './EnemyHealthBar';

const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;
const PACMAN_GHOST_SCALE = 0.35;
const PACMAN_GHOST_HP = 40;
const HP_BAR_WIDTH = 24;
const HP_BAR_OFFSET_Y = 16;
const ELITE_SCALE_MULTIPLIER = 2;
const VENOM_TINT = 0x6dff8c;

type FacingDirection = 'up' | 'down' | 'left' | 'right';
type EnemyVisualLod = {
  tier: 'near' | 'mid' | 'far';
  animate: boolean;
  animationTimeScale: number;
};

const STATIC_FRAME_BY_FACING: Record<FacingDirection, number> = {
  right: 0,
  left: 2,
  up: 4,
  down: 6,
};

export class PacmanGhostEntity {
  sprite: Phaser.GameObjects.Sprite;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  serverState: string;
  readonly variant: PacmanGhostVariant;
  elite: boolean;
  venomMarked: boolean;
  private prevX: number;
  private prevY: number;
  private facing: FacingDirection;
  private currentAnimKey: string;
  private readonly animPrefix: string;
  private isUsingStaticFrame: boolean;
  private staticFrameFacing: FacingDirection | null;
  private spriteVisible: boolean;
  private animationTimeScale: number;
  private readonly healthBar: EnemyHealthBar;

  constructor(scene: Phaser.Scene, x: number, y: number, variant: PacmanGhostVariant) {
    this.targetX = x;
    this.targetY = y;
    this.hp = PACMAN_GHOST_HP;
    this.maxHp = PACMAN_GHOST_HP;
    this.serverState = 'idle';
    this.variant = variant;
    this.elite = false;
    this.prevX = x;
    this.prevY = y;
    this.facing = 'down';
    this.currentAnimKey = '';
    this.animPrefix = `pacman_ghost_${variant}`;
    this.isUsingStaticFrame = false;
    this.venomMarked = false;
    this.staticFrameFacing = null;
    this.spriteVisible = true;
    this.animationTimeScale = 1;

    this.sprite = scene.add.sprite(x, y, this.animPrefix);
    this.sprite.setDepth(8);
    this.sprite.setScale(PACMAN_GHOST_SCALE);
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

  updateFromServer(x: number, y: number, hp: number, maxHp: number, state: string, elite = false, venomMarked = false): void {
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
    const dy = this.targetY - this.prevY;
    if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.facing = dx < 0 ? 'left' : 'right';
      } else {
        this.facing = dy < 0 ? 'up' : 'down';
      }
    }
  }

  restoreFromServer(x: number, y: number, hp: number, maxHp: number, state: string, elite = false, venomMarked = false): void {
    this.prevX = x;
    this.prevY = y;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.applyElite(elite);
    this.applyVenomMarked(venomMarked);
    this.resetVisualState();
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

    if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.facing = dx < 0 ? 'left' : 'right';
      } else {
        this.facing = dy < 0 ? 'up' : 'down';
      }
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = getExponentialInterpolationFactor(LERP_BASE, dtMs);
    this.sprite.x += (this.targetX - this.sprite.x) * factor;
    this.sprite.y += (this.targetY - this.sprite.y) * factor;

    const alive = this.serverState !== 'dead';
    const visible = alive && inView;
    this.setSpriteVisible(visible);
    this.healthBar.sync(this.sprite.x, this.sprite.y, this.hp, this.maxHp, visible);

    if (!visible) {
      if (this.currentAnimKey !== '' || this.isUsingStaticFrame || this.sprite.anims.isPlaying) {
        this.sprite.anims.stop();
        this.currentAnimKey = '';
        this.isUsingStaticFrame = false;
        this.staticFrameFacing = null;
      }
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
    const preferredKey = `${this.animPrefix}_${this.facing}`;
    const animKey = this.sprite.scene.anims.exists(preferredKey)
      ? preferredKey
      : `${this.animPrefix}_down`;
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
    this.sprite.clearTint();
    this.sprite.setFrame(STATIC_FRAME_BY_FACING.down);
  }

  private applyVenomMarked(venomMarked: boolean): void {
    this.venomMarked = venomMarked;
    if (venomMarked) {
      this.sprite.setTint(VENOM_TINT);
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

  private applyElite(elite: boolean): void {
    this.elite = elite;
    const scale = PACMAN_GHOST_SCALE * (elite ? ELITE_SCALE_MULTIPLIER : 1);
    this.sprite.setScale(scale);
    this.healthBar.setLayout(
      HP_BAR_WIDTH * (elite ? ELITE_SCALE_MULTIPLIER : 1),
      HP_BAR_OFFSET_Y * (elite ? ELITE_SCALE_MULTIPLIER : 1)
    );
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
    this.healthBar.destroy();
    this.sprite.destroy();
  }
}
