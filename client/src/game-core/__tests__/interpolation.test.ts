import { describe, expect, it } from 'vitest';
import { getExponentialInterpolationFactor, interpolateToward } from '../interpolation';

describe('getExponentialInterpolationFactor', () => {
  it('matches the frame-rate independent formula', () => {
    const baseFactor = 0.3;
    const dtMs = 33.334;

    expect(getExponentialInterpolationFactor(baseFactor, dtMs)).toBeCloseTo(
      1 - Math.pow(1 - baseFactor, dtMs / 16.667)
    );
  });

  it('clamps invalid inputs into safe output ranges', () => {
    expect(getExponentialInterpolationFactor(Number.NaN, 16.667)).toBe(0);
    expect(getExponentialInterpolationFactor(2, 16.667)).toBe(1);
    expect(getExponentialInterpolationFactor(0.3, -5)).toBe(0);
  });
});

describe('interpolateToward', () => {
  it('moves toward the target using the shared interpolation factor', () => {
    const factor = getExponentialInterpolationFactor(0.3, 16.667);

    expect(interpolateToward({ x: 0, y: 5 }, { x: 10, y: 15 }, 16.667, 0.3)).toEqual({
      x: 10 * factor,
      y: 5 + 10 * factor,
    });
  });

  it('snaps directly when beyond the configured snap distance', () => {
    expect(interpolateToward({ x: 0, y: 0 }, { x: 20, y: 20 }, 16.667, 0.3, 10)).toEqual({
      x: 20,
      y: 20,
    });
  });
});
