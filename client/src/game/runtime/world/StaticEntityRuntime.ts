import type { DropSnapshot, HazardSnapshot, PortalSnapshot } from '@/shared';
import Phaser from 'phaser';
import { DropEntity } from '../../../entities/DropEntity';
import { PortalEntity } from '../../../entities/PortalEntity';
import { hazardRegistry } from './hazardRegistry';

const PICKUP_ENTITY_CULL_MARGIN_PX = 160;
const STATIC_ENTITY_CULL_MARGIN_PX = 260;

type Destroyable = { destroy: () => void };
type PositionSyncEntity = Destroyable & { updatePosition: (x: number, y: number) => void };
type HazardEntity = ReturnType<(typeof hazardRegistry)[keyof typeof hazardRegistry]['create']>;

export class StaticEntityRuntime {
  private readonly dropEntities = new Map<string, DropEntity>();
  private readonly portalEntities = new Map<string, PortalEntity>();
  private readonly hazardEntities = new Map<string, HazardEntity>();
  private readonly pickupEntityView = new Phaser.Geom.Rectangle();
  private readonly staticEntityView = new Phaser.Geom.Rectangle();

  constructor(private readonly scene: Phaser.Scene) {}

  syncDrops(drops: DropSnapshot[]): void {
    this.syncPositionEntities(
      drops,
      this.dropEntities,
      (drop) => new DropEntity(this.scene, drop.x, drop.y, drop.kind)
    );
  }

  syncPortals(portals: PortalSnapshot[]): void {
    const seenPortalIds = new Set<string>();

    for (const portal of portals) {
      seenPortalIds.add(portal.id);
      let entity = this.portalEntities.get(portal.id);
      if (!entity) {
        entity = new PortalEntity(this.scene, portal.x, portal.y, portal.kind);
        this.portalEntities.set(portal.id, entity);
      }

      entity.updatePosition(portal.x, portal.y);
      entity.updateKind(portal.kind);
    }

    for (const [id, entity] of this.portalEntities) {
      if (seenPortalIds.has(id)) {
        continue;
      }

      entity.destroy();
      this.portalEntities.delete(id);
    }
  }

  syncHazards(hazards: HazardSnapshot[]): void {
    const seenHazardIds = new Set<string>();

    for (const hazard of hazards) {
      seenHazardIds.add(hazard.id);
      let entity = this.hazardEntities.get(hazard.id);
      if (!entity) {
        entity = hazardRegistry[hazard.kind].create(this.scene, hazard);
        this.hazardEntities.set(hazard.id, entity);
      }
      entity.updatePosition(hazard.x, hazard.y);
    }

    for (const [id, entity] of this.hazardEntities) {
      if (seenHazardIds.has(id)) {
        continue;
      }

      entity.destroy();
      this.hazardEntities.delete(id);
    }
  }

  update(delta: number): void {
    const pickupView = this.getPickupEntityView();
    const staticEntityView = this.getStaticEntityView();

    for (const entity of this.dropEntities.values()) {
      entity.update(delta, this.isEntityInView(pickupView, entity.sprite.x, entity.sprite.y));
    }

    for (const entity of this.portalEntities.values()) {
      entity.update(delta, this.isEntityInView(staticEntityView, entity.x, entity.y));
    }

    for (const entity of this.hazardEntities.values()) {
      entity.update(delta, this.isEntityInView(staticEntityView, entity.x, entity.y));
    }
  }

  reset(): void {
    this.destroyEntityMap(this.dropEntities);
    this.destroyEntityMap(this.portalEntities);
    this.destroyEntityMap(this.hazardEntities);
  }

  getPortalEntities(): ReadonlyMap<string, PortalEntity> {
    return this.portalEntities;
  }

  getDropCount(): number {
    return this.dropEntities.size;
  }

  getPortalCount(): number {
    return this.portalEntities.size;
  }

  getHazardCount(): number {
    return this.hazardEntities.size;
  }

  private getPickupEntityView(): Phaser.Geom.Rectangle {
    const worldView = this.scene.cameras.main.worldView;
    this.pickupEntityView.setTo(
      worldView.x - PICKUP_ENTITY_CULL_MARGIN_PX,
      worldView.y - PICKUP_ENTITY_CULL_MARGIN_PX,
      worldView.width + PICKUP_ENTITY_CULL_MARGIN_PX * 2,
      worldView.height + PICKUP_ENTITY_CULL_MARGIN_PX * 2
    );
    return this.pickupEntityView;
  }

  private getStaticEntityView(): Phaser.Geom.Rectangle {
    const worldView = this.scene.cameras.main.worldView;
    this.staticEntityView.setTo(
      worldView.x - STATIC_ENTITY_CULL_MARGIN_PX,
      worldView.y - STATIC_ENTITY_CULL_MARGIN_PX,
      worldView.width + STATIC_ENTITY_CULL_MARGIN_PX * 2,
      worldView.height + STATIC_ENTITY_CULL_MARGIN_PX * 2
    );
    return this.staticEntityView;
  }

  private isEntityInView(view: Phaser.Geom.Rectangle, x: number, y: number): boolean {
    return x >= view.left && x <= view.right && y >= view.top && y <= view.bottom;
  }

  private destroyEntityMap<T extends Destroyable>(entities: Map<string, T>): void {
    for (const entity of entities.values()) {
      entity.destroy();
    }
    entities.clear();
  }

  private syncPositionEntities<
    T extends { id: string; x: number; y: number },
    TEntity extends PositionSyncEntity,
  >(snapshots: T[], entities: Map<string, TEntity>, createEntity: (snapshot: T) => TEntity): void {
    const seenIds = new Set<string>();

    for (const snapshot of snapshots) {
      seenIds.add(snapshot.id);
      let entity = entities.get(snapshot.id);
      if (!entity) {
        entity = createEntity(snapshot);
        entities.set(snapshot.id, entity);
      }
      entity.updatePosition(snapshot.x, snapshot.y);
    }

    for (const [id, entity] of entities) {
      if (seenIds.has(id)) {
        continue;
      }

      entity.destroy();
      entities.delete(id);
    }
  }
}
