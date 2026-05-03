export interface Vector2Like {
  x: number;
  y: number;
}

export function getExponentialInterpolationFactor(
  baseFactor: number,
  dtMs: number,
  referenceFrameMs = 16.667
): number {
  if (
    !Number.isFinite(baseFactor) ||
    !Number.isFinite(dtMs) ||
    !Number.isFinite(referenceFrameMs)
  ) {
    return 0;
  }

  const normalizedBaseFactor = Math.max(0, Math.min(baseFactor, 1));
  const normalizedDtMs = Math.max(0, dtMs);
  const normalizedReferenceFrameMs = Math.max(Number.EPSILON, referenceFrameMs);

  return 1 - Math.pow(1 - normalizedBaseFactor, normalizedDtMs / normalizedReferenceFrameMs);
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
