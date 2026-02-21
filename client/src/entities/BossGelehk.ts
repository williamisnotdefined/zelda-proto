import Phaser from 'phaser';

const BOSS_SIZE = 64;
const LERP_SPEED = 0.25;

interface IceZoneData {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AoeData {
  x: number;
  y: number;
  radius: number;
  timer: number;
}

export class BossGelehkEntity {
  sprite: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  serverState: string;
  phase: number;

  private iceZoneGraphics: Phaser.GameObjects.Rectangle[];
  private aoeGraphics: Phaser.GameObjects.Arc[];
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.targetX = x;
    this.targetY = y;
    this.hp = 1000;
    this.maxHp = 1000;
    this.serverState = 'idle';
    this.phase = 1;
    this.iceZoneGraphics = [];
    this.aoeGraphics = [];

    this.sprite = scene.add.rectangle(x, y, BOSS_SIZE, BOSS_SIZE, 0x6666ff);
    this.sprite.setDepth(8);

    this.label = scene.add.text(x, y - 44, 'GELEHK', {
      fontSize: '12px',
      color: '#aaaaff',
      fontStyle: 'bold',
      align: 'center',
    });
    this.label.setOrigin(0.5, 1);
    this.label.setDepth(13);
  }

  updateFromServer(
    x: number,
    y: number,
    hp: number,
    maxHp: number,
    state: string,
    phase: number,
    iceZones: IceZoneData[],
    aoeIndicators: AoeData[]
  ): void {
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.phase = phase;

    this.updateIceZones(iceZones);
    this.updateAoeIndicators(aoeIndicators);
  }

  private updateIceZones(zones: IceZoneData[]): void {
    for (const g of this.iceZoneGraphics) g.destroy();
    this.iceZoneGraphics = [];

    for (const zone of zones) {
      const rect = this.scene.add.rectangle(
        zone.x + zone.width / 2,
        zone.y + zone.height / 2,
        zone.width,
        zone.height,
        0x88ccff,
        0.3
      );
      rect.setDepth(2);
      this.iceZoneGraphics.push(rect);
    }
  }

  private updateAoeIndicators(aoes: AoeData[]): void {
    for (const g of this.aoeGraphics) g.destroy();
    this.aoeGraphics = [];

    for (const aoe of aoes) {
      const circle = this.scene.add.circle(aoe.x, aoe.y, aoe.radius, 0xff0000, 0.25);
      circle.setDepth(3);
      this.aoeGraphics.push(circle);
    }
  }

  update(): void {
    this.sprite.x += (this.targetX - this.sprite.x) * LERP_SPEED;
    this.sprite.y += (this.targetY - this.sprite.y) * LERP_SPEED;

    this.label.x = this.sprite.x;
    this.label.y = this.sprite.y - 44;

    if (this.serverState === 'dead') {
      this.sprite.setAlpha(0.2);
      this.label.setAlpha(0.2);
    } else if (this.serverState === 'enraged') {
      this.sprite.fillColor = 0xff4444;
    } else if (this.serverState === 'charging') {
      this.sprite.fillColor = 0xff8800;
    } else {
      this.sprite.fillColor = 0x6666ff;
    }

    const phaseColors: Record<number, number> = { 1: 0x6666ff, 2: 0x8844ff, 3: 0xff4444 };
    if (this.serverState !== 'charging' && this.serverState !== 'enraged') {
      this.sprite.fillColor = phaseColors[this.phase] ?? 0x6666ff;
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
    for (const g of this.iceZoneGraphics) g.destroy();
    for (const g of this.aoeGraphics) g.destroy();
  }
}
