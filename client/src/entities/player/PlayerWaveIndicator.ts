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
const CONFUSION_RING_COLOR = 0xff20dc;
const CONFUSION_EDGE_TINT = 0x6bf8ff;
const CONFUSION_SPARKLE_TINTS = [0xff20dc, 0x6bf8ff, 0xffffff, 0xfff36b];
const CONFUSION_SPARKLE_COUNT = 14;

interface WaveData {
  x: number;
  y: number;
  radius: number;
  state: 'windup' | 'expanding' | 'collapsing';
  kind?: 'wave' | 'numb' | 'pull' | 'venom' | 'confusion';
}

export class PlayerWaveIndicator {
  private readonly waveRing: Phaser.GameObjects.Arc;
  private readonly waveGlowRing: Phaser.GameObjects.Arc;
  private readonly waveCore: Phaser.GameObjects.Arc;
  private readonly waveEdgeSprites: Phaser.GameObjects.Image[] = [];
  private readonly confusionSparkles: Phaser.GameObjects.Arc[] = [];
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
    this.waveRing.setBlendMode(Phaser.BlendModes.ADD);
    this.waveRing.setVisible(false);

    this.waveGlowRing = scene.add.circle(0, 0, 1);
    this.waveGlowRing.setDepth(4.05);
    this.waveGlowRing.setFillStyle(CONFUSION_RING_COLOR, 0.08);
    this.waveGlowRing.setStrokeStyle(16, CONFUSION_EDGE_TINT, 0.32);
    this.waveGlowRing.setBlendMode(Phaser.BlendModes.ADD);
    this.waveGlowRing.setVisible(false);

    this.waveCore = scene.add.circle(0, 0, 1, WAVE_RING_COLOR, WAVE_CORE_FILL_ALPHA);
    this.waveCore.setDepth(4.1);
    this.waveCore.setStrokeStyle(3, WAVE_RING_COLOR, WAVE_CORE_STROKE_ALPHA);
    this.waveCore.setBlendMode(Phaser.BlendModes.ADD);
    this.waveCore.setVisible(false);

    for (let i = 0; i < CONFUSION_SPARKLE_COUNT; i += 1) {
      const sparkle = scene.add.circle(0, 0, 2.2, CONFUSION_RING_COLOR, 0);
      sparkle.setDepth(4.35);
      sparkle.setBlendMode(Phaser.BlendModes.ADD);
      sparkle.setVisible(false);
      this.confusionSparkles.push(sparkle);
    }
  }

  sync(wave: WaveData | null): void {
    if (!wave) {
      this.active = false;
      this.waveState = null;
      this.waveKind = 'wave';
      this.waveRing.setVisible(false);
      this.waveGlowRing.setVisible(false);
      this.waveCore.setVisible(false);
      this.syncWaveEdgeSprites(0);
      this.setConfusionSparklesVisible(false);
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
    this.waveGlowRing.destroy();
    this.waveCore.destroy();
    for (const sprite of this.waveEdgeSprites) {
      sprite.destroy();
    }
    for (const sparkle of this.confusionSparkles) {
      sparkle.destroy();
    }
  }

  private render(): void {
    if (!this.waveState) {
      this.waveRing.setVisible(false);
      this.waveGlowRing.setVisible(false);
      this.waveCore.setVisible(false);
      this.syncWaveEdgeSprites(0);
      this.setConfusionSparklesVisible(false);
      return;
    }

    const ringColor =
      this.waveKind === 'numb'
        ? NUMB_RING_COLOR
        : this.waveKind === 'pull'
          ? PULL_RING_COLOR
          : this.waveKind === 'venom'
            ? VENOM_RING_COLOR
            : this.waveKind === 'confusion'
              ? CONFUSION_RING_COLOR
              : WAVE_RING_COLOR;
    const edgeTint =
      this.waveKind === 'numb'
        ? NUMB_EDGE_TINT
        : this.waveKind === 'pull'
          ? PULL_EDGE_TINT
          : this.waveKind === 'venom'
            ? VENOM_EDGE_TINT
            : this.waveKind === 'confusion'
              ? CONFUSION_EDGE_TINT
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
      if (this.waveKind === 'confusion') {
        this.renderConfusionGlow(this.waveRadius + pulse * 2);
        this.renderConfusionSparkles(this.waveRadius + 20 + pulse * 2);
      } else {
        this.waveGlowRing.setVisible(false);
        this.setConfusionSparklesVisible(false);
      }
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

    if (this.waveKind === 'confusion') {
      this.renderConfusionGlow(this.waveRadius + 10);
      this.renderConfusionSparkles(this.waveRadius + 8);
    } else {
      this.waveGlowRing.setVisible(false);
      this.setConfusionSparklesVisible(false);
    }
  }

  private renderConfusionGlow(radius: number): void {
    const pulse = (Math.sin(this.wavePulseTimeMs * 0.015) + 1) / 2;
    this.waveGlowRing.setPosition(this.waveCenterX, this.waveCenterY);
    this.waveGlowRing.setRadius(Math.max(radius + pulse * 12, WAVE_RING_STROKE_WIDTH * 2));
    this.waveGlowRing.setFillStyle(CONFUSION_RING_COLOR, 0.08 + pulse * 0.05);
    this.waveGlowRing.setStrokeStyle(18, CONFUSION_EDGE_TINT, 0.22 + pulse * 0.22);
    this.waveGlowRing.setVisible(true);
  }

  private renderConfusionSparkles(radius: number): void {
    for (let i = 0; i < this.confusionSparkles.length; i += 1) {
      const sparkle = this.confusionSparkles[i];
      const orbit =
        this.wavePulseTimeMs * 0.006 + (Math.PI * 2 * i) / this.confusionSparkles.length;
      const wave = (Math.sin(this.wavePulseTimeMs * 0.017 + i * 1.7) + 1) / 2;
      sparkle.setPosition(
        this.waveCenterX + Math.cos(orbit) * (radius + wave * 18),
        this.waveCenterY + Math.sin(orbit) * (radius + wave * 18)
      );
      sparkle.setFillStyle(
        CONFUSION_SPARKLE_TINTS[
          (i + Math.floor(this.wavePulseTimeMs / 120)) % CONFUSION_SPARKLE_TINTS.length
        ],
        0.3 + wave * 0.58
      );
      sparkle.setScale(0.75 + wave * 1.15);
      sparkle.setVisible(true);
    }
  }

  private setConfusionSparklesVisible(visible: boolean): void {
    for (const sparkle of this.confusionSparkles) {
      sparkle.setVisible(visible);
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
