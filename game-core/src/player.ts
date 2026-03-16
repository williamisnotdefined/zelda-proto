import type { Direction } from '@gelehka/shared';

export const PLAYER_SPEED = 150;
export const PLAYER_MAX_HP = 100;
export const PLAYER_DAMAGE = 10;
export const PLAYER_ATTACK_COOLDOWN = 400;
export const PLAYER_ATTACK_STATE_DURATION = 300;
export const PLAYER_ATTACK_SPEED_PENALTY = 0.5;
export const PLAYER_WIDTH = 48;
export const PLAYER_HEIGHT = 48;
export const PLAYER_ATTACK_RANGE_UP = 40;
export const PLAYER_ATTACK_RANGE_DOWN = 56;
export const PLAYER_ATTACK_RANGE_LEFT = 48;
export const PLAYER_ATTACK_RANGE_RIGHT = 48;
export const PLAYER_ATTACK_WIDTH = 72;
export const PVP_DAMAGE = 25;
export const SAFE_ZONE_DURATION = 3000;
export const BURNING_TICK_DAMAGE = 4;
export const BURNING_TICKS = 3;
export const BURNING_TICK_MS = 1000;

export const PLAYER_ATTACK_RANGE_BY_DIRECTION: Record<Direction, number> = {
  up: PLAYER_ATTACK_RANGE_UP,
  down: PLAYER_ATTACK_RANGE_DOWN,
  left: PLAYER_ATTACK_RANGE_LEFT,
  right: PLAYER_ATTACK_RANGE_RIGHT,
};
