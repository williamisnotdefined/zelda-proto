export type EntityId = number;

export class EcsWorld {
  private nextEntityId = 1;
  private stores: Map<string, Map<EntityId, unknown>> = new Map();

  createEntity(): EntityId {
    const id = this.nextEntityId;
    this.nextEntityId += 1;
    return id;
  }

  setComponent<T>(entityId: EntityId, componentName: string, data: T): void {
    let store = this.stores.get(componentName);
    if (!store) {
      store = new Map<EntityId, T>();
      this.stores.set(componentName, store as Map<EntityId, unknown>);
    }
    (store as Map<EntityId, T>).set(entityId, data);
  }

  getComponent<T>(entityId: EntityId, componentName: string): T | undefined {
    const store = this.stores.get(componentName) as Map<EntityId, T> | undefined;
    return store?.get(entityId);
  }

  query(componentNames: string[]): EntityId[] {
    if (componentNames.length === 0) return [];
    const firstStore = this.stores.get(componentNames[0]);
    if (!firstStore) return [];

    const entityIds: EntityId[] = [];
    for (const entityId of firstStore.keys()) {
      let match = true;
      for (let i = 1; i < componentNames.length; i++) {
        const store = this.stores.get(componentNames[i]);
        if (!store || !store.has(entityId)) {
          match = false;
          break;
        }
      }
      if (match) entityIds.push(entityId);
    }
    return entityIds;
  }
}
