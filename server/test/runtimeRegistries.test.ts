import { describe, expect, it } from 'vitest';
import { BOSS_KINDS, ENEMY_KINDS, INSTANCE_IDS } from '@gelehka/shared';
import { bossRegistry, MAX_BOSS_ATTACK_HALF_DIAGONAL } from '../src/game/registries/bossRegistry';
import { enemyRegistry } from '../src/game/registries/enemyRegistry';
import {
  INSTANCE_RUNTIME_DEFINITIONS,
  ORDERED_INSTANCE_IDS,
} from '../src/game/registries/instanceRegistry';

describe('runtime registries', () => {
  it('covers every shared enemy and boss kind', () => {
    expect(Object.keys(enemyRegistry).sort()).toEqual(Object.values(ENEMY_KINDS).sort());
    expect(Object.keys(bossRegistry).sort()).toEqual(Object.values(BOSS_KINDS).sort());
    expect(MAX_BOSS_ATTACK_HALF_DIAGONAL).toBeGreaterThan(0);
  });

  it('keeps every instance definition wired to known registries', () => {
    expect(Object.keys(INSTANCE_RUNTIME_DEFINITIONS).sort()).toEqual(
      Object.values(INSTANCE_IDS).sort()
    );
    expect(ORDERED_INSTANCE_IDS).toEqual([
      INSTANCE_IDS.PHASE1,
      INSTANCE_IDS.PHASE2,
      INSTANCE_IDS.PHASE3,
      INSTANCE_IDS.PHASE4,
    ]);

    for (const instanceId of ORDERED_INSTANCE_IDS) {
      const definition = INSTANCE_RUNTIME_DEFINITIONS[instanceId];
      expect(enemyRegistry[definition.primaryEnemyKind]).toBeDefined();
      expect(bossRegistry[definition.bossRegion.spawnKind]).toBeDefined();

      for (const bossKind of definition.onBossDeathPortal?.sourceBossKinds ?? []) {
        expect(bossRegistry[bossKind]).toBeDefined();
      }
    }
  });
});
