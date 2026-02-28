interface SpatialEntry<T> {
  x: number;
  y: number;
  item: T;
}

export class SpatialHash<T> {
  private readonly cellSize: number;
  private readonly cells: Map<string, SpatialEntry<T>[]>;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear(): void {
    this.cells.clear();
  }

  insert(x: number, y: number, item: T): void {
    const key = this.keyFor(x, y);
    const bucket = this.cells.get(key);
    if (bucket) {
      bucket.push({ x, y, item });
      return;
    }
    this.cells.set(key, [{ x, y, item }]);
  }

  queryRadius(x: number, y: number, radius: number): T[] {
    const minCellX = Math.floor((x - radius) / this.cellSize);
    const maxCellX = Math.floor((x + radius) / this.cellSize);
    const minCellY = Math.floor((y - radius) / this.cellSize);
    const maxCellY = Math.floor((y + radius) / this.cellSize);
    const radiusSq = radius * radius;
    const out: T[] = [];

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const bucket = this.cells.get(`${cx},${cy}`);
        if (!bucket) continue;
        for (const entry of bucket) {
          const dx = entry.x - x;
          const dy = entry.y - y;
          if (dx * dx + dy * dy <= radiusSq) {
            out.push(entry.item);
          }
        }
      }
    }

    return out;
  }

  private keyFor(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }
}
