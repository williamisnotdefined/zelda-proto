import { describe, expect, it, vi } from 'vitest';
import { ENEMY_KINDS, PACMAN_GHOST_VARIANTS } from '@gelehka/shared';

vi.mock('../../../entities/Blob', () => ({
  BlobEntity: class BlobEntity {},
}));

vi.mock('../../../entities/Hand', () => ({
  HandEntity: class HandEntity {},
}));

vi.mock('../../../entities/PacmanGhost', () => ({
  PacmanGhostEntity: class PacmanGhostEntity {
    variant?: string;

    constructor(_scene: unknown, _x: number, _y: number, variant?: string) {
      this.variant = variant;
    }
  },
}));

vi.mock('../../../entities/Slime', () => ({
  SlimeEntity: class SlimeEntity {},
}));

async function loadRegistryFactory() {
  const mod = await import('./enemyVisualRegistry');
  return mod.createEnemyVisualRegistry;
}

describe('enemyVisualRegistry', () => {
  it('covers every shared enemy kind', async () => {
    const createEnemyVisualRegistry = await loadRegistryFactory();
    const registry = createEnemyVisualRegistry(128, 64);

    expect(Object.keys(registry).sort()).toEqual(Object.values(ENEMY_KINDS).sort());
  });

  it('creates isolated pools for pacman ghost variants', async () => {
    const createEnemyVisualRegistry = await loadRegistryFactory();
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
