export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function entityAABB(x: number, y: number, w: number, h: number): AABB {
  return { x: x - w / 2, y: y - h / 2, w, h };
}

export function entityCircle(x: number, y: number, r: number): Circle {
  return { x, y, r };
}

export function circleOverlap(a: Circle, b: Circle): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = a.r + b.r;
  return dx * dx + dy * dy <= rr * rr;
}

export function circleAabbOverlap(circle: Circle, box: AABB): boolean {
  const nearestX = clamp(circle.x, box.x, box.x + box.w);
  const nearestY = clamp(circle.y, box.y, box.y + box.h);
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return dx * dx + dy * dy <= circle.r * circle.r;
}

export function distanceSquared(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(distanceSquared(x1, y1, x2, y2));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isInSafeZone(
  x: number,
  y: number,
  spawnX: number,
  spawnY: number,
  safeRadius: number
): boolean {
  return distanceSquared(x, y, spawnX, spawnY) <= safeRadius * safeRadius;
}
