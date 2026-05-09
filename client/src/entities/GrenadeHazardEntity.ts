import { getDirectionVector, PLAYER_GRENADE_DISTANCE, PLAYER_GRENADE_FLIGHT_MS } from '@/game-core';
import { HAZARD_KINDS, type Direction, type HazardSnapshot } from '@/shared';
import type Phaser from 'phaser';

const GRENADE_ARC_HEIGHT = 80;
const GRENADE_DISPLAY_SIZE = 40;
const MOLOTOV_DISPLAY_SIZE = 50;
const GRENADE_SHADOW_WIDTH = 26;
const GRENADE_SHADOW_HEIGHT = 12;
const GRENADE_SHADOW_COLOR = 0x0b0b0b;
const GRENADE_SHADOW_ALPHA = 0.18;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class GrenadeHazardEntity {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  private displaySize = GRENADE_DISPLAY_SIZE;
  private startX = 0;
  private startY = 0;
  private endX = 0;
  private endY = 0;
  private elapsedMs = 0;
  private direction: Direction = 'right';

  constructor(scene: Phaser.Scene, snapshot: HazardSnapshot) {
    const isMolotov = snapshot.kind === HAZARD_KINDS.MOLOTOV;

    this.shadow = scene.add.ellipse(
      snapshot.x,
      snapshot.y,
      GRENADE_SHADOW_WIDTH,
      GRENADE_SHADOW_HEIGHT,
      GRENADE_SHADOW_COLOR,
      GRENADE_SHADOW_ALPHA
    );
    this.shadow.setDepth(10.11);

    this.sprite = scene.add.image(snapshot.x, snapshot.y, isMolotov ? 'molotov' : 'grenade');
    this.displaySize = isMolotov ? MOLOTOV_DISPLAY_SIZE : GRENADE_DISPLAY_SIZE;
    this.sprite.setDisplaySize(this.displaySize, this.displaySize);
    this.sprite.setDepth(10.22);

    this.syncSnapshot(snapshot);
  }

  updatePosition(x: number, y: number): void {
    this.shadow.setPosition(x, y);
    this.sprite.setPosition(x, y);
  }

  syncSnapshot(snapshot: HazardSnapshot): void {
    this.direction = snapshot.direction ?? this.direction;

    const ttlMs = clamp(snapshot.ttlMs, 0, PLAYER_GRENADE_FLIGHT_MS);
    const snapshotElapsedMs = PLAYER_GRENADE_FLIGHT_MS - ttlMs;
    const progress = clamp(snapshotElapsedMs / PLAYER_GRENADE_FLIGHT_MS, 0, 1);
    const { dx, dy } = getDirectionVector(this.direction);

    // Reconstruct the full throw from the authoritative ttl so the local arc
    // still looks continuous between snapshots.
    this.startX = snapshot.x - dx * PLAYER_GRENADE_DISTANCE * progress;
    this.startY = snapshot.y - dy * PLAYER_GRENADE_DISTANCE * progress;
    this.endX = this.startX + dx * PLAYER_GRENADE_DISTANCE;
    this.endY = this.startY + dy * PLAYER_GRENADE_DISTANCE;
    this.elapsedMs = snapshotElapsedMs;
  }

  get x(): number {
    return this.shadow.x;
  }

  get y(): number {
    return this.shadow.y;
  }

  update(dt: number, inView: boolean): void {
    this.sprite.setVisible(inView);
    this.shadow.setVisible(inView);
    if (!inView) {
      return;
    }

    this.elapsedMs = Math.min(this.elapsedMs + dt, PLAYER_GRENADE_FLIGHT_MS);
    const progress = clamp(this.elapsedMs / PLAYER_GRENADE_FLIGHT_MS, 0, 1);
    const groundX = this.startX + (this.endX - this.startX) * progress;
    const groundY = this.startY + (this.endY - this.startY) * progress;
    const heightProgress = 4 * progress * (1 - progress);
    const lift = GRENADE_ARC_HEIGHT * heightProgress;

    this.shadow.setPosition(groundX, groundY);
    this.shadow.setScale(0.84 + (1 - heightProgress) * 0.16);
    this.shadow.setAlpha(GRENADE_SHADOW_ALPHA * (1 - heightProgress * 0.45));

    this.sprite.setPosition(groundX, groundY - lift);
    const airborneScale = 1 + heightProgress * 0.08;
    const airborneDisplaySize = this.displaySize * airborneScale;
    this.sprite.setDisplaySize(airborneDisplaySize, airborneDisplaySize);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
