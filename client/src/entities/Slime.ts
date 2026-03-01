import Phaser from 'phaser';

const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;
const SLIME_GIF_PATH = '/assets/sprites/monsters/Slime.gif';
const SLIME_SIZE_PX = 44;
const HP_BAR_WIDTH = 24;
const HP_BAR_OFFSET_Y = 40;
const CONTACT_SHADOW_RADIUS = 24;
const CONTACT_SHADOW_COLOR = 0x000000;
const CONTACT_SHADOW_ALPHA = 0.3;
const EXPULSION_PULSE_ALPHA = 0.55;
const EXPULSION_PULSE_DISTANCE = 44;
const EXPULSION_PULSE_DURATION_MS = 130;

export class SlimeEntity {
  element: Phaser.GameObjects.DOMElement;
  collisionShadow: Phaser.GameObjects.Arc;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  serverState: string;
  private prevX: number;
  private prevY: number;
  private shadowPulseTween: Phaser.Tweens.Tween | null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.hp = 38;
    this.maxHp = 38;
    this.serverState = 'idle';
    this.prevX = x;
    this.prevY = y;
    this.shadowPulseTween = null;

    const img = document.createElement('img');
    img.src = SLIME_GIF_PATH;
    img.alt = 'Slime';
    img.draggable = false;
    img.style.width = `${SLIME_SIZE_PX}px`;
    img.style.height = `${SLIME_SIZE_PX}px`;
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';

    this.element = scene.add.dom(x, y, img);
    this.element.setDepth(8);
    this.element.setOrigin(0.5, 0.5);

    this.collisionShadow = scene.add.circle(
      x,
      y,
      CONTACT_SHADOW_RADIUS,
      CONTACT_SHADOW_COLOR,
      CONTACT_SHADOW_ALPHA
    );
    this.collisionShadow.setDepth(7.5);

    this.hpBarBg = scene.add.rectangle(x, y - HP_BAR_OFFSET_Y, HP_BAR_WIDTH, 3, 0x333333);
    this.hpBarBg.setDepth(9);

    this.hpBar = scene.add.rectangle(x, y - HP_BAR_OFFSET_Y, HP_BAR_WIDTH, 3, 0xff4444);
    this.hpBar.setDepth(10);
  }

  get x(): number {
    return this.element.x;
  }

  get y(): number {
    return this.element.y;
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
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > SNAP_DISTANCE) {
      this.element.x = this.targetX;
      this.element.y = this.targetY;
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
    this.element.x += (this.targetX - this.element.x) * factor;
    this.element.y += (this.targetY - this.element.y) * factor;

    this.hpBarBg.x = this.element.x;
    this.hpBarBg.y = this.element.y - HP_BAR_OFFSET_Y;
    this.collisionShadow.x = this.element.x;
    this.collisionShadow.y = this.element.y;

    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBar.width = HP_BAR_WIDTH * hpRatio;
    this.hpBar.x = this.element.x - (HP_BAR_WIDTH - this.hpBar.width) / 2;
    this.hpBar.y = this.element.y - HP_BAR_OFFSET_Y;

    const visible = this.serverState !== 'dead';
    this.element.setVisible(visible);
    this.collisionShadow.setVisible(visible);
    this.hpBar.setVisible(visible);
    this.hpBarBg.setVisible(visible);
  }

  destroy(): void {
    this.element.destroy();
    this.shadowPulseTween?.stop();
    this.collisionShadow.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
