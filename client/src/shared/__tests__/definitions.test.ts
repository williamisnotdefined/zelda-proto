import { describe, expect, it } from 'vitest';
import {
  BOSS_KINDS,
  DROP_KINDS,
  ENEMY_KINDS,
  HAZARD_KINDS,
  PLAYER_STATUS_EFFECTS,
  PORTAL_KINDS,
} from '../types';
import {
  bossDefinitions,
  dropDefinitions,
  enemyDefinitions,
  hazardDefinitions,
  portalDefinitions,
} from '../definitions';

describe('shared definitions', () => {
  it('covers every shared runtime kind', () => {
    expect(Object.keys(enemyDefinitions).sort()).toEqual(Object.values(ENEMY_KINDS).sort());
    expect(Object.keys(bossDefinitions).sort()).toEqual(Object.values(BOSS_KINDS).sort());
    expect(Object.keys(dropDefinitions).sort()).toEqual(Object.values(DROP_KINDS).sort());
    expect(Object.keys(portalDefinitions).sort()).toEqual(Object.values(PORTAL_KINDS).sort());
    expect(Object.keys(hazardDefinitions).sort()).toEqual(Object.values(HAZARD_KINDS).sort());
  });

  it('keeps hazard metadata aligned with known status effects', () => {
    const knownStatusEffects = new Set(Object.values(PLAYER_STATUS_EFFECTS));

    for (const definition of Object.values(hazardDefinitions)) {
      expect(definition.ttlMs).toBeGreaterThan(0);
      expect(definition.hitRadius).toBeGreaterThan(0);
      expect(definition.burningTicks).toBeGreaterThanOrEqual(0);
      if (definition.statusEffect) {
        expect(knownStatusEffects.has(definition.statusEffect)).toBe(true);
      }
    }
  });
});
