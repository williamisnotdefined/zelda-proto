import type { PacmanGhostVariant } from '@gelehka/shared';
import Phaser from 'phaser';

const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;
const HP_BAR_WIDTH = 24;
const HP_BAR_OFFSET_Y = 20;
const PACMAN_GHOST_SCALE = 0.35;
const PACMAN_GHOST_HP = 38;

type FacingDirection = 'up' | 'down' | 'left' | 'right';

export class PacmanGhostEntity {
  sprite: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  serverState: string;
  readonly variant: PacmanGhostVariant;
  private prevX: number;
  private prevY: number;
  private facing: FacingDirection;
  private currentAnimKey: string;
  private readonly animPrefix: string;

  constructor(scene: Phaser.Scene, x: number, y: number, variant: PacmanGhostVariant) {
    this.targetX = x;
    this.targetY = y;
    this.hp = PACMAN_GHOST_HP;
    this.maxHp = PACMAN_GHOST_HP;
    this.serverState = 'idle';
    this.variant = variant;
    this.prevX = x;
    this.prevY = y;
    this.facing = 'down';
    this.currentAnimKey = '';
    this.animPrefix = `pacman_ghost_${variant}`;

    this.sprite = scene.add.sprite(x, y, this.animPrefix);
    this.sprite.setDepth(8);
    this.sprite.setScale(PACMAN_GHOST_SCALE);

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
  }

  update(dt: number, inView: boolean, animationTimeScale: number, showHud: boolean): void {
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

    const hudVisible = visible && showHud;
    this.hpBar.setVisible(hudVisible);
    this.hpBarBg.setVisible(hudVisible);

    if (!visible) {
      this.sprite.anims.stop();
      this.currentAnimKey = '';
      return;
    }

    this.sprite.anims.timeScale = animationTimeScale;

    if (hudVisible) {
      this.hpBarBg.x = this.sprite.x;
      this.hpBarBg.y = this.sprite.y - HP_BAR_OFFSET_Y;

      const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
      this.hpBar.width = HP_BAR_WIDTH * hpRatio;
      this.hpBar.x = this.sprite.x - (HP_BAR_WIDTH - this.hpBar.width) / 2;
      this.hpBar.y = this.sprite.y - HP_BAR_OFFSET_Y;
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

    if (this.currentAnimKey === animKey) {
      return;
    }

    this.sprite.play(animKey, true);
    this.currentAnimKey = animKey;
  }

  destroy(): void {
    this.sprite.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
