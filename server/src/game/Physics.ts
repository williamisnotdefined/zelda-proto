export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function entityAABB(x: number, y: number, w: number, h: number): AABB {
  return { x: x - w / 2, y: y - h / 2, w, h };
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
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
  return distance(x, y, spawnX, spawnY) < safeRadius;
}
