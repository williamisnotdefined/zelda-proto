import { describe, expect, it } from 'vitest';
import { HAZARD_KINDS } from '@/shared';
import { hazardRegistry } from './hazardRegistry';

describe('hazardRegistry', () => {
  it('covers every shared hazard kind', () => {
    expect(Object.keys(hazardRegistry).sort()).toEqual(Object.values(HAZARD_KINDS).sort());
  });
});
