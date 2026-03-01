import Phaser from 'phaser';

const LERP_BASE = 0.25;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 260;
const DRAGON_GIF_PATH = '/assets/sprites/monsters/Dragon_Lord.gif';
const DRAGON_SIZE_PX = 120;
const LABEL_OFFSET_Y = 72;
const HP_BAR_OFFSET_Y = 58;
const HP_BAR_WIDTH = 86;
const DEBUG_COLLISION_SIZE = 96;
const DEBUG_COLLISION_COLOR = 0xff4fd8;
const DEBUG_COLLISION_ALPHA = 0.8;

export class BossDragonLordEntity {
  element: Phaser.GameObjects.DOMElement;
  private readonly img: HTMLImageElement;
  collisionDebug: Phaser.GameObjects.Rectangle;
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
  private facing: 'left' | 'right';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.prevX = x;
    this.prevY = y;
    this.hp = 220;
    this.maxHp = 220;
    this.serverState = 'idle';
    this.phase = 1;
    this.facing = 'right';

    const img = document.createElement('img');
    img.src = DRAGON_GIF_PATH;
    img.alt = 'Dragon Lord';
    img.draggable = false;
    img.style.width = `${DRAGON_SIZE_PX}px`;
    img.style.height = `${DRAGON_SIZE_PX}px`;
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';
    img.style.transformOrigin = 'center';

    this.img = img;

    this.element = scene.add.dom(x, y, this.img);
    this.element.setDepth(8);
    this.element.setOrigin(0.5, 0.5);

    this.collisionDebug = scene.add.rectangle(
      x,
      y,
      DEBUG_COLLISION_SIZE,
      DEBUG_COLLISION_SIZE,
      DEBUG_COLLISION_COLOR,
      DEBUG_COLLISION_ALPHA
    );
    this.collisionDebug.setDepth(8.5);

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
    if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0.5) {
      this.facing = dx < 0 ? 'left' : 'right';
    }
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

    this.label.x = this.element.x;
    this.label.y = this.element.y - LABEL_OFFSET_Y;
    this.collisionDebug.x = this.element.x;
    this.collisionDebug.y = this.element.y;

    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBarBg.x = this.element.x;
    this.hpBarBg.y = this.element.y - HP_BAR_OFFSET_Y;
    this.hpBar.width = HP_BAR_WIDTH * hpRatio;
    this.hpBar.x = this.element.x - (HP_BAR_WIDTH - this.hpBar.width) / 2;
    this.hpBar.y = this.element.y - HP_BAR_OFFSET_Y;
    this.hpBar.fillColor = 0xff8844;

    const visible = this.serverState !== 'dead';
    this.img.style.transform = this.facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)';
    this.element.setVisible(visible);
    this.collisionDebug.setVisible(visible);
    this.label.setVisible(visible);
    this.hpBar.setVisible(visible);
    this.hpBarBg.setVisible(visible);
  }

  destroy(): void {
    this.element.destroy();
    this.collisionDebug.destroy();
    this.label.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
