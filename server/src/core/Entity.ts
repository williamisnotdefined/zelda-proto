export abstract class Entity {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;

  constructor(id: string, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }

  abstract update(dt: number, ...args: unknown[]): void;
}
