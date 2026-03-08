export interface Vector2Like {
  x: number;
  y: number;
}

export function getExponentialInterpolationFactor(
  baseFactor: number,
  dtMs: number,
  referenceFrameMs = 16.667
): number {
  return 1 - Math.pow(1 - baseFactor, dtMs / referenceFrameMs);
}

export function interpolateToward(
  current: Vector2Like,
  target: Vector2Like,
  dtMs: number,
  baseFactor: number,
  snapDistance = Infinity
): Vector2Like {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance >= snapDistance) {
    return { x: target.x, y: target.y };
  }

  const factor = getExponentialInterpolationFactor(baseFactor, dtMs);
  return {
    x: current.x + dx * factor,
    y: current.y + dy * factor,
  };
}
