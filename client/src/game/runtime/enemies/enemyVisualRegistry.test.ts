import { describe, expect, it } from 'vitest';
import { ENEMY_KINDS, PACMAN_GHOST_VARIANTS } from '@gelehka/shared';
import { createEnemyVisualRegistry } from './enemyVisualRegistry';

describe('enemyVisualRegistry', () => {
  it('covers every shared enemy kind', () => {
    const registry = createEnemyVisualRegistry(128, 64);

    expect(Object.keys(registry).sort()).toEqual(Object.values(ENEMY_KINDS).sort());
  });

  it('creates isolated pools for pacman ghost variants', () => {
    const registry = createEnemyVisualRegistry(128, 64);
    const ghostEntry = registry[ENEMY_KINDS.PACMAN_GHOST];

    const redPool = ghostEntry.getAcquirePool({
      id: 'ghost-red',
      kind: ENEMY_KINDS.PACMAN_GHOST,
      variant: PACMAN_GHOST_VARIANTS.RED,
      x: 0,
      y: 0,
      hp: 1,
      maxHp: 1,
      state: 'idle',
    });
    const bluePool = ghostEntry.getAcquirePool({
      id: 'ghost-blue',
      kind: ENEMY_KINDS.PACMAN_GHOST,
      variant: PACMAN_GHOST_VARIANTS.BLUE,
      x: 0,
      y: 0,
      hp: 1,
      maxHp: 1,
      state: 'idle',
    });

    expect(redPool).not.toBe(bluePool);
  });
});
