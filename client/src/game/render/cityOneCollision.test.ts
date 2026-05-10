import { INSTANCE_IDS } from '@/shared';
import { describe, expect, it } from 'vitest';
import { CITY_ONE_CENTER_X, CITY_ONE_CENTER_Y } from './cityOneConfig';
import { constrainCityOnePlayerPosition, resolveCityOnePlayerCollision } from './cityOneCollision';

function overlapsRect(
  x: number,
  y: number,
  rectX: number,
  rectY: number,
  halfWidth: number,
  halfHeight: number,
  radius: number
): boolean {
  const nearestX = Math.max(rectX - halfWidth, Math.min(x, rectX + halfWidth));
  const nearestY = Math.max(rectY - halfHeight, Math.min(y, rectY + halfHeight));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

describe('cityOneCollision', () => {
  it('pushes the player out of solid props', () => {
    const result = resolveCityOnePlayerCollision({
      x: CITY_ONE_CENTER_X - 100,
      y: CITY_ONE_CENTER_Y - 188,
    });

    expect(
      overlapsRect(result.x, result.y, CITY_ONE_CENTER_X - 100, CITY_ONE_CENTER_Y - 188, 27, 27, 16)
    ).toBe(false);
  });

  it('keeps the bridge corridor walkable', () => {
    const position = {
      x: CITY_ONE_CENTER_X - 236,
      y: CITY_ONE_CENTER_Y + 226,
    };

    expect(resolveCityOnePlayerCollision(position)).toEqual(position);
  });

  it('keeps the right bridge landing walkable', () => {
    const position = {
      x: CITY_ONE_CENTER_X - 128,
      y: CITY_ONE_CENTER_Y + 224,
    };

    expect(resolveCityOnePlayerCollision(position)).toEqual(position);
  });

  it('blocks visible lake water tiles', () => {
    const result = resolveCityOnePlayerCollision({
      x: CITY_ONE_CENTER_X - 368,
      y: CITY_ONE_CENTER_Y + 80,
    });

    expect(
      overlapsRect(result.x, result.y, CITY_ONE_CENTER_X - 368, CITY_ONE_CENTER_Y + 80, 160, 64, 16)
    ).toBe(false);
  });

  it('only applies in phase1', () => {
    const position = {
      x: CITY_ONE_CENTER_X - 100,
      y: CITY_ONE_CENTER_Y - 188,
    };

    expect(constrainCityOnePlayerPosition(INSTANCE_IDS.PHASE2, position)).toEqual(position);
  });
});
