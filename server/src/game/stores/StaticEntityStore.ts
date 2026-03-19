import type { EntityId } from '../../core/ecs/EcsWorld.js';
import { EcsWorld } from '../../core/ecs/EcsWorld.js';
import { SpatialQueryIndex } from '../../core/ecs/SpatialQueryIndex.js';
import type { Drop, Hazard, Portal } from '../World.js';
import { EcsBackedCollection } from './EcsBackedCollection.js';

const DROP_COMPONENT = 'drop';
const PORTAL_COMPONENT = 'portal';
const HAZARD_COMPONENT = 'hazard';
const DEFAULT_CELL_SIZE = 512;

function queryObjectsInRadius<T>(
  ecsWorld: EcsWorld,
  spatialIndex: SpatialQueryIndex,
  x: number,
  y: number,
  radius: number,
  componentName: string
): T[] {
  const objects: T[] = [];
  spatialIndex.forEachInRadius(x, y, radius, (entityId) => {
    const value = ecsWorld.getComponent<T>(entityId, componentName);
    if (value) {
      objects.push(value);
    }
  });
  return objects;
}

function forEachObjectInRadius<T>(
  ecsWorld: EcsWorld,
  spatialIndex: SpatialQueryIndex,
  x: number,
  y: number,
  radius: number,
  componentName: string,
  callback: (value: T) => void
): void {
  spatialIndex.forEachInRadius(x, y, radius, (entityId) => {
    const value = ecsWorld.getComponent<T>(entityId, componentName);
    if (value) {
      callback(value);
    }
  });
}

export class StaticEntityStore {
  readonly ecsWorld = new EcsWorld();
  private readonly spatialIndex = new SpatialQueryIndex(DEFAULT_CELL_SIZE);
  readonly drops = new EcsBackedCollection<Drop>(this.ecsWorld, DROP_COMPONENT, {
    onSet: (_ecsWorld, entityId, drop) => {
      this.spatialIndex.upsert(entityId, drop.x, drop.y);
    },
    onDelete: (_ecsWorld, entityId) => {
      this.spatialIndex.remove(entityId);
    },
  });
  readonly portals = new EcsBackedCollection<Portal>(this.ecsWorld, PORTAL_COMPONENT, {
    onSet: (_ecsWorld, entityId, portal) => {
      this.spatialIndex.upsert(entityId, portal.x, portal.y);
    },
    onDelete: (_ecsWorld, entityId) => {
      this.spatialIndex.remove(entityId);
    },
  });
  readonly hazards = new EcsBackedCollection<Hazard>(this.ecsWorld, HAZARD_COMPONENT, {
    onSet: (_ecsWorld, entityId, hazard) => {
      this.spatialIndex.upsert(entityId, hazard.x, hazard.y);
    },
    onDelete: (_ecsWorld, entityId) => {
      this.spatialIndex.remove(entityId);
    },
  });

  queryDropsInRadius(x: number, y: number, radius: number): Drop[] {
    return queryObjectsInRadius<Drop>(
      this.ecsWorld,
      this.spatialIndex,
      x,
      y,
      radius,
      DROP_COMPONENT
    );
  }

  forEachDropInRadius(x: number, y: number, radius: number, callback: (drop: Drop) => void): void {
    forEachObjectInRadius<Drop>(
      this.ecsWorld,
      this.spatialIndex,
      x,
      y,
      radius,
      DROP_COMPONENT,
      callback
    );
  }

  queryPortalsInRadius(x: number, y: number, radius: number): Portal[] {
    return queryObjectsInRadius<Portal>(
      this.ecsWorld,
      this.spatialIndex,
      x,
      y,
      radius,
      PORTAL_COMPONENT
    );
  }

  forEachPortalInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (portal: Portal) => void
  ): void {
    forEachObjectInRadius<Portal>(
      this.ecsWorld,
      this.spatialIndex,
      x,
      y,
      radius,
      PORTAL_COMPONENT,
      callback
    );
  }

  queryHazardsInRadius(x: number, y: number, radius: number): Hazard[] {
    return queryObjectsInRadius<Hazard>(
      this.ecsWorld,
      this.spatialIndex,
      x,
      y,
      radius,
      HAZARD_COMPONENT
    );
  }

  forEachHazardInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (hazard: Hazard) => void
  ): void {
    forEachObjectInRadius<Hazard>(
      this.ecsWorld,
      this.spatialIndex,
      x,
      y,
      radius,
      HAZARD_COMPONENT,
      callback
    );
  }

  getDropEntityId(dropId: string): EntityId | undefined {
    return this.drops.getEntityId(dropId);
  }

  getPortalEntityId(portalId: string): EntityId | undefined {
    return this.portals.getEntityId(portalId);
  }

  getHazardEntityId(hazardId: string): EntityId | undefined {
    return this.hazards.getEntityId(hazardId);
  }
}
