export interface DirectionInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface MovementDelta {
  dx: number;
  dy: number;
}

export function getNormalizedDirection(input: DirectionInput): MovementDelta | null {
  let dx = 0;
  let dy = 0;

  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;

  if (dx === 0 && dy === 0) return null;

  const len = Math.sqrt(dx * dx + dy * dy);
  return {
    dx: dx / len,
    dy: dy / len,
  };
}

export function getDeltaForInput(
  input: DirectionInput,
  dtMs: number,
  speed: number,
  speedMultiplier = 1,
  dtClampMs = 50
): MovementDelta {
  const direction = getNormalizedDirection(input);
  if (!direction) {
    return { dx: 0, dy: 0 };
  }

  const dtSeconds = Math.min(dtMs, dtClampMs) / 1000;
  return {
    dx: direction.dx * speed * speedMultiplier * dtSeconds,
    dy: direction.dy * speed * speedMultiplier * dtSeconds,
  };
}
