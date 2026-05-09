import type { Direction } from '@/shared';
import type { DirectionInput } from './movement.js';

export const PLAYER_SPEED = 150;
export const PLAYER_MAX_HP = 100;
export const PLAYER_DAMAGE = 10;
export const PLAYER_WAVE_DAMAGE = 3;
export const PLAYER_WAVE_WINDUP = 80;
export const PLAYER_GRENADE_COOLDOWN = 2000;
export const PLAYER_MOLOTOV_COOLDOWN = PLAYER_GRENADE_COOLDOWN / 2;
export const PLAYER_MOLOTOV_BURN_TICK_DAMAGE = 5;
export const PLAYER_MOLOTOV_BURN_TICKS = 5;
export const PLAYER_MOLOTOV_BURN_LIFESTEAL_RATIO = 0.1;
export const PLAYER_LANDMINE_COOLDOWN = 2000;
export const PLAYER_SHURIKEN_COOLDOWN = 30000;
export const PLAYER_SHURIKEN_DURATION_MS = 30000;
export const PLAYER_SHURIKEN_RADIUS = 150;
export const PLAYER_GRENADE_DISTANCE = 150;
export const PLAYER_GRENADE_FLIGHT_MS = 300;
export const PLAYER_DASH_DISTANCE = 300;
export const PLAYER_DASH_PUSH_DISTANCE = 300;
export const PLAYER_DASH_PUSH_HALF_WIDTH = 36;
export const PLAYER_DASH_DOUBLE_TAP_WINDOW = 250;
export const PLAYER_DASH_COOLDOWN = 1000;
export const PLAYER_WAVE_COOLDOWN = 4000;
export const PLAYER_NUMB_COOLDOWN = PLAYER_WAVE_COOLDOWN;
export const PLAYER_PULL_COOLDOWN = PLAYER_WAVE_COOLDOWN;
export const PLAYER_VENOM_COOLDOWN = PLAYER_WAVE_COOLDOWN;
export const PLAYER_NUMB_FREEZE_MS = 2000;
export const PLAYER_WAVE_RADIUS = 150;
export const PLAYER_WAVE_SPEED = 900;
export const PLAYER_WAVE_CAST_DURATION =
  PLAYER_WAVE_WINDUP + (PLAYER_WAVE_RADIUS / PLAYER_WAVE_SPEED) * 1000;
export const PLAYER_WIDTH = 48;
export const PLAYER_HEIGHT = 48;
export const PVP_DAMAGE = 25;
export const SAFE_ZONE_DURATION = 3000;
export const BURNING_TICK_DAMAGE = 8;
export const BURNING_TICKS = 3;
export const BURNING_TICK_MS = 1000;

export function getDirectionVector(direction: Direction): { dx: number; dy: number } {
  switch (direction) {
    case 'up':
      return { dx: 0, dy: -1 };
    case 'down':
      return { dx: 0, dy: 1 };
    case 'left':
      return { dx: -1, dy: 0 };
    case 'right':
      return { dx: 1, dy: 0 };
  }
}

export function getFacingDirection(input: DirectionInput): Direction | null {
  let dx = 0;
  let dy = 0;

  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;

  if (dx === 0 && dy === 0) {
    return null;
  }

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }

  return dy > 0 ? 'down' : 'up';
}

export function getDashDirection(
  input: DirectionInput,
  fallbackDirection: Direction | null = null
): Direction | null {
  return getFacingDirection(input) ?? fallbackDirection;
}

export function getDashDelta(
  direction: Direction,
  distance = PLAYER_DASH_DISTANCE
): { dx: number; dy: number } {
  const vector = getDirectionVector(direction);
  return {
    dx: vector.dx * distance,
    dy: vector.dy * distance,
  };
}
