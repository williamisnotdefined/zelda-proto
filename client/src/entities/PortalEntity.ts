import Phaser from 'phaser';
import { PORTAL_KINDS, type PortalKind } from '@gelehka/shared';

const RETURN_PORTAL_GIF_PATH = '/assets/sprites/teleports/Magic_Forcefield_Blue.gif';
const ADVANCE_PORTAL_GIF_PATH = '/assets/sprites/teleports/Energy_Portal.gif';
const RETURN_PORTAL_SIZE_PX = 36;
const ADVANCE_PORTAL_SIZE_PX = 80;
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

    const img = document.createElement('img');
    img.src = this.getPortalGifPath(kind);
    img.alt = 'Portal';
    img.draggable = false;
    const sizePx = this.getPortalSizePx(kind);
    img.style.width = `${sizePx}px`;
    img.style.height = `${sizePx}px`;
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
    this.imageElement.src = this.getPortalGifPath(kind);
    const sizePx = this.getPortalSizePx(kind);
    this.imageElement.style.width = `${sizePx}px`;
    this.imageElement.style.height = `${sizePx}px`;
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
    const factor = 1 - Math.pow(1 - LERP_BASE, dtMs / 16.667);
    this.element.x += dx * factor;
    this.element.y += dy * factor;
  }

  destroy(): void {
    this.element.destroy();
  }

  private getPortalGifPath(kind: PortalKind): string {
    if (kind === PORTAL_KINDS.PHASE1_TO_PHASE2 || kind === PORTAL_KINDS.PHASE2_TO_PHASE3) {
      return ADVANCE_PORTAL_GIF_PATH;
    }
    return RETURN_PORTAL_GIF_PATH;
  }

  private getPortalSizePx(kind: PortalKind): number {
    if (kind === PORTAL_KINDS.PHASE1_TO_PHASE2 || kind === PORTAL_KINDS.PHASE2_TO_PHASE3) {
      return ADVANCE_PORTAL_SIZE_PX;
    }
    return RETURN_PORTAL_SIZE_PX;
  }
}
