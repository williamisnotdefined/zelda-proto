import { describe, expect, it } from 'vitest';
import { HAZARD_KINDS, PORTAL_KINDS } from '@gelehka/shared';
import { StaticEntityStore } from '../src/game/stores/StaticEntityStore';

describe('StaticEntityStore', () => {
  it('keeps drops, portals, and hazards mirrored in the ECS store', () => {
    const store = new StaticEntityStore();

    store.drops.set('drop-1', {
      id: 'drop-1',
      x: 10,
      y: 20,
      kind: 'heart_small',
    });
    store.portals.set('portal-1', {
      id: 'portal-1',
      x: 30,
      y: 40,
      kind: PORTAL_KINDS.PHASE1_TO_PHASE2,
      toInstanceId: 'phase2',
      targetX: 100,
      targetY: 200,
      activeAtMs: 0,
      expiresAtMs: null,
    });
    store.hazards.set('hazard-1', {
      id: 'hazard-1',
      x: 50,
      y: 60,
      kind: HAZARD_KINDS.FIRE_FIELD,
      ttlMs: 500,
      damage: 5,
      burningTicks: 3,
      hitPlayerIds: new Set(),
    });

    const dropEntityId = store.ecsWorld.query(['drop', 'position'])[0];
    const portalEntityId = store.ecsWorld.query(['portal', 'position'])[0];
    const hazardEntityId = store.ecsWorld.query(['hazard', 'position'])[0];

    expect(store.ecsWorld.getComponent(dropEntityId, 'position')).toEqual({ x: 10, y: 20 });
    expect(store.ecsWorld.getComponent(portalEntityId, 'portal')).toMatchObject({
      id: 'portal-1',
      kind: PORTAL_KINDS.PHASE1_TO_PHASE2,
    });
    expect(store.ecsWorld.getComponent(hazardEntityId, 'hazard')).toMatchObject({
      id: 'hazard-1',
      kind: HAZARD_KINDS.FIRE_FIELD,
    });

    expect(store.queryDropsInRadius(10, 20, 1).map((drop) => drop.id)).toEqual(['drop-1']);
    expect(store.queryPortalsInRadius(30, 40, 1).map((portal) => portal.id)).toEqual(['portal-1']);
    expect(store.queryHazardsInRadius(50, 60, 1).map((hazard) => hazard.id)).toEqual(['hazard-1']);

    store.portals.set('portal-1', {
      id: 'portal-1',
      x: 130,
      y: 140,
      kind: PORTAL_KINDS.PHASE1_TO_PHASE2,
      toInstanceId: 'phase2',
      targetX: 100,
      targetY: 200,
      activeAtMs: 0,
      expiresAtMs: null,
    });
    expect(store.queryPortalsInRadius(30, 40, 1)).toHaveLength(0);
    expect(store.queryPortalsInRadius(130, 140, 1).map((portal) => portal.id)).toEqual([
      'portal-1',
    ]);

    store.hazards.delete('hazard-1');
    expect(store.ecsWorld.query(['hazard'])).toHaveLength(0);
    expect(store.queryHazardsInRadius(50, 60, 1)).toHaveLength(0);
  });
});
