import { getDirectionVector } from '@/game-core';
import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import { HAZARD_KINDS, type Direction, type HazardSnapshot } from '@/shared';
import { hazardDefinitions } from '@/shared/definitions';
import type Phaser from 'phaser';

const LERP_BASE = 0.36;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;
const BLADE_WAVE_TTL_MS = hazardDefinitions[HAZARD_KINDS.KNIGHT_BLADE_WAVE].ttlMs;
const DEFAULT_TINT = 0xffd76b;
const CORE_TINT = 0xffffff;
const SPARKLE_COUNT = 6;
const ADD_BLEND_MODE = 'ADD';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rotationForDirection(direction: Direction): number {
  switch (direction) {
    case 'up':
      return -Math.PI / 2;
    case 'down':
      return Math.PI / 2;
    case 'left':
      return Math.PI;
    case 'right':
      return 0;
  }
}

export class KnightBladeWaveHazardEntity {
  private readonly glow: Phaser.GameObjects.Ellipse;
  private readonly core: Phaser.GameObjects.Ellipse;
  private readonly edge: Phaser.GameObjects.Rectangle;
  private readonly backEdge: Phaser.GameObjects.Rectangle;
  private readonly sparkles: Phaser.GameObjects.Arc[] = [];
  private targetX: number;
  private targetY: number;
  private direction: Direction = 'right';
  private tint = DEFAULT_TINT;
  private elapsedMs = 0;

  constructor(scene: Phaser.Scene, snapshot: HazardSnapshot) {
    this.targetX = snapshot.x;
    this.targetY = snapshot.y;
    this.direction = snapshot.direction ?? 'right';
    this.tint = snapshot.tint ?? DEFAULT_TINT;

    this.glow = scene.add.ellipse(snapshot.x, snapshot.y, 84, 26, this.tint, 0.18);
    this.glow.setDepth(10.18);
    this.glow.setBlendMode(ADD_BLEND_MODE);

    this.core = scene.add.ellipse(snapshot.x, snapshot.y, 58, 10, CORE_TINT, 0.52);
    this.core.setDepth(10.2);
    this.core.setBlendMode(ADD_BLEND_MODE);

    this.edge = scene.add.rectangle(snapshot.x, snapshot.y, 74, 4, this.tint, 0.92);
    this.edge.setDepth(10.23);
    this.edge.setBlendMode(ADD_BLEND_MODE);

    this.backEdge = scene.add.rectangle(snapshot.x, snapshot.y, 42, 3, CORE_TINT, 0.56);
    this.backEdge.setDepth(10.24);
    this.backEdge.setBlendMode(ADD_BLEND_MODE);

    for (let i = 0; i < SPARKLE_COUNT; i += 1) {
      const sparkle = scene.add.circle(snapshot.x, snapshot.y, 2, this.tint, 0);
      sparkle.setDepth(10.25);
      sparkle.setBlendMode(ADD_BLEND_MODE);
      this.sparkles.push(sparkle);
    }

    this.syncSnapshot(snapshot);
  }

  syncSnapshot(snapshot: HazardSnapshot): void {
    this.direction = snapshot.direction ?? this.direction;
    this.tint = snapshot.tint ?? this.tint;
    this.elapsedMs = BLADE_WAVE_TTL_MS - clamp(snapshot.ttlMs, 0, BLADE_WAVE_TTL_MS);
    this.updatePosition(snapshot.x, snapshot.y);
  }

  updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  get x(): number {
    return this.glow.x;
  }

  get y(): number {
    return this.glow.y;
  }

  update(dt: number, inView: boolean): void {
    this.setVisible(inView);
    if (!inView) {
      return;
    }

    this.elapsedMs = Math.min(this.elapsedMs + dt, BLADE_WAVE_TTL_MS);
    const dx = this.targetX - this.glow.x;
    const dy = this.targetY - this.glow.y;
    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.setPosition(this.targetX, this.targetY);
    } else {
      const dtMs = Math.min(dt, MAX_LERP_DT_MS);
      const factor = getExponentialInterpolationFactor(LERP_BASE, dtMs);
      this.setPosition(this.glow.x + dx * factor, this.glow.y + dy * factor);
    }

    this.render();
  }

  destroy(): void {
    this.glow.destroy();
    this.core.destroy();
    this.edge.destroy();
    this.backEdge.destroy();
    for (const sparkle of this.sparkles) sparkle.destroy();
  }

  private setPosition(x: number, y: number): void {
    this.glow.setPosition(x, y);
    this.core.setPosition(x, y);
    this.edge.setPosition(x, y);
    this.backEdge.setPosition(x, y);
  }

  private render(): void {
    const rotation = rotationForDirection(this.direction);
    const progress = clamp(this.elapsedMs / BLADE_WAVE_TTL_MS, 0, 1);
    const pulse = 0.5 + Math.sin(this.elapsedMs * 0.026) * 0.5;
    const fade = 1 - progress * 0.45;
    const { dx, dy } = getDirectionVector(this.direction);
    const sideX = -dy;
    const sideY = dx;

    this.glow.setRotation(rotation);
    this.core.setRotation(rotation);
    this.edge.setRotation(rotation);
    this.backEdge.setRotation(rotation);
    this.glow.setFillStyle(this.tint, (0.16 + pulse * 0.08) * fade);
    this.core.setFillStyle(CORE_TINT, (0.48 + pulse * 0.18) * fade);
    this.edge.setFillStyle(this.tint, (0.78 + pulse * 0.16) * fade);
    this.backEdge.setFillStyle(CORE_TINT, (0.38 + pulse * 0.16) * fade);
    this.glow.setDisplaySize(82 + pulse * 12, 25 + pulse * 6);
    this.core.setDisplaySize(56 + pulse * 8, 9 + pulse * 4);
    this.edge.setDisplaySize(72 + pulse * 8, 4 + pulse * 1.5);
    this.backEdge.setDisplaySize(40 + pulse * 5, 3);
    this.edge.setPosition(this.glow.x + sideX * 5, this.glow.y + sideY * 5);
    this.backEdge.setPosition(this.glow.x - dx * 14 - sideX * 5, this.glow.y - dy * 14 - sideY * 5);

    for (let i = 0; i < this.sparkles.length; i += 1) {
      const sparkle = this.sparkles[i];
      const wave = (Math.sin(this.elapsedMs * 0.018 + i * 1.7) + 1) / 2;
      const forward = -30 + i * 12 + wave * 8;
      const side = (i % 2 === 0 ? 1 : -1) * (8 + wave * 10);
      sparkle.setPosition(
        this.glow.x + dx * forward + sideX * side,
        this.glow.y + dy * forward + sideY * side
      );
      sparkle.setFillStyle(i % 3 === 0 ? CORE_TINT : this.tint, (0.25 + wave * 0.55) * fade);
      sparkle.setScale(0.55 + wave * 0.85);
    }
  }

  private setVisible(visible: boolean): void {
    this.glow.setVisible(visible);
    this.core.setVisible(visible);
    this.edge.setVisible(visible);
    this.backEdge.setVisible(visible);
    for (const sparkle of this.sparkles) sparkle.setVisible(visible);
  }
}
