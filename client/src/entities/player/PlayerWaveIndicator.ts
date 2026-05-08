import Phaser from 'phaser';

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
const PURPLE_FIELD_TILE_KEY = 'purple_field';
const NUMB_RING_COLOR = 0x9aa3ad;
const NUMB_EDGE_TINT = 0xd2d7dd;
const PULL_RING_COLOR = 0xff5b5b;
const PULL_EDGE_TINT = 0xff8c8c;
const VENOM_RING_COLOR = 0x43d86b;
const VENOM_EDGE_TINT = 0x93f5a5;

interface WaveData {
  x: number;
  y: number;
  radius: number;
  state: 'windup' | 'expanding' | 'collapsing';
  kind?: 'wave' | 'numb' | 'pull' | 'venom';
}

export class PlayerWaveIndicator {
  private readonly waveRing: Phaser.GameObjects.Arc;
  private readonly waveCore: Phaser.GameObjects.Arc;
  private readonly waveEdgeSprites: Phaser.GameObjects.Image[] = [];
  private waveCenterX = 0;
  private waveCenterY = 0;
  private waveRadius = 0;
  private waveState: WaveData['state'] | null = null;
  private waveKind: NonNullable<WaveData['kind']> = 'wave';
  private wavePulseTimeMs = 0;
  private active = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.waveRing = scene.add.circle(0, 0, 1);
    this.waveRing.setDepth(4.2);
    this.waveRing.setFillStyle(WAVE_RING_COLOR, 0);
    this.waveRing.setStrokeStyle(WAVE_RING_STROKE_WIDTH, WAVE_RING_COLOR, WAVE_RING_ALPHA);
    this.waveRing.setVisible(false);

    this.waveCore = scene.add.circle(0, 0, 1, WAVE_RING_COLOR, WAVE_CORE_FILL_ALPHA);
    this.waveCore.setDepth(4.1);
    this.waveCore.setStrokeStyle(3, WAVE_RING_COLOR, WAVE_CORE_STROKE_ALPHA);
    this.waveCore.setVisible(false);
  }

  sync(wave: WaveData | null): void {
    if (!wave) {
      this.active = false;
      this.waveState = null;
      this.waveKind = 'wave';
      this.waveRing.setVisible(false);
      this.waveCore.setVisible(false);
      this.syncWaveEdgeSprites(0);
      return;
    }

    this.active = true;
    this.waveCenterX = wave.x;
    this.waveCenterY = wave.y;
    this.waveRadius = wave.radius;
    this.waveState = wave.state;
    this.waveKind = wave.kind ?? 'wave';
    this.render();
  }

  update(dt: number): void {
    if (!this.active) {
      return;
    }
    this.wavePulseTimeMs += dt;
    this.render();
  }

  destroy(): void {
    this.waveRing.destroy();
    this.waveCore.destroy();
    for (const sprite of this.waveEdgeSprites) {
      sprite.destroy();
    }
  }

  private render(): void {
    if (!this.waveState) {
      this.waveRing.setVisible(false);
      this.waveCore.setVisible(false);
      this.syncWaveEdgeSprites(0);
      return;
    }

    const ringColor =
      this.waveKind === 'numb'
        ? NUMB_RING_COLOR
        : this.waveKind === 'pull'
          ? PULL_RING_COLOR
          : this.waveKind === 'venom'
            ? VENOM_RING_COLOR
          : WAVE_RING_COLOR;
    const edgeTint =
      this.waveKind === 'numb'
        ? NUMB_EDGE_TINT
        : this.waveKind === 'pull'
          ? PULL_EDGE_TINT
          : this.waveKind === 'venom'
            ? VENOM_EDGE_TINT
            : null;

    if (this.waveState === 'windup') {
      this.waveRing.setVisible(false);
      this.syncWaveEdgeSprites(0);
      const pulse =
        1 + Math.sin(this.wavePulseTimeMs * WAVE_CORE_PULSE_SPEED) * WAVE_CORE_PULSE_SIZE;
      this.waveCore.setPosition(this.waveCenterX, this.waveCenterY);
      this.waveCore.setRadius(Math.max(this.waveRadius + pulse, WAVE_RING_STROKE_WIDTH * 2));
      this.waveCore.setFillStyle(ringColor, WAVE_CORE_FILL_ALPHA);
      this.waveCore.setStrokeStyle(3, ringColor, WAVE_CORE_STROKE_ALPHA);
      this.waveCore.setVisible(true);
      return;
    }

    this.waveCore.setVisible(false);
    this.waveRing.setPosition(this.waveCenterX, this.waveCenterY);
    this.waveRing.setRadius(Math.max(this.waveRadius, WAVE_RING_STROKE_WIDTH));
    this.waveRing.setStrokeStyle(WAVE_RING_STROKE_WIDTH, ringColor, WAVE_RING_ALPHA);
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
      if (edgeTint === null) {
        sprite.clearTint();
      } else {
        sprite.setTint(edgeTint);
      }
      sprite.setPosition(
        this.waveCenterX + Math.cos(angle) * this.waveRadius,
        this.waveCenterY + Math.sin(angle) * this.waveRadius
      );
      sprite.setVisible(true);
    }
  }

  private syncWaveEdgeSprites(targetCount: number): void {
    while (this.waveEdgeSprites.length > targetCount) {
      this.waveEdgeSprites.pop()?.destroy();
    }

    while (this.waveEdgeSprites.length < targetCount) {
      const sprite = this.scene.add.image(
        this.waveCenterX,
        this.waveCenterY,
        PURPLE_FIELD_TILE_KEY
      );
      sprite.setDisplaySize(WAVE_EDGE_SPRITE_SIZE, WAVE_EDGE_SPRITE_SIZE);
      sprite.setDepth(4.15);
      sprite.setAlpha(WAVE_EDGE_SPRITE_ALPHA);
      this.waveEdgeSprites.push(sprite);
    }

    for (const sprite of this.waveEdgeSprites) {
      sprite.setVisible(targetCount > 0);
    }
  }
}
