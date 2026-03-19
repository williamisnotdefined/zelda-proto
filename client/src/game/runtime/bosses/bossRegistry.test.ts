import { describe, expect, it } from 'vitest';
import { BOSS_KINDS } from '@gelehka/shared';
import { bossRegistry } from './bossRegistry';

describe('bossRegistry', () => {
  it('covers every shared boss kind', () => {
    expect(Object.keys(bossRegistry).sort()).toEqual(Object.values(BOSS_KINDS).sort());
  });
});
