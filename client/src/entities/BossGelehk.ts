import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import type { WaveIndicator } from '@/shared';
import Phaser from 'phaser';

/** Base lerp factors per 16.667ms (60fps) frame. */
const LERP_BASE = 0.25;
const BOSS_SCALE = 2.5;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 260;
const AOE_TELEGRAPH_COLOR = 0x808080;
const AOE_TELEGRAPH_ALPHA = 0.28;
const PURPLE_FIELD_TILE_KEY = 'purple_field';
const PURPLE_FIELD_TILE_SIZE = 58;
const PURPLE_FIELD_TILE_STEP = 34;
const PURPLE_FIELD_TILE_ALPHA = 0.48;
const CONTACT_SHADOW_RADIUS = 36;
const CONTACT_SHADOW_COLOR = 0x000000;
const CONTACT_SHADOW_ALPHA = 0.3;
const CONTACT_SHADOW_OFFSET_Y = 8;
const EXPULSION_PULSE_ALPHA = 0.55;
const EXPULSION_PULSE_DISTANCE = 66;
const EXPULSION_PULSE_DURATION_MS = 140;
const WAVE_RING_COLOR = 0xc06bff;
const WAVE_RING_ALPHA = 0.92;
const WAVE_RING_STROKE_WIDTH = 10;
const WAVE_CORE_FILL_ALPHA = 0.2;
const WAVE_CORE_STROKE_ALPHA = 0.75;
const WAVE_CORE_PULSE_SPEED = 0.012;
const WAVE_CORE_PULSE_SIZE = 8;
const WAVE_EDGE_SPRITE_SIZE = 42;
const WAVE_EDGE_SPRITE_ALPHA = 0.68;
const WAVE_EDGE_STEP = 92;
const WAVE_EDGE_MAX_SPRITES = 10;

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

interface AoeTileOverlay {
  radius: number;
  offsets: Array<{ x: number; y: number }>;
  sprites: Phaser.GameObjects.Image[];
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
  private aoeTileOverlays: AoeTileOverlay[];
  private waveRing: Phaser.GameObjects.Arc;
  private waveCore: Phaser.GameObjects.Arc;
  private waveEdgeSprites: Phaser.GameObjects.Image[];
  private waveState: 'windup' | null;
  private waveCenterX: number;
  private waveCenterY: number;
  private waveRadius: number;
  private wavePulseTimeMs: number;
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
    this.aoeTileOverlays = [];
    this.lastIceZoneCount = 0;
    this.lastAoeCount = 0;
    this.shadowPulseTween = null;
    this.waveEdgeSprites = [];
    this.waveState = null;
    this.waveCenterX = x;
    this.waveCenterY = y;
    this.waveRadius = 0;
    this.wavePulseTimeMs = 0;

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

    this.waveRing = scene.add.circle(x, y, 1);
    this.waveRing.setDepth(4.2);
    this.waveRing.setFillStyle(WAVE_RING_COLOR, 0);
    this.waveRing.setStrokeStyle(WAVE_RING_STROKE_WIDTH, WAVE_RING_COLOR, WAVE_RING_ALPHA);
    this.waveRing.setVisible(false);

    this.waveCore = scene.add.circle(x, y, 1, WAVE_RING_COLOR, WAVE_CORE_FILL_ALPHA);
    this.waveCore.setDepth(4.1);
    this.waveCore.setStrokeStyle(3, WAVE_RING_COLOR, WAVE_CORE_STROKE_ALPHA);
    this.waveCore.setVisible(false);

    this.label = scene.add.text(x, y - 56, 'GELEHK', {
      fontSize: '12px',
      color: '#ffdf8d',
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
    aoeIndicators: AoeData[],
    waveIndicator: WaveIndicator | null
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
    this.updateWaveIndicator(waveIndicator);
  }

  private updateWaveIndicator(wave: WaveIndicator | null): void {
    if (!wave) {
      this.waveState = null;
      this.waveCenterX = this.sprite.x;
      this.waveCenterY = this.sprite.y;
      this.waveRadius = 0;
      this.waveRing.setVisible(false);
      this.waveCore.setVisible(false);
      this.syncWaveEdgeSprites(0);
      return;
    }

    this.waveState = wave.state === 'windup' ? 'windup' : null;
    this.waveCenterX = wave.x;
    this.waveCenterY = wave.y;
    this.waveRadius = wave.radius;
    this.renderWaveVisuals(this.waveCenterX, this.waveCenterY);
  }

  private renderWaveVisuals(centerX: number, centerY: number): void {
    if (!this.waveState) {
      this.waveRing.setVisible(false);
      this.waveCore.setVisible(false);
      this.syncWaveEdgeSprites(0);
      return;
    }

    if (this.waveState === 'windup') {
      this.waveRing.setVisible(false);
      this.syncWaveEdgeSprites(0);
      const pulse =
        1 + Math.sin(this.wavePulseTimeMs * WAVE_CORE_PULSE_SPEED) * WAVE_CORE_PULSE_SIZE;
      this.waveCore.setPosition(centerX, centerY);
      this.waveCore.setRadius(Math.max(this.waveRadius + pulse, WAVE_RING_STROKE_WIDTH * 2));
      this.waveCore.setFillStyle(WAVE_RING_COLOR, WAVE_CORE_FILL_ALPHA);
      this.waveCore.setStrokeStyle(3, WAVE_RING_COLOR, WAVE_CORE_STROKE_ALPHA);
      this.waveCore.setVisible(true);
      return;
    }

    this.waveCore.setVisible(false);
    this.waveRing.setPosition(centerX, centerY);
    this.waveRing.setRadius(Math.max(this.waveRadius, WAVE_RING_STROKE_WIDTH));
    this.waveRing.setVisible(true);

    const circumference = Math.max(this.waveRadius * Math.PI * 2, WAVE_EDGE_STEP * 4);
    const spriteCount = Math.max(
      4,
      Math.min(WAVE_EDGE_MAX_SPRITES, Math.round(circumference / WAVE_EDGE_STEP))
    );
    this.syncWaveEdgeSprites(spriteCount);
    const angleOffset = (this.waveRadius / 90) % (Math.PI * 2);

    for (let index = 0; index < this.waveEdgeSprites.length; index += 1) {
      const sprite = this.waveEdgeSprites[index];
      const angle = angleOffset + (Math.PI * 2 * index) / this.waveEdgeSprites.length;
      sprite.setPosition(
        centerX + Math.cos(angle) * this.waveRadius,
        centerY + Math.sin(angle) * this.waveRadius
      );
      sprite.setVisible(true);
    }
  }

  private syncWaveEdgeSprites(targetCount: number): void {
    while (this.waveEdgeSprites.length > targetCount) {
      this.waveEdgeSprites.pop()?.destroy();
    }

    while (this.waveEdgeSprites.length < targetCount) {
      const sprite = this.scene.add.image(this.sprite.x, this.sprite.y, PURPLE_FIELD_TILE_KEY);
      sprite.setDisplaySize(WAVE_EDGE_SPRITE_SIZE, WAVE_EDGE_SPRITE_SIZE);
      sprite.setDepth(4.15);
      sprite.setAlpha(WAVE_EDGE_SPRITE_ALPHA);
      this.waveEdgeSprites.push(sprite);
    }

    for (const sprite of this.waveEdgeSprites) {
      sprite.setVisible(targetCount > 0);
    }
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
        const overlay = this.aoeTileOverlays[i];
        if (!overlay || overlay.radius !== aoe.radius) {
          this.rebuildAoeIndicator(i, aoe);
          continue;
        }
        circle.setPosition(aoe.x, aoe.y);
        circle.setRadius(aoe.radius);
        circle.setFillStyle(AOE_TELEGRAPH_COLOR, AOE_TELEGRAPH_ALPHA);
        circle.setVisible(!aoe.hit);
        for (let t = 0; t < overlay.sprites.length; t++) {
          const sprite = overlay.sprites[t];
          const offset = overlay.offsets[t];
          sprite.setPosition(aoe.x + offset.x, aoe.y + offset.y);
          sprite.setVisible(aoe.hit);
        }
      }
      return;
    }

    for (const g of this.aoeGraphics) g.destroy();
    this.destroyAoeTileOverlays();
    this.aoeGraphics = [];

    for (const aoe of aoes) {
      const circle = this.scene.add.circle(
        aoe.x,
        aoe.y,
        aoe.radius,
        AOE_TELEGRAPH_COLOR,
        AOE_TELEGRAPH_ALPHA
      );
      circle.setDepth(3);
      circle.setVisible(!aoe.hit);
      this.aoeGraphics.push(circle);

      const overlay = this.createAoeTileOverlay(aoe.x, aoe.y, aoe.radius);
      for (const sprite of overlay.sprites) {
        sprite.setVisible(aoe.hit);
      }
      this.aoeTileOverlays.push(overlay);
    }
    this.lastAoeCount = aoes.length;
  }

  private createAoeTileOverlay(x: number, y: number, radius: number): AoeTileOverlay {
    const offsets: Array<{ x: number; y: number }> = [];
    const sprites: Phaser.GameObjects.Image[] = [];

    for (let dy = -radius; dy <= radius; dy += PURPLE_FIELD_TILE_STEP) {
      for (let dx = -radius; dx <= radius; dx += PURPLE_FIELD_TILE_STEP) {
        const distSq = dx * dx + dy * dy;
        if (distSq > radius * radius) continue;
        const offset = { x: dx, y: dy };
        offsets.push(offset);
        const sprite = this.scene.add.image(x + dx, y + dy, PURPLE_FIELD_TILE_KEY);
        sprite.setDisplaySize(PURPLE_FIELD_TILE_SIZE, PURPLE_FIELD_TILE_SIZE);
        sprite.setDepth(2.8);
        sprite.setAlpha(PURPLE_FIELD_TILE_ALPHA);
        sprites.push(sprite);
      }
    }

    return { radius, offsets, sprites };
  }

  private rebuildAoeIndicator(index: number, aoe: AoeData): void {
    this.aoeGraphics[index]?.destroy();
    for (const sprite of this.aoeTileOverlays[index]?.sprites ?? []) {
      sprite.destroy();
    }

    const circle = this.scene.add.circle(
      aoe.x,
      aoe.y,
      aoe.radius,
      AOE_TELEGRAPH_COLOR,
      AOE_TELEGRAPH_ALPHA
    );
    circle.setDepth(3);
    circle.setVisible(!aoe.hit);
    this.aoeGraphics[index] = circle;

    const overlay = this.createAoeTileOverlay(aoe.x, aoe.y, aoe.radius);
    for (const sprite of overlay.sprites) {
      sprite.setVisible(aoe.hit);
    }
    this.aoeTileOverlays[index] = overlay;
  }

  private destroyAoeTileOverlays(): void {
    for (const overlay of this.aoeTileOverlays) {
      for (const sprite of overlay.sprites) {
        sprite.destroy();
      }
    }
    this.aoeTileOverlays = [];
  }

  update(dt: number): void {
    this.wavePulseTimeMs += dt;

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

    this.label.x = this.sprite.x;
    this.label.y = this.sprite.y - 56;
    this.collisionShadow.x = this.sprite.x;
    this.collisionShadow.y = this.sprite.y + CONTACT_SHADOW_OFFSET_Y;
    if (this.waveState) {
      this.renderWaveVisuals(this.waveCenterX, this.waveCenterY);
    }

    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBarBg.x = this.sprite.x;
    this.hpBarBg.y = this.sprite.y - 46;
    this.hpBar.width = 86 * hpRatio;
    this.hpBar.x = this.sprite.x - (86 - this.hpBar.width) / 2;
    this.hpBar.y = this.sprite.y - 46;
    this.hpBar.fillColor = this.phase === 3 ? 0xff4444 : this.phase === 2 ? 0x8844ff : 0x6666ff;

    this.updateAnimation();
    this.updateTint();

    const alive = this.serverState !== 'dead';
    this.waveRing.setVisible(alive && this.waveRing.visible);
    this.waveCore.setVisible(alive && this.waveCore.visible);
    for (const sprite of this.waveEdgeSprites) {
      sprite.setVisible(alive && sprite.visible);
    }
    this.collisionShadow.setVisible(alive);
    this.label.setVisible(alive);
    this.hpBar.setVisible(alive);
    this.hpBarBg.setVisible(alive);
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
    } else if (state === 'jumping' || state === 'targeting' || state === 'wave_windup') {
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

    if (this.serverState === 'wave_windup') {
      this.sprite.setTint(0xd67cff);
    } else if (this.serverState === 'enraged' || this.phase === 3) {
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
    this.waveRing.destroy();
    this.waveCore.destroy();
    for (const sprite of this.waveEdgeSprites) sprite.destroy();
    this.label.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
    for (const g of this.iceZoneGraphics) g.destroy();
    for (const g of this.aoeGraphics) g.destroy();
    this.destroyAoeTileOverlays();
  }
}
