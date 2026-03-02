import Phaser from 'phaser';

/** Base lerp factors per 16.667ms (60fps) frame. */
const LERP_BASE = 0.25;
const BOSS_SCALE = 2.5;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 260;
const AOE_TELEGRAPH_COLOR = 0xffdd33;
const AOE_HIT_COLOR = 0xff0000;
const CONTACT_SHADOW_RADIUS = 36;
const CONTACT_SHADOW_COLOR = 0x000000;
const CONTACT_SHADOW_ALPHA = 0.3;
const CONTACT_SHADOW_OFFSET_Y = 8;
const EXPULSION_PULSE_ALPHA = 0.55;
const EXPULSION_PULSE_DISTANCE = 66;
const EXPULSION_PULSE_DURATION_MS = 140;

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
  hit: boolean;
}

export class BossGelehkEntity {
  sprite: Phaser.GameObjects.Sprite;
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
  private facing: string;
  private currentAnimKey: string;
  private deathPlayed: boolean;
  private iceZoneGraphics: Phaser.GameObjects.Rectangle[];
  private aoeGraphics: Phaser.GameObjects.Arc[];
  private scene: Phaser.Scene;
  private lastIceZoneCount: number;
  private lastAoeCount: number;
  private shadowPulseTween: Phaser.Tweens.Tween | null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.targetX = x;
    this.targetY = y;
    this.prevX = x;
    this.prevY = y;
    this.hp = 1000;
    this.maxHp = 1000;
    this.serverState = 'idle';
    this.phase = 1;
    this.facing = 'down';
    this.currentAnimKey = '';
    this.deathPlayed = false;
    this.iceZoneGraphics = [];
    this.aoeGraphics = [];
    this.lastIceZoneCount = 0;
    this.lastAoeCount = 0;
    this.shadowPulseTween = null;

    this.sprite = scene.add.sprite(x, y, 'skeleton');
    this.sprite.setScale(BOSS_SCALE);
    this.sprite.setDepth(8);

    this.collisionShadow = scene.add.circle(
      x,
      y,
      CONTACT_SHADOW_RADIUS,
      CONTACT_SHADOW_COLOR,
      CONTACT_SHADOW_ALPHA
    );
    this.collisionShadow.setDepth(7.5);

    this.label = scene.add.text(x, y - 56, 'GELEHK', {
      fontSize: '12px',
      color: '#aaaaff',
      fontStyle: 'bold',
      align: 'center',
    });
    this.label.setOrigin(0.5, 1);
    this.label.setDepth(13);

    this.hpBarBg = scene.add.rectangle(x, y - 46, 86, 6, 0x222222, 0.9);
    this.hpBarBg.setDepth(12);

    this.hpBar = scene.add.rectangle(x, y - 46, 86, 6, 0x6666ff);
    this.hpBar.setDepth(13);
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
    phase: number,
    iceZones: IceZoneData[],
    aoeIndicators: AoeData[]
  ): void {
    this.prevX = this.targetX;
    this.prevY = this.targetY;
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.phase = phase;

    const dx = x - this.prevX;
    const dy = y - this.prevY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      if (Math.abs(dx) > Math.abs(dy)) {
        this.facing = dx > 0 ? 'right' : 'left';
      } else {
        this.facing = dy > 0 ? 'down' : 'up';
      }
    }

    if (dx * dx + dy * dy >= EXPULSION_PULSE_DISTANCE * EXPULSION_PULSE_DISTANCE) {
      this.pulseCollisionShadow();
    }

    this.updateIceZones(iceZones);
    this.updateAoeIndicators(aoeIndicators);
  }

  private pulseCollisionShadow(): void {
    this.shadowPulseTween?.stop();
    this.collisionShadow.setFillStyle(CONTACT_SHADOW_COLOR, EXPULSION_PULSE_ALPHA);
    this.shadowPulseTween = this.scene.tweens.add({
      targets: this.collisionShadow,
      alpha: CONTACT_SHADOW_ALPHA,
      duration: EXPULSION_PULSE_DURATION_MS,
      ease: 'Sine.Out',
      onComplete: () => {
        this.shadowPulseTween = null;
      },
    });
  }

  private updateIceZones(zones: IceZoneData[]): void {
    if (zones.length === this.lastIceZoneCount && zones.length === this.iceZoneGraphics.length) {
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        const rect = this.iceZoneGraphics[i];
        rect.setPosition(zone.x + zone.width / 2, zone.y + zone.height / 2);
        rect.setSize(zone.width, zone.height);
      }
      return;
    }

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
    this.lastIceZoneCount = zones.length;
  }

  private updateAoeIndicators(aoes: AoeData[]): void {
    if (aoes.length === this.lastAoeCount && aoes.length === this.aoeGraphics.length) {
      for (let i = 0; i < aoes.length; i++) {
        const aoe = aoes[i];
        const circle = this.aoeGraphics[i];
        circle.setPosition(aoe.x, aoe.y);
        circle.setRadius(aoe.radius);
        circle.setFillStyle(aoe.hit ? AOE_HIT_COLOR : AOE_TELEGRAPH_COLOR, 0.25);
      }
      return;
    }

    for (const g of this.aoeGraphics) g.destroy();
    this.aoeGraphics = [];

    for (const aoe of aoes) {
      const circle = this.scene.add.circle(
        aoe.x,
        aoe.y,
        aoe.radius,
        aoe.hit ? AOE_HIT_COLOR : AOE_TELEGRAPH_COLOR,
        0.25
      );
      circle.setDepth(3);
      this.aoeGraphics.push(circle);
    }
    this.lastAoeCount = aoes.length;
  }

  update(dt: number): void {
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
    this.sprite.x += (this.targetX - this.sprite.x) * factor;
    this.sprite.y += (this.targetY - this.sprite.y) * factor;

    this.label.x = this.sprite.x;
    this.label.y = this.sprite.y - 56;
    this.collisionShadow.x = this.sprite.x;
    this.collisionShadow.y = this.sprite.y + CONTACT_SHADOW_OFFSET_Y;

    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBarBg.x = this.sprite.x;
    this.hpBarBg.y = this.sprite.y - 46;
    this.hpBar.width = 86 * hpRatio;
    this.hpBar.x = this.sprite.x - (86 - this.hpBar.width) / 2;
    this.hpBar.y = this.sprite.y - 46;
    this.hpBar.fillColor = this.phase === 3 ? 0xff4444 : this.phase === 2 ? 0x8844ff : 0x6666ff;

    this.updateAnimation();
    this.updateTint();

    const visible = this.serverState !== 'dead';
    this.collisionShadow.setVisible(visible);
  }

  private updateAnimation(): void {
    const state = this.serverState;

    let animKey: string;
    let flipX = false;

    if (state === 'dead') {
      animKey = 'skeleton_death';
      if (!this.deathPlayed) {
        this.sprite.setAlpha(1);
        this.playIfExists(animKey);
        this.deathPlayed = true;
        this.currentAnimKey = animKey;
      }
      return;
    }

    this.deathPlayed = false;
    this.sprite.setAlpha(1);

    const dirSuffix = this.facing === 'left' ? 'right' : this.facing;
    flipX = this.facing === 'left';

    if (state === 'charging') {
      animKey = `skeleton_attack_${dirSuffix}`;
    } else if (state === 'jumping' || state === 'targeting') {
      animKey = `skeleton_attack_${dirSuffix}`;
    } else if (state === 'attacking') {
      animKey = `skeleton_attack_${dirSuffix}`;
    } else if (state === 'chasing') {
      animKey = `skeleton_move_${dirSuffix}`;
    } else if (state === 'enraged') {
      animKey = `skeleton_move_${dirSuffix}`;
    } else if (state === 'spawning_minions') {
      animKey = `skeleton_damaged_${dirSuffix}`;
    } else {
      animKey = `skeleton_idle_${dirSuffix}`;
    }

    this.sprite.setFlipX(flipX);

    if (this.currentAnimKey !== animKey) {
      this.playIfExists(animKey);
      this.currentAnimKey = animKey;
    }
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

  private updateTint(): void {
    if (this.serverState === 'dead') {
      this.sprite.clearTint();
      this.sprite.setAlpha(0.4);
      return;
    }

    if (this.serverState === 'enraged' || this.phase === 3) {
      this.sprite.setTint(0xff6666);
    } else if (this.serverState === 'charging') {
      this.sprite.setTint(0xff8800);
    } else if (this.phase === 2) {
      this.sprite.setTint(0xaa88ff);
    } else {
      this.sprite.clearTint();
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadowPulseTween?.stop();
    this.collisionShadow.destroy();
    this.label.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
    for (const g of this.iceZoneGraphics) g.destroy();
    for (const g of this.aoeGraphics) g.destroy();
  }
}
