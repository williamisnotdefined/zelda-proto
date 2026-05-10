import type { InstanceId } from '@/shared';
import { INSTANCE_IDS } from '@/shared';
import {
  CITY_ONE_CENTER_X,
  CITY_ONE_CENTER_Y,
  CITY_ONE_PLAYER_COLLISION_RADIUS,
} from './cityOneConfig';

type CircleCollider = {
  kind: 'circle';
  x: number;
  y: number;
  radius: number;
};

type RectCollider = {
  kind: 'rect';
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
};

type CityOneCollider = CircleCollider | RectCollider;

export type Position = { x: number; y: number };

const CITY_ONE_COLLIDERS: CityOneCollider[] = [
  // Lake body, split to match the visible water tiles while keeping bridge/landing walkable.
  { kind: 'rect', x: -368, y: 80, halfWidth: 160, halfHeight: 64 },
  { kind: 'rect', x: -448, y: 208, halfWidth: 80, halfHeight: 64 },
  { kind: 'rect', x: -368, y: 304, halfWidth: 160, halfHeight: 32 },
  { kind: 'rect', x: -256, y: 160, halfWidth: 80, halfHeight: 16 },
  { kind: 'rect', x: -304, y: 336, halfWidth: 128, halfHeight: 64 },

  // Outer and inner fences.
  { kind: 'rect', x: -180, y: -260, halfWidth: 112, halfHeight: 12 },
  { kind: 'rect', x: 290, y: -260, halfWidth: 126, halfHeight: 12 },
  { kind: 'rect', x: -180, y: 500, halfWidth: 112, halfHeight: 12 },
  { kind: 'rect', x: 290, y: 500, halfWidth: 126, halfHeight: 12 },
  { kind: 'rect', x: -292, y: -57, halfWidth: 12, halfHeight: 155 },
  { kind: 'rect', x: -292, y: 379, halfWidth: 12, halfHeight: 121 },
  { kind: 'rect', x: 548, y: -57, halfWidth: 12, halfHeight: 155 },
  { kind: 'rect', x: 548, y: 379, halfWidth: 12, halfHeight: 121 },
  { kind: 'rect', x: -34, y: -228, halfWidth: 146, halfHeight: 12 },
  { kind: 'rect', x: 246, y: 112, halfWidth: 28, halfHeight: 12 },
  { kind: 'rect', x: 294, y: 112, halfWidth: 28, halfHeight: 12 },
  { kind: 'rect', x: 390, y: 112, halfWidth: 28, halfHeight: 12 },

  // Trees use trunk/base collision, not the full canopy.
  { kind: 'circle', x: -290, y: -170, radius: 25 },
  { kind: 'circle', x: -135, y: -225, radius: 24 },
  { kind: 'circle', x: 60, y: -252, radius: 24 },
  { kind: 'circle', x: 310, y: -215, radius: 24 },
  { kind: 'circle', x: 510, y: -90, radius: 25 },
  { kind: 'circle', x: 560, y: 175, radius: 24 },
  { kind: 'circle', x: 500, y: 460, radius: 24 },
  { kind: 'circle', x: 240, y: 570, radius: 25 },
  { kind: 'circle', x: -70, y: 555, radius: 24 },
  { kind: 'circle', x: -335, y: 435, radius: 24 },
  { kind: 'circle', x: -395, y: 125, radius: 25 },
  { kind: 'circle', x: -360, y: -55, radius: 24 },

  // Large rocks.
  { kind: 'circle', x: -270, y: -170, radius: 24 },
  { kind: 'circle', x: 228, y: -238, radius: 24 },
  { kind: 'circle', x: 468, y: -192, radius: 24 },
  { kind: 'rect', x: 520, y: 28, halfWidth: 24, halfHeight: 16 },
  { kind: 'circle', x: 452, y: 330, radius: 24 },
  { kind: 'circle', x: -122, y: 442, radius: 24 },
  { kind: 'circle', x: -338, y: 280, radius: 24 },

  // Crates, barrels, chests and campfire.
  { kind: 'rect', x: -100, y: -188, halfWidth: 27, halfHeight: 27 },
  { kind: 'rect', x: -72, y: -220, halfWidth: 17, halfHeight: 17 },
  { kind: 'circle', x: -36, y: -190, radius: 17 },
  { kind: 'rect', x: 84, y: -188, halfWidth: 27, halfHeight: 27 },
  { kind: 'rect', x: 122, y: -220, halfWidth: 17, halfHeight: 17 },
  { kind: 'circle', x: 158, y: -190, radius: 17 },
  { kind: 'rect', x: 360, y: -50, halfWidth: 17, halfHeight: 27 },
  { kind: 'rect', x: 396, y: -22, halfWidth: 27, halfHeight: 27 },
  { kind: 'circle', x: 438, y: -34, radius: 17 },
  { kind: 'rect', x: 405, y: 72, halfWidth: 27, halfHeight: 22 },
  { kind: 'rect', x: 460, y: 104, halfWidth: 17, halfHeight: 17 },
  { kind: 'circle', x: 344, y: 118, radius: 17 },
  { kind: 'rect', x: 24, y: 354, halfWidth: 18, halfHeight: 18 },
  { kind: 'circle', x: -24, y: 360, radius: 17 },
  { kind: 'rect', x: 76, y: 382, halfWidth: 27, halfHeight: 27 },
  { kind: 'rect', x: -216, y: -90, halfWidth: 17, halfHeight: 17 },
  { kind: 'circle', x: -258, y: -56, radius: 17 },
  { kind: 'rect', x: -208, y: -42, halfWidth: 17, halfHeight: 27 },
  { kind: 'rect', x: -224, y: 420, halfWidth: 27, halfHeight: 22 },
  { kind: 'circle', x: -172, y: 422, radius: 17 },
  { kind: 'circle', x: -30, y: 305, radius: 22 },
];

export function constrainCityOnePlayerPosition(
  instanceId: InstanceId | null,
  position: Position,
  playerRadius = CITY_ONE_PLAYER_COLLISION_RADIUS
): Position {
  if (instanceId !== INSTANCE_IDS.PHASE1) {
    return position;
  }
  return resolveCityOnePlayerCollision(position, playerRadius);
}

export function resolveCityOnePlayerCollision(
  position: Position,
  playerRadius = CITY_ONE_PLAYER_COLLISION_RADIUS
): Position {
  let x = position.x;
  let y = position.y;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    let moved = false;
    for (const collider of CITY_ONE_COLLIDERS) {
      const resolved =
        collider.kind === 'circle'
          ? resolveCircleCollider(x, y, playerRadius, collider)
          : resolveRectCollider(x, y, playerRadius, collider);
      if (!resolved.moved) {
        continue;
      }
      x = resolved.x;
      y = resolved.y;
      moved = true;
    }
    if (!moved) {
      break;
    }
  }

  return { x, y };
}

function resolveCircleCollider(
  playerX: number,
  playerY: number,
  playerRadius: number,
  collider: CircleCollider
): Position & { moved: boolean } {
  const cx = CITY_ONE_CENTER_X + collider.x;
  const cy = CITY_ONE_CENTER_Y + collider.y;
  const minDistance = playerRadius + collider.radius;
  const dx = playerX - cx;
  const dy = playerY - cy;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq >= minDistance * minDistance) {
    return { x: playerX, y: playerY, moved: false };
  }
  if (distanceSq === 0) {
    return { x: cx + minDistance, y: cy, moved: true };
  }

  const distance = Math.sqrt(distanceSq);
  const overlap = minDistance - distance;
  return {
    x: playerX + (dx / distance) * overlap,
    y: playerY + (dy / distance) * overlap,
    moved: true,
  };
}

function resolveRectCollider(
  playerX: number,
  playerY: number,
  playerRadius: number,
  collider: RectCollider
): Position & { moved: boolean } {
  const cx = CITY_ONE_CENTER_X + collider.x;
  const cy = CITY_ONE_CENTER_Y + collider.y;
  const minX = cx - collider.halfWidth;
  const maxX = cx + collider.halfWidth;
  const minY = cy - collider.halfHeight;
  const maxY = cy + collider.halfHeight;
  const nearestX = clamp(playerX, minX, maxX);
  const nearestY = clamp(playerY, minY, maxY);
  const dx = playerX - nearestX;
  const dy = playerY - nearestY;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq >= playerRadius * playerRadius) {
    return { x: playerX, y: playerY, moved: false };
  }

  if (distanceSq === 0) {
    const exitLeft = Math.abs(playerX - minX);
    const exitRight = Math.abs(maxX - playerX);
    const exitTop = Math.abs(playerY - minY);
    const exitBottom = Math.abs(maxY - playerY);
    const minExit = Math.min(exitLeft, exitRight, exitTop, exitBottom);

    if (minExit === exitLeft) return { x: minX - playerRadius, y: playerY, moved: true };
    if (minExit === exitRight) return { x: maxX + playerRadius, y: playerY, moved: true };
    if (minExit === exitTop) return { x: playerX, y: minY - playerRadius, moved: true };
    return { x: playerX, y: maxY + playerRadius, moved: true };
  }

  const distance = Math.sqrt(distanceSq);
  const overlap = playerRadius - distance;
  return {
    x: playerX + (dx / distance) * overlap,
    y: playerY + (dy / distance) * overlap,
    moved: true,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
