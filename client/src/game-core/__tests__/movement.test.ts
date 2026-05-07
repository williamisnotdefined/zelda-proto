import { describe, expect, it } from 'vitest';
import { getDeltaForInput, getNormalizedDirection } from '../movement';
import { PLAYER_SPEED } from '../player';

const TEST_SPEED_MULTIPLIER = 0.5;

describe('getNormalizedDirection', () => {
  it('returns null when no movement keys are pressed', () => {
    expect(
      getNormalizedDirection({
        up: false,
        down: false,
        left: false,
        right: false,
      })
    ).toBeNull();
  });

  it('normalizes diagonal input into unit length', () => {
    const direction = getNormalizedDirection({
      up: true,
      down: false,
      left: false,
      right: true,
    });

    expect(direction).not.toBeNull();
    expect(direction?.dx).toBeCloseTo(Math.SQRT1_2);
    expect(direction?.dy).toBeCloseTo(-Math.SQRT1_2);
  });
});

describe('getDeltaForInput', () => {
  it('applies shared speed multipliers', () => {
    const delta = getDeltaForInput(
      {
        up: false,
        down: false,
        left: false,
        right: true,
      },
      16,
      PLAYER_SPEED,
      TEST_SPEED_MULTIPLIER
    );

    expect(delta.dx).toBeCloseTo(PLAYER_SPEED * TEST_SPEED_MULTIPLIER * (16 / 1000));
    expect(delta.dy).toBe(0);
  });

  it('clamps large frame deltas before applying movement', () => {
    const delta = getDeltaForInput(
      {
        up: false,
        down: false,
        left: false,
        right: true,
      },
      100,
      PLAYER_SPEED
    );

    expect(delta.dx).toBeCloseTo(PLAYER_SPEED * (50 / 1000));
    expect(delta.dy).toBe(0);
  });
});
