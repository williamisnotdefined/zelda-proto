import type { EntityId } from '../../core/ecs/EcsWorld.js';
import { EcsWorld } from '../../core/ecs/EcsWorld.js';

interface PositionComponent {
  x: number;
  y: number;
}

export interface EcsBackedCollectionHooks<T extends { id: string }> {
  onSet?: (ecsWorld: EcsWorld, entityId: EntityId, value: T) => void;
  onDelete?: (ecsWorld: EcsWorld, entityId: EntityId, value: T | undefined) => void;
}

function hasPosition(value: unknown): value is PositionComponent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    typeof value.x === 'number' &&
    typeof value.y === 'number'
  );
}

export class EcsBackedCollection<T extends { id: string }> extends Map<string, T> {
  private readonly entityIdsByKey = new Map<string, EntityId>();

  constructor(
    private readonly ecsWorld: EcsWorld,
    private readonly componentName: string,
    private readonly hooks: EcsBackedCollectionHooks<T> = {}
  ) {
    super();
  }

  override set(key: string, value: T): this {
    const entityId = this.ensureEntityId(key);
    super.set(key, value);
    this.ecsWorld.setComponent(entityId, this.componentName, value);

    if (hasPosition(value)) {
      this.ecsWorld.setComponent(entityId, 'position', {
        x: value.x,
        y: value.y,
      });
    }

    this.hooks.onSet?.(this.ecsWorld, entityId, value);

    return this;
  }

  override delete(key: string): boolean {
    const entityId = this.entityIdsByKey.get(key);
    const currentValue = super.get(key);
    const deleted = super.delete(key);

    if (entityId !== undefined) {
      this.hooks.onDelete?.(this.ecsWorld, entityId, currentValue);
      this.entityIdsByKey.delete(key);
      this.ecsWorld.removeEntity(entityId);
    }

    return deleted;
  }

  override clear(): void {
    for (const key of Array.from(this.entityIdsByKey.keys())) {
      this.delete(key);
    }
  }

  getEntityId(key: string): EntityId | undefined {
    return this.entityIdsByKey.get(key);
  }

  sync(key: string): void {
    const value = super.get(key);
    if (value) {
      this.set(key, value);
    }
  }

  syncAll(): void {
    for (const key of this.keys()) {
      this.sync(key);
    }
  }

  private ensureEntityId(key: string): EntityId {
    const existing = this.entityIdsByKey.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const entityId = this.ecsWorld.createEntity();
    this.entityIdsByKey.set(key, entityId);
    return entityId;
  }
}
