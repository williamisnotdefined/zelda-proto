import { Entity } from './Entity.js';

export class World<T extends Entity = Entity> {
  readonly entities: Map<string, T> = new Map();

  add(entity: T): void {
    this.entities.set(entity.id, entity);
  }

  remove(id: string): void {
    this.entities.delete(id);
  }

  update(dt: number): void {
    for (const entity of this.entities.values()) {
      entity.update(dt);
    }
  }
}
