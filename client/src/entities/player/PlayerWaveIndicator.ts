import Phaser from 'phaser';

const WAVE_RING_COLOR = 0xc06bff;
const WAVE_RING_ALPHA = 0.92;
const WAVE_RING_STROKE_WIDTH = 10;
const WAVE_EDGE_SPRITE_SIZE = 42;
const WAVE_EDGE_SPRITE_ALPHA = 0.68;
const WAVE_EDGE_STEP = 92;
const WAVE_EDGE_MAX_SPRITES = 10;
const PURPLE_FIELD_TILE_KEY = 'purple_field';

interface WaveData {
  x: number;
  y: number;
  radius: number;
}

export class PlayerWaveIndicator {
  private readonly waveRing: Phaser.GameObjects.Arc;
  private readonly waveEdgeSprites: Phaser.GameObjects.Image[] = [];
  private waveCenterX = 0;
  private waveCenterY = 0;
  private waveRadius = 0;
  private active = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.waveRing = scene.add.circle(0, 0, 1);
    this.waveRing.setDepth(4.2);
    this.waveRing.setFillStyle(WAVE_RING_COLOR, 0);
    this.waveRing.setStrokeStyle(WAVE_RING_STROKE_WIDTH, WAVE_RING_COLOR, WAVE_RING_ALPHA);
    this.waveRing.setVisible(false);
  }

  sync(wave: WaveData | null): void {
    if (!wave) {
      this.active = false;
      this.waveRing.setVisible(false);
      this.syncWaveEdgeSprites(0);
      return;
    }

    this.active = true;
    this.waveCenterX = wave.x;
    this.waveCenterY = wave.y;
    this.waveRadius = wave.radius;
    this.render();
  }

  update(): void {
    if (!this.active) {
      return;
    }
    this.render();
  }

  destroy(): void {
    this.waveRing.destroy();
    for (const sprite of this.waveEdgeSprites) {
      sprite.destroy();
    }
  }

  private render(): void {
    this.waveRing.setPosition(this.waveCenterX, this.waveCenterY);
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
