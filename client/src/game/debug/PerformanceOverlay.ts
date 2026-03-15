import Phaser from 'phaser';
import type { NetworkPerformanceStats } from '../../network/NetworkManager';

const OVERLAY_UPDATE_INTERVAL_MS = 250;
const OVERLAY_DEPTH = 1000;
const OVERLAY_PADDING = 8;
const OVERLAY_X = 12;
const OVERLAY_Y = 12;

export interface PerformanceOverlaySnapshot {
  fps: number;
  frameMs: number;
  enemySnapshots: number;
  visibleEnemies: number;
  enemyVisuals: number;
  pooledEnemyVisuals: number;
  enemyVisualLodNear: number;
  enemyVisualLodMid: number;
  enemyVisualLodFar: number;
  animatedEnemies: number;
  enemyVisualMode: 'smooth' | 'budget';
  players: number;
  bosses: number;
  drops: number;
  portals: number;
  hazards: number;
  displayObjects: number;
  network: NetworkPerformanceStats;
}

function isPerformanceOverlayEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('perf') === '1') {
    return true;
  }

  try {
    return window.localStorage.getItem('gelehk_perf') === '1';
  } catch {
    return false;
  }
}

function formatBytesPerSecond(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
  }
  if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }
  return `${bytesPerSecond} B/s`;
}

export class PerformanceOverlay {
  private readonly enabled: boolean;
  private readonly text: Phaser.GameObjects.Text | null;
  private accumulatorMs = 0;

  constructor(scene: Phaser.Scene) {
    this.enabled = isPerformanceOverlayEnabled();
    if (!this.enabled) {
      this.text = null;
      return;
    }

    this.text = scene.add.text(OVERLAY_X, OVERLAY_Y, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#e7f8ea',
      backgroundColor: 'rgba(0, 0, 0, 0.62)',
      padding: {
        x: OVERLAY_PADDING,
        y: OVERLAY_PADDING,
      },
    });
    this.text.setScrollFactor(0);
    this.text.setDepth(OVERLAY_DEPTH);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  update(delta: number, snapshot: PerformanceOverlaySnapshot): void {
    if (!this.enabled || !this.text) {
      return;
    }

    this.accumulatorMs += delta;
    if (this.accumulatorMs < OVERLAY_UPDATE_INTERVAL_MS) {
      return;
    }
    this.accumulatorMs = 0;

    const lines = [
      `FPS ${snapshot.fps.toFixed(1)} | frame ${snapshot.frameMs.toFixed(1)} ms`,
      `Enemies ${snapshot.enemyVisuals}/${snapshot.enemySnapshots} visuals | visible ${snapshot.visibleEnemies}`,
      `Visual mode ${snapshot.enemyVisualMode} | pool ${snapshot.pooledEnemyVisuals}`,
      `LOD near ${snapshot.enemyVisualLodNear} | mid ${snapshot.enemyVisualLodMid} | far ${snapshot.enemyVisualLodFar} | anim ${snapshot.animatedEnemies}`,
      `Players ${snapshot.players} | bosses ${snapshot.bosses} | drops ${snapshot.drops}`,
      `Portals ${snapshot.portals} | hazards ${snapshot.hazards} | display ${snapshot.displayObjects}`,
      `Net in ${formatBytesPerSecond(snapshot.network.incomingBytesPerSecond)} (${snapshot.network.incomingMessagesPerSecond} msg/s)`,
      `Net out ${formatBytesPerSecond(snapshot.network.outgoingBytesPerSecond)} (${snapshot.network.outgoingMessagesPerSecond} msg/s)`,
      `WS buffer ${snapshot.network.bufferedAmount} B`,
    ];

    this.text.setText(lines.join('\n'));
  }

  destroy(): void {
    this.text?.destroy();
  }
}
