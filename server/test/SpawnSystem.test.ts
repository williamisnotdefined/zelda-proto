import { describe, expect, it, vi } from 'vitest';
import { Blob } from '../src/entities/Blob';
import { SpawnSystem } from '../src/game/systems/SpawnSystem';

describe('SpawnSystem', () => {
  it('keeps dead minions alive until drops are processed', () => {
    const spawnSystem = new SpawnSystem();
    const minion = new Blob('minion-1', 100, 100, 'minion');
    minion.respawnEnabled = false;
    minion.state = 'dead';
    minion.hasDropped = false;

    const blobs = new Map([[minion.id, minion]]);
    const removeEntity = vi.fn();

    spawnSystem.update(0, new Map(), blobs, vi.fn(), removeEntity);

    expect(blobs.has(minion.id)).toBe(true);
    expect(removeEntity).not.toHaveBeenCalled();
  });

  it('removes dead minions after drops are processed', () => {
    const spawnSystem = new SpawnSystem();
    const minion = new Blob('minion-2', 100, 100, 'minion');
    minion.respawnEnabled = false;
    minion.state = 'dead';
    minion.hasDropped = true;

    const blobs = new Map([[minion.id, minion]]);
    const removeEntity = vi.fn();

    spawnSystem.update(0, new Map(), blobs, vi.fn(), removeEntity);

    expect(blobs.has(minion.id)).toBe(false);
    expect(removeEntity).toHaveBeenCalledWith(minion.id);
  });
});
