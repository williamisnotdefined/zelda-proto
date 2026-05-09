import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import Phaser from 'phaser';
import { EnemyHealthBar } from './EnemyHealthBar';

const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;
const SLIME_SCALE = 1.24;
const SLIME_SPRITE_OFFSET_X = -2;
const HP_BAR_WIDTH = 28;
const HP_BAR_OFFSET_Y = 20;
const ELITE_SCALE_MULTIPLIER = 1.3;
const ELITE_TINT = 0xff6b6b;
const VENOM_TINT = 0x6dff8c;

type FacingDirection = 'up' | 'down' | 'left' | 'right';
type EnemyVisualLod = {
  tier: 'near' | 'mid' | 'far';
  animate: boolean;
  animationTimeScale: number;
};

const STATIC_FRAME_BY_FACING: Record<FacingDirection, number> = {
  down: 0,
  right: 8,
  left: 16,
  up: 24,
};

export class SlimeEntity {
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
  private isUsingStaticFrame: boolean;
  private staticFrameFacing: FacingDirection | null;
  private spriteVisible: boolean;
  private animationTimeScale: number;
  private readonly healthBar: EnemyHealthBar;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.hp = 38;
    this.maxHp = 38;
    this.serverState = 'idle';
    this.elite = false;
    this.prevX = x;
    this.prevY = y;
    this.facing = 'down';
    this.currentAnimKey = '';
    this.isUsingStaticFrame = false;
    this.venomMarked = false;
    this.staticFrameFacing = null;
    this.spriteVisible = true;
    this.animationTimeScale = 1;

    this.sprite = scene.add.sprite(x + SLIME_SPRITE_OFFSET_X, y, 'slime');
    this.sprite.setDepth(8);
    this.sprite.setScale(SLIME_SCALE);
    this.healthBar = new EnemyHealthBar(scene, this.sprite.x, y, {
      width: HP_BAR_WIDTH,
      offsetY: HP_BAR_OFFSET_Y,
    });
  }

  get x(): number {
    return this.sprite.x - SLIME_SPRITE_OFFSET_X;
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
    this.resetVisualState();
    this.applyElite(elite);
    this.applyVenomMarked(venomMarked);
    this.sprite.x = x + SLIME_SPRITE_OFFSET_X;
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
    const targetSpriteX = this.targetX + SLIME_SPRITE_OFFSET_X;
    const dx = targetSpriteX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.sprite.x = targetSpriteX;
      this.sprite.y = this.targetY;
    }

    const logicalDx = this.targetX - (this.sprite.x - SLIME_SPRITE_OFFSET_X);
    const logicalDy = this.targetY - this.sprite.y;
    if (Math.abs(logicalDx) > 0.6 || Math.abs(logicalDy) > 0.6) {
      if (Math.abs(logicalDx) >= Math.abs(logicalDy)) {
        this.facing = logicalDx < 0 ? 'left' : 'right';
      } else {
        this.facing = logicalDy < 0 ? 'up' : 'down';
      }
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = getExponentialInterpolationFactor(LERP_BASE, dtMs);
    this.sprite.x += (targetSpriteX - this.sprite.x) * factor;
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
    const preferredKey = `slime_${this.facing}`;
    const animKey = this.sprite.scene.anims.exists(preferredKey) ? preferredKey : 'slime_down';
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
    this.sprite.setFrame(STATIC_FRAME_BY_FACING[this.facing]);
    this.currentAnimKey = '';
    this.isUsingStaticFrame = true;
    this.staticFrameFacing = this.facing;
  }

  private applyElite(elite: boolean): void {
    this.elite = elite;
    const scale = SLIME_SCALE * (elite ? ELITE_SCALE_MULTIPLIER : 1);
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
