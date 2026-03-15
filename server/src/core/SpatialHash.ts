export class SpatialHash<T> {
  private readonly cellSize: number;
  private readonly getX: (item: T) => number;
  private readonly getY: (item: T) => number;
  private readonly cells: Map<number, Map<number, T[]>>;

  constructor(cellSize: number, getX: (item: T) => number, getY: (item: T) => number) {
    this.cellSize = cellSize;
    this.getX = getX;
    this.getY = getY;
    this.cells = new Map();
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const x = this.getX(item);
    const y = this.getY(item);
    const cellX = this.getCellCoord(x);
    const cellY = this.getCellCoord(y);
    this.getOrCreateBucket(cellX, cellY).push(item);
  }

  queryRadius(x: number, y: number, radius: number): T[] {
    const out: T[] = [];
    this.forEachInRadius(x, y, radius, (item) => {
      out.push(item);
    });

    return out;
  }

  forEachInRadius(x: number, y: number, radius: number, callback: (item: T) => void): void {
    const minCellX = this.getCellCoord(x - radius);
    const maxCellX = this.getCellCoord(x + radius);
    const minCellY = this.getCellCoord(y - radius);
    const maxCellY = this.getCellCoord(y + radius);
    const radiusSq = radius * radius;

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const bucket = this.getBucket(cx, cy);
        if (!bucket) continue;
        for (const item of bucket) {
          const dx = this.getX(item) - x;
          const dy = this.getY(item) - y;
          if (dx * dx + dy * dy <= radiusSq) {
            callback(item);
          }
        }
      }
    }
  }

  findNearestInRadius(
    x: number,
    y: number,
    radius: number,
    predicate?: (item: T) => boolean
  ): T | null {
    const minCellX = this.getCellCoord(x - radius);
    const maxCellX = this.getCellCoord(x + radius);
    const minCellY = this.getCellCoord(y - radius);
    const maxCellY = this.getCellCoord(y + radius);
    const radiusSq = radius * radius;
    let nearest: T | null = null;
    let nearestDistSq = radiusSq;

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const bucket = this.getBucket(cx, cy);
        if (!bucket) continue;
        for (const item of bucket) {
          if (predicate && !predicate(item)) {
            continue;
          }

          const dx = this.getX(item) - x;
          const dy = this.getY(item) - y;
          const distSq = dx * dx + dy * dy;
          if (distSq <= nearestDistSq) {
            nearest = item;
            nearestDistSq = distSq;
          }
        }
      }
    }

    return nearest;
  }

  private getBucket(cellX: number, cellY: number): T[] | undefined {
    return this.cells.get(cellX)?.get(cellY);
  }

  private getOrCreateBucket(cellX: number, cellY: number): T[] {
    let column = this.cells.get(cellX);
    if (!column) {
      column = new Map();
      this.cells.set(cellX, column);
    }

    let bucket = column.get(cellY);
    if (!bucket) {
      bucket = [];
      column.set(cellY, bucket);
    }

    return bucket;
  }

  private getCellCoord(value: number): number {
    return Math.floor(value / this.cellSize);
  }
}
