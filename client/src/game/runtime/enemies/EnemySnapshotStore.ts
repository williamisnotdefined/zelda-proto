import type { EnemyKind, EnemySnapshot } from '@/shared';
import Phaser from 'phaser';

const ENEMY_SNAPSHOT_GRID_CELL_SIZE = 512;

interface ReleasedEnemyVisual {
  id: string;
  kind: EnemyKind;
}

export interface EnemySnapshotSyncResult {
  dirtyIds: Set<string>;
  releasedVisuals: ReleasedEnemyVisual[];
}

export class EnemySnapshotStore {
  private readonly enemySnapshotsById = new Map<string, EnemySnapshot>();
  private readonly enemyKindsById = new Map<string, EnemySnapshot['kind']>();
  private readonly enemySnapshotBuckets = new Map<string, Set<string>>();
  private readonly enemySnapshotCellById = new Map<string, string>();

  sync(enemies: EnemySnapshot[]): EnemySnapshotSyncResult {
    const seenEnemyIds = new Set<string>();
    const dirtyIds = new Set<string>();
    const releasedVisuals: ReleasedEnemyVisual[] = [];

    for (const enemy of enemies) {
      seenEnemyIds.add(enemy.id);

      const previousSnapshot = this.enemySnapshotsById.get(enemy.id);
      if (previousSnapshot && !this.enemySnapshotChanged(previousSnapshot, enemy)) {
        continue;
      }

      const previousKind = this.upsert(enemy);
      if (previousKind && previousKind !== enemy.kind) {
        releasedVisuals.push({ id: enemy.id, kind: previousKind });
      }

      dirtyIds.add(enemy.id);
    }

    for (const id of Array.from(this.enemySnapshotsById.keys())) {
      if (seenEnemyIds.has(id)) {
        continue;
      }

      const removed = this.remove(id);
      if (removed) {
        releasedVisuals.push(removed);
      }
    }

    return {
      dirtyIds,
      releasedVisuals,
    };
  }

  get(id: string): EnemySnapshot | undefined {
    return this.enemySnapshotsById.get(id);
  }

  size(): number {
    return this.enemySnapshotsById.size;
  }

  clear(): void {
    this.enemySnapshotsById.clear();
    this.enemyKindsById.clear();
    this.enemySnapshotBuckets.clear();
    this.enemySnapshotCellById.clear();
  }

  forEachInRect(view: Phaser.Geom.Rectangle, callback: (enemy: EnemySnapshot) => void): void {
    const minCellX = this.getEnemySnapshotCellCoord(view.left);
    const maxCellX = this.getEnemySnapshotCellCoord(view.right);
    const minCellY = this.getEnemySnapshotCellCoord(view.top);
    const maxCellY = this.getEnemySnapshotCellCoord(view.bottom);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = this.enemySnapshotBuckets.get(
          this.getEnemySnapshotCellKeyByCoords(cellX, cellY)
        );
        if (!bucket) {
          continue;
        }

        for (const id of bucket) {
          const enemy = this.enemySnapshotsById.get(id);
          if (!enemy || !this.isEntityInView(view, enemy.x, enemy.y)) {
            continue;
          }

          callback(enemy);
        }
      }
    }
  }

  forEachInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (enemy: EnemySnapshot) => void
  ): void {
    const minCellX = this.getEnemySnapshotCellCoord(x - radius);
    const maxCellX = this.getEnemySnapshotCellCoord(x + radius);
    const minCellY = this.getEnemySnapshotCellCoord(y - radius);
    const maxCellY = this.getEnemySnapshotCellCoord(y + radius);
    const radiusSq = radius * radius;

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = this.enemySnapshotBuckets.get(
          this.getEnemySnapshotCellKeyByCoords(cellX, cellY)
        );
        if (!bucket) {
          continue;
        }

        for (const id of bucket) {
          const enemy = this.enemySnapshotsById.get(id);
          if (!enemy) {
            continue;
          }

          const dx = enemy.x - x;
          const dy = enemy.y - y;
          if (dx * dx + dy * dy > radiusSq) {
            continue;
          }

          callback(enemy);
        }
      }
    }
  }

  countInRect(view: Phaser.Geom.Rectangle): number {
    let count = 0;
    this.forEachInRect(view, (enemy) => {
      if (enemy.state !== 'dead') {
        count += 1;
      }
    });
    return count;
  }

  private enemySnapshotChanged(previous: EnemySnapshot, next: EnemySnapshot): boolean {
    return (
      previous.kind !== next.kind ||
      previous.elite !== next.elite ||
      previous.variant !== next.variant ||
      previous.venomMarked !== next.venomMarked ||
      previous.statusEffects?.burning?.ticksRemaining !==
        next.statusEffects?.burning?.ticksRemaining ||
      previous.x !== next.x ||
      previous.y !== next.y ||
      previous.hp !== next.hp ||
      previous.maxHp !== next.maxHp ||
      previous.state !== next.state
    );
  }

  private upsert(enemy: EnemySnapshot): EnemySnapshot['kind'] | null {
    const previousSnapshot = this.enemySnapshotsById.get(enemy.id);
    const previousKind = this.enemyKindsById.get(enemy.id) ?? null;

    this.enemyKindsById.set(enemy.id, enemy.kind);
    this.enemySnapshotsById.set(enemy.id, enemy);

    if (previousSnapshot) {
      this.moveIndexedEnemySnapshot(enemy, previousSnapshot.x, previousSnapshot.y);
    } else {
      this.indexEnemySnapshot(enemy);
    }

    return previousKind;
  }

  private remove(id: string): ReleasedEnemyVisual | null {
    const kind = this.enemyKindsById.get(id);
    this.removeIndexedEnemySnapshot(id);
    this.enemySnapshotsById.delete(id);
    this.enemyKindsById.delete(id);

    if (!kind) {
      return null;
    }

    return { id, kind };
  }

  private getEnemySnapshotCellCoord(value: number): number {
    return Math.floor(value / ENEMY_SNAPSHOT_GRID_CELL_SIZE);
  }

  private getEnemySnapshotCellKey(x: number, y: number): string {
    return this.getEnemySnapshotCellKeyByCoords(
      this.getEnemySnapshotCellCoord(x),
      this.getEnemySnapshotCellCoord(y)
    );
  }

  private getEnemySnapshotCellKeyByCoords(cellX: number, cellY: number): string {
    return `${cellX},${cellY}`;
  }

  private indexEnemySnapshot(snapshot: EnemySnapshot): void {
    const nextCellKey = this.getEnemySnapshotCellKey(snapshot.x, snapshot.y);
    const previousCellKey = this.enemySnapshotCellById.get(snapshot.id);
    if (previousCellKey && previousCellKey !== nextCellKey) {
      this.removeIndexedEnemySnapshot(snapshot.id);
    }

    let bucket = this.enemySnapshotBuckets.get(nextCellKey);
    if (!bucket) {
      bucket = new Set();
      this.enemySnapshotBuckets.set(nextCellKey, bucket);
    }

    bucket.add(snapshot.id);
    this.enemySnapshotCellById.set(snapshot.id, nextCellKey);
  }

  private moveIndexedEnemySnapshot(snapshot: EnemySnapshot, prevX: number, prevY: number): void {
    const nextCellKey = this.getEnemySnapshotCellKey(snapshot.x, snapshot.y);
    const previousCellKey =
      this.enemySnapshotCellById.get(snapshot.id) ?? this.getEnemySnapshotCellKey(prevX, prevY);

    if (previousCellKey === nextCellKey) {
      if (!this.enemySnapshotCellById.has(snapshot.id)) {
        this.indexEnemySnapshot(snapshot);
      }
      return;
    }

    this.removeIndexedEnemySnapshot(snapshot.id);
    this.indexEnemySnapshot(snapshot);
  }

  private removeIndexedEnemySnapshot(id: string): void {
    const cellKey = this.enemySnapshotCellById.get(id);
    if (!cellKey) {
      return;
    }

    const bucket = this.enemySnapshotBuckets.get(cellKey);
    if (bucket) {
      bucket.delete(id);
      if (bucket.size === 0) {
        this.enemySnapshotBuckets.delete(cellKey);
      }
    }

    this.enemySnapshotCellById.delete(id);
  }

  private isEntityInView(view: Phaser.Geom.Rectangle, x: number, y: number): boolean {
    return x >= view.left && x <= view.right && y >= view.top && y <= view.bottom;
  }
}
