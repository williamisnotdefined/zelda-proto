import Phaser from 'phaser';

const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;
const HAND_SCALE = 1.24;

type FacingDirection = 'up' | 'down' | 'left' | 'right';
type EnemyVisualLod = {
  tier: 'near' | 'mid' | 'far';
  animate: boolean;
  animationTimeScale: number;
};

const STATIC_FRAME_BY_FACING: Record<FacingDirection, number> = {
  down: 0,
  left: 2,
  right: 4,
  up: 6,
};

export class HandEntity {
  sprite: Phaser.GameObjects.Sprite;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  serverState: string;
  private prevX: number;
  private prevY: number;
  private facing: FacingDirection;
  private currentAnimKey: string;
  private isUsingStaticFrame: boolean;
  private staticFrameFacing: FacingDirection | null;
  private spriteVisible: boolean;
  private animationTimeScale: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.hp = 38;
    this.maxHp = 38;
    this.serverState = 'idle';
    this.prevX = x;
    this.prevY = y;
    this.facing = 'down';
    this.currentAnimKey = '';
    this.isUsingStaticFrame = false;
    this.staticFrameFacing = null;
    this.spriteVisible = true;
    this.animationTimeScale = 1;

    this.sprite = scene.add.sprite(x, y, 'hand');
    this.sprite.setDepth(8);
    this.sprite.setScale(HAND_SCALE);
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
  }

  restoreFromServer(x: number, y: number, hp: number, maxHp: number, state: string): void {
    this.prevX = x;
    this.prevY = y;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.resetVisualState();
    this.sprite.x = x;
    this.sprite.y = y;
    this.setSpriteVisible(true);
    this.animationTimeScale = 1;
  }

  setDormant(): void {
    this.resetVisualState();
    this.sprite.setVisible(false);
    this.spriteVisible = false;
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
    this.setSpriteVisible(visible);

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

  destroy(): void {
    this.sprite.destroy();
  }
}
