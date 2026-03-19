import type { EntityId } from './EcsWorld.js';

interface SpatialRecord {
  x: number;
  y: number;
  cellX: number;
  cellY: number;
}

export class SpatialQueryIndex {
  private readonly cells = new Map<number, Map<number, Set<EntityId>>>();
  private readonly records = new Map<EntityId, SpatialRecord>();

  constructor(private readonly cellSize: number) {}

  upsert(entityId: EntityId, x: number, y: number): void {
    const nextCellX = this.getCellCoord(x);
    const nextCellY = this.getCellCoord(y);
    const previous = this.records.get(entityId);

    if (previous) {
      if (previous.cellX !== nextCellX || previous.cellY !== nextCellY) {
        this.removeFromCell(entityId, previous.cellX, previous.cellY);
        this.addToCell(entityId, nextCellX, nextCellY);
      }

      previous.x = x;
      previous.y = y;
      previous.cellX = nextCellX;
      previous.cellY = nextCellY;
      return;
    }

    this.records.set(entityId, {
      x,
      y,
      cellX: nextCellX,
      cellY: nextCellY,
    });
    this.addToCell(entityId, nextCellX, nextCellY);
  }

  remove(entityId: EntityId): void {
    const record = this.records.get(entityId);
    if (!record) {
      return;
    }

    this.records.delete(entityId);
    this.removeFromCell(entityId, record.cellX, record.cellY);
  }

  clear(): void {
    this.cells.clear();
    this.records.clear();
  }

  queryRadius(
    x: number,
    y: number,
    radius: number,
    predicate?: (entityId: EntityId) => boolean
  ): EntityId[] {
    const entityIds: EntityId[] = [];
    this.forEachInRadius(
      x,
      y,
      radius,
      (entityId) => {
        entityIds.push(entityId);
      },
      predicate
    );
    return entityIds;
  }

  forEachInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (entityId: EntityId) => void,
    predicate?: (entityId: EntityId) => boolean
  ): void {
    const minCellX = this.getCellCoord(x - radius);
    const maxCellX = this.getCellCoord(x + radius);
    const minCellY = this.getCellCoord(y - radius);
    const maxCellY = this.getCellCoord(y + radius);
    const radiusSq = radius * radius;

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = this.cells.get(cellX)?.get(cellY);
        if (!bucket) {
          continue;
        }

        for (const entityId of bucket) {
          if (predicate && !predicate(entityId)) {
            continue;
          }

          const record = this.records.get(entityId);
          if (!record) {
            continue;
          }

          const dx = record.x - x;
          const dy = record.y - y;
          if (dx * dx + dy * dy <= radiusSq) {
            callback(entityId);
          }
        }
      }
    }
  }

  findNearestInRadius(
    x: number,
    y: number,
    radius: number,
    predicate?: (entityId: EntityId) => boolean
  ): EntityId | null {
    let nearestEntityId: EntityId | null = null;
    let nearestDistanceSq = radius * radius;

    this.forEachInRadius(
      x,
      y,
      radius,
      (entityId) => {
        const record = this.records.get(entityId);
        if (!record) {
          return;
        }

        const dx = record.x - x;
        const dy = record.y - y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq <= nearestDistanceSq) {
          nearestDistanceSq = distanceSq;
          nearestEntityId = entityId;
        }
      },
      predicate
    );

    return nearestEntityId;
  }

  private addToCell(entityId: EntityId, cellX: number, cellY: number): void {
    let column = this.cells.get(cellX);
    if (!column) {
      column = new Map<number, Set<EntityId>>();
      this.cells.set(cellX, column);
    }

    let bucket = column.get(cellY);
    if (!bucket) {
      bucket = new Set<EntityId>();
      column.set(cellY, bucket);
    }

    bucket.add(entityId);
  }

  private removeFromCell(entityId: EntityId, cellX: number, cellY: number): void {
    const column = this.cells.get(cellX);
    if (!column) {
      return;
    }

    const bucket = column.get(cellY);
    if (!bucket) {
      return;
    }

    bucket.delete(entityId);
    if (bucket.size === 0) {
      column.delete(cellY);
    }
    if (column.size === 0) {
      this.cells.delete(cellX);
    }
  }

  private getCellCoord(value: number): number {
    return Math.floor(value / this.cellSize);
  }
}
