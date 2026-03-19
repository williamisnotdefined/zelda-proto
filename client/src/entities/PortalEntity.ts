import { getExponentialInterpolationFactor } from '@gelehka/game-core/interpolation';
import Phaser from 'phaser';
import type { PortalKind } from '@gelehka/shared';
import { getPortalVisualConfig } from '../game/runtime/world/portalRegistry';

const LERP_BASE = 0.3;
const MAX_LERP_DT_MS = 50;
const SNAP_DISTANCE = 180;

export class PortalEntity {
  element: Phaser.GameObjects.DOMElement;
  kind: PortalKind;
  private targetX: number;
  private targetY: number;
  private imageElement: HTMLImageElement;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: PortalKind) {
    this.targetX = x;
    this.targetY = y;
    this.kind = kind;
    const visual = getPortalVisualConfig(kind);

    const img = document.createElement('img');
    img.src = visual.gifPath;
    img.alt = 'Portal';
    img.draggable = false;
    img.style.width = `${visual.sizePx}px`;
    img.style.height = `${visual.sizePx}px`;
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';
    this.imageElement = img;

    this.element = scene.add.dom(x, y, img);
    this.element.setDepth(6);
    this.element.setOrigin(0.5, 0.5);
  }

  updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  updateKind(kind: PortalKind): void {
    if (this.kind === kind) return;
    this.kind = kind;
    const visual = getPortalVisualConfig(kind);
    this.imageElement.src = visual.gifPath;
    this.imageElement.style.width = `${visual.sizePx}px`;
    this.imageElement.style.height = `${visual.sizePx}px`;
  }

  get x(): number {
    return this.element.x;
  }

  get y(): number {
    return this.element.y;
  }

  update(dt: number, inView: boolean): void {
    this.element.setVisible(inView);
    if (!inView) {
      return;
    }

    const dx = this.targetX - this.element.x;
    const dy = this.targetY - this.element.y;
    if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.element.x = this.targetX;
      this.element.y = this.targetY;
      return;
    }

    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const factor = getExponentialInterpolationFactor(LERP_BASE, dtMs);
    this.element.x += dx * factor;
    this.element.y += dy * factor;
  }

  destroy(): void {
    this.element.destroy();
  }
}
