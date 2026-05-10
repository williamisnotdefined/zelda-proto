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

  it('applies incremental transform and state deltas without a full resync', () => {
    const store = new EnemySnapshotStore();

    store.sync([
      { id: 'enemy-1', kind: 'blob', x: 10, y: 20, hp: 30, maxHp: 30, state: 'idle' },
      { id: 'enemy-2', kind: 'blob', x: 50, y: 60, hp: 30, maxHp: 30, state: 'idle' },
    ]);

    const result = store.syncDelta(
      [],
      [{ id: 'enemy-1', x: 14, y: 28 }],
      [{ id: 'enemy-1', hp: 20, maxHp: 30, state: 'chasing', facing: 'left' }],
      ['enemy-2']
    );

    expect(Array.from(result.dirtyIds)).toEqual(['enemy-1']);
    expect(result.releasedVisuals).toEqual([{ id: 'enemy-2', kind: 'blob' }]);
    expect(store.get('enemy-1')).toMatchObject({
      x: 14,
      y: 28,
      hp: 20,
      state: 'chasing',
      facing: 'left',
    });
    expect(store.get('enemy-2')).toBeUndefined();
  });
});
