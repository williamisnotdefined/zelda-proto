import { describe, expect, it } from 'vitest';
import { EnemySnapshotStore } from './EnemySnapshotStore';

describe('EnemySnapshotStore', () => {
  it('marks elite changes as dirty without releasing the visual', () => {
    const store = new EnemySnapshotStore();

    store.sync([
      { id: 'enemy-1', kind: 'blob', x: 10, y: 20, hp: 30, maxHp: 30, state: 'idle', elite: false },
    ]);

    const result = store.sync([
      { id: 'enemy-1', kind: 'blob', x: 10, y: 20, hp: 90, maxHp: 90, state: 'idle', elite: true },
    ]);

    expect(Array.from(result.dirtyIds)).toEqual(['enemy-1']);
    expect(result.releasedVisuals).toEqual([]);
    expect(store.get('enemy-1')).toMatchObject({ elite: true, maxHp: 90 });
  });
});
