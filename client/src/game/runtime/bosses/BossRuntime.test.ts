import { BOSS_KINDS, type BossSnapshot } from '@/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bossMocks = vi.hoisted(() => ({
  entities: [] as Array<{ kind: string; destroyed: boolean; hp: number; x: number; y: number }>,
}));

vi.mock('../../../entities/BurningStatusOverlay', () => ({
  BurningStatusOverlay: class BurningStatusOverlay {
    destroy(): void {}
  },
}));

vi.mock('./bossRegistry', () => {
  class BossEntity {
    destroyed = false;
    hp: number;
    maxHp: number;
    state: string;
    x: number;
    y: number;

    constructor(readonly kind: string, snapshot: BossSnapshot) {
      this.hp = snapshot.hp;
      this.maxHp = snapshot.maxHp;
      this.state = snapshot.state;
      this.x = snapshot.x;
      this.y = snapshot.y;
      bossMocks.entities.push(this);
    }

    update(): void {}

    destroy(): void {
      this.destroyed = true;
    }
  }

  function createEntry(kind: string) {
    return {
      create: (_scene: unknown, snapshot: BossSnapshot) => new BossEntity(kind, snapshot),
      update: (entity: BossEntity, snapshot: BossSnapshot) => {
        entity.hp = snapshot.hp;
        entity.maxHp = snapshot.maxHp;
        entity.state = snapshot.state;
        entity.x = snapshot.x;
        entity.y = snapshot.y;
      },
    };
  }

  return {
    bossRegistry: {
      gelehk: createEntry('gelehk'),
      dragon_lord: createEntry('dragon_lord'),
      silverback_wainer: createEntry('silverback_wainer'),
      slim_maioli: createEntry('slim_maioli'),
      frankly_stein: createEntry('frankly_stein'),
      vanessa_the_ruthless: createEntry('vanessa_the_ruthless'),
    },
  };
});

import { BossRuntime } from './BossRuntime';

function createBoss(id: string, kind: BossSnapshot['kind']): BossSnapshot {
  return {
    id,
    kind,
    x: 10,
    y: 20,
    hp: 100,
    maxHp: 100,
    state: 'idle',
    phase: 1,
  };
}

describe('BossRuntime', () => {
  beforeEach(() => {
    bossMocks.entities.length = 0;
  });

  it('recreates an active boss when its kind changes for the same id', () => {
    const ui = { setBoss: vi.fn() };
    const fx = { spawnFloatingDamage: vi.fn() };
    const runtime = new BossRuntime({} as never, ui as never, fx as never);

    runtime.syncSnapshots([createBoss('boss-1', BOSS_KINDS.GELEHK)], [], [], [], null);
    const firstBoss = bossMocks.entities[0];

    runtime.syncSnapshots([createBoss('boss-1', BOSS_KINDS.DRAGON_LORD)], [], [], [], null);

    expect(firstBoss.destroyed).toBe(true);
    expect(bossMocks.entities).toHaveLength(2);
    expect(bossMocks.entities[1].kind).toBe(BOSS_KINDS.DRAGON_LORD);
    expect(runtime.getCount()).toBe(1);
  });
});
