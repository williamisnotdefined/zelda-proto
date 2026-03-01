import Phaser from 'phaser';

const LERP_BASE = 0.25;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 260;
const DRAGON_SPRITE_BASE_PATH = '/assets/sprites/monsters/dragon_lord';
const DRAGON_SPRITE_PATHS = {
  up: `${DRAGON_SPRITE_BASE_PATH}/up.gif`,
  down: `${DRAGON_SPRITE_BASE_PATH}/down.gif`,
  left: `${DRAGON_SPRITE_BASE_PATH}/left.gif`,
  right: `${DRAGON_SPRITE_BASE_PATH}/right.gif`,
} as const;
const DRAGON_DEAD_SPRITE_PATH = `${DRAGON_SPRITE_BASE_PATH}/Dead_Dragon_Lord.gif`;
const DRAGON_SIZE_PX = 120;
const DRAGON_ALIVE_DEPTH = 8;
const DRAGON_DEAD_DEPTH = 7;
const LABEL_OFFSET_Y = 72;
const HP_BAR_OFFSET_Y = 58;
const HP_BAR_WIDTH = 86;
const CONTACT_SHADOW_RADIUS = 48;
const CONTACT_SHADOW_COLOR = 0x000000;
const CONTACT_SHADOW_ALPHA = 0.3;
const EXPULSION_PULSE_ALPHA = 0.55;
const EXPULSION_PULSE_DISTANCE = 72;
const EXPULSION_PULSE_DURATION_MS = 140;

export class BossDragonLordEntity {
  element: Phaser.GameObjects.DOMElement;
  private readonly img: HTMLImageElement;
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
  private facing: 'up' | 'down' | 'left' | 'right';
  private spritePath: string;
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
    this.spritePath = DRAGON_SPRITE_PATHS[this.facing];
    this.shadowPulseTween = null;

    const img = document.createElement('img');
    img.src = this.spritePath;
    img.alt = 'Dragon Lord';
    img.draggable = false;
    img.style.width = `${DRAGON_SIZE_PX}px`;
    img.style.height = `${DRAGON_SIZE_PX}px`;
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';
    img.style.transformOrigin = 'center';

    this.img = img;

    this.element = scene.add.dom(x, y, this.img);
    this.element.setDepth(DRAGON_ALIVE_DEPTH);
    this.element.setOrigin(0.5, 0.5);

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
    return this.element.x;
  }

  get y(): number {
    return this.element.y;
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

    if (Math.sqrt(dx * dx + dy * dy) >= EXPULSION_PULSE_DISTANCE) {
      this.pulseCollisionShadow();
    }
  }

  private pulseCollisionShadow(): void {
    this.shadowPulseTween?.stop();
    this.collisionShadow.setFillStyle(CONTACT_SHADOW_COLOR, EXPULSION_PULSE_ALPHA);
    this.shadowPulseTween = this.element.scene.tweens.add({
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
    const dx = this.targetX - this.element.x;
    const dy = this.targetY - this.element.y;

    if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.facing = dx < 0 ? 'left' : 'right';
      } else {
        this.facing = dy < 0 ? 'up' : 'down';
      }
    }

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > SNAP_DISTANCE) {
      this.element.x = this.targetX;
      this.element.y = this.targetY;
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
    this.element.x += (this.targetX - this.element.x) * factor;
    this.element.y += (this.targetY - this.element.y) * factor;

    this.label.x = this.element.x;
    this.label.y = this.element.y - LABEL_OFFSET_Y;
    this.collisionShadow.x = this.element.x;
    this.collisionShadow.y = this.element.y;

    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBarBg.x = this.element.x;
    this.hpBarBg.y = this.element.y - HP_BAR_OFFSET_Y;
    this.hpBar.width = HP_BAR_WIDTH * hpRatio;
    this.hpBar.x = this.element.x - (HP_BAR_WIDTH - this.hpBar.width) / 2;
    this.hpBar.y = this.element.y - HP_BAR_OFFSET_Y;
    this.hpBar.fillColor = 0xff8844;

    const nextSpritePath =
      this.serverState === 'dead' ? DRAGON_DEAD_SPRITE_PATH : DRAGON_SPRITE_PATHS[this.facing];
    if (this.spritePath !== nextSpritePath) {
      this.img.src = nextSpritePath;
      this.spritePath = nextSpritePath;
    }

    const alive = this.serverState !== 'dead';
    this.element.setDepth(alive ? DRAGON_ALIVE_DEPTH : DRAGON_DEAD_DEPTH);
    this.element.setVisible(true);
    this.collisionShadow.setVisible(alive);
    this.label.setVisible(alive);
    this.hpBar.setVisible(alive);
    this.hpBarBg.setVisible(alive);
  }

  destroy(): void {
    this.element.destroy();
    this.shadowPulseTween?.stop();
    this.collisionShadow.destroy();
    this.label.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
