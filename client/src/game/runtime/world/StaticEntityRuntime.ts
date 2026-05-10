import type { DropKind, DropSnapshot, HazardKind, HazardSnapshot, PortalSnapshot } from '@/shared';
import Phaser from 'phaser';
import { DropEntity } from '../../../entities/DropEntity';
import { PortalEntity } from '../../../entities/PortalEntity';
import { hazardRegistry } from './hazardRegistry';

const PICKUP_ENTITY_CULL_MARGIN_PX = 160;
const STATIC_ENTITY_CULL_MARGIN_PX = 260;
const PORTAL_ENTITY_CULL_MARGIN_PX = 1800;

type Destroyable = { destroy: () => void };
type HazardEntity = ReturnType<(typeof hazardRegistry)[keyof typeof hazardRegistry]['create']>;
type SnapshotSyncHazardEntity = HazardEntity & {
  syncSnapshot: (snapshot: HazardSnapshot) => void;
};
type ActiveDropEntity = { kind: DropKind; entity: DropEntity };
type ActiveHazardEntity = { kind: HazardKind; entity: HazardEntity };

export class StaticEntityRuntime {
  private readonly dropSnapshotsById = new Map<string, DropSnapshot>();
  private readonly portalSnapshotsById = new Map<string, PortalSnapshot>();
  private readonly hazardSnapshotsById = new Map<string, HazardSnapshot>();
  private readonly dropEntities = new Map<string, ActiveDropEntity>();
  private readonly portalEntities = new Map<string, PortalEntity>();
  private readonly hazardEntities = new Map<string, ActiveHazardEntity>();
  private readonly pickupEntityView = new Phaser.Geom.Rectangle();
  private readonly portalEntityView = new Phaser.Geom.Rectangle();
  private readonly staticEntityView = new Phaser.Geom.Rectangle();

  constructor(private readonly scene: Phaser.Scene) {}

  syncDrops(drops: DropSnapshot[]): void {
    this.syncSnapshotsById(drops, this.dropSnapshotsById, (id) => this.destroyDropEntity(id));
  }

  syncDropDelta(drops: DropSnapshot[], removedDropIds: string[]): void {
    this.upsertSnapshots(drops, this.dropSnapshotsById);
    this.removeSnapshotsById(removedDropIds, this.dropSnapshotsById, (id) =>
      this.destroyDropEntity(id)
    );
  }

  syncPortals(portals: PortalSnapshot[]): void {
    this.syncSnapshotsById(portals, this.portalSnapshotsById, (id) => this.destroyPortalEntity(id));
  }

  syncPortalDelta(portals: PortalSnapshot[], removedPortalIds: string[]): void {
    this.upsertSnapshots(portals, this.portalSnapshotsById);
    this.removeSnapshotsById(removedPortalIds, this.portalSnapshotsById, (id) =>
      this.destroyPortalEntity(id)
    );
  }

  syncHazards(hazards: HazardSnapshot[]): void {
    this.syncSnapshotsById(hazards, this.hazardSnapshotsById, (id) => this.destroyHazardEntity(id));
  }

  syncHazardDelta(hazards: HazardSnapshot[], removedHazardIds: string[]): void {
    this.upsertSnapshots(hazards, this.hazardSnapshotsById);
    this.removeSnapshotsById(removedHazardIds, this.hazardSnapshotsById, (id) =>
      this.destroyHazardEntity(id)
    );
  }

  update(delta: number): void {
    const pickupView = this.getPickupEntityView();
    const portalView = this.getPortalEntityView();
    const staticEntityView = this.getStaticEntityView();

    this.syncVisibleDrops(pickupView);
    this.syncVisiblePortals(portalView);
    this.syncVisibleHazards(staticEntityView);

    for (const { entity } of this.dropEntities.values()) {
      entity.update(delta, true);
    }

    for (const entity of this.portalEntities.values()) {
      entity.update(delta, true);
    }

    for (const { entity } of this.hazardEntities.values()) {
      entity.update(delta, true);
    }
  }

  reset(): void {
    this.dropSnapshotsById.clear();
    this.portalSnapshotsById.clear();
    this.hazardSnapshotsById.clear();
    for (const id of Array.from(this.dropEntities.keys())) {
      this.destroyDropEntity(id);
    }
    this.destroyEntityMap(this.portalEntities);
    for (const id of Array.from(this.hazardEntities.keys())) {
      this.destroyHazardEntity(id);
    }
  }

  getPortalEntities(): ReadonlyMap<string, PortalEntity> {
    return this.portalEntities;
  }

  getDropCount(): number {
    return this.dropSnapshotsById.size;
  }

  getPortalCount(): number {
    return this.portalSnapshotsById.size;
  }

  getHazardCount(): number {
    return this.hazardSnapshotsById.size;
  }

  private supportsSnapshotSync(entity: HazardEntity): entity is SnapshotSyncHazardEntity {
    return 'syncSnapshot' in entity;
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

  private getPortalEntityView(): Phaser.Geom.Rectangle {
    const worldView = this.scene.cameras.main.worldView;
    this.portalEntityView.setTo(
      worldView.x - PORTAL_ENTITY_CULL_MARGIN_PX,
      worldView.y - PORTAL_ENTITY_CULL_MARGIN_PX,
      worldView.width + PORTAL_ENTITY_CULL_MARGIN_PX * 2,
      worldView.height + PORTAL_ENTITY_CULL_MARGIN_PX * 2
    );
    return this.portalEntityView;
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

  private syncSnapshotsById<T extends { id: string }>(
    snapshots: T[],
    target: Map<string, T>,
    onRemoved: (id: string) => void
  ): void {
    const seenIds = new Set<string>();

    for (const snapshot of snapshots) {
      seenIds.add(snapshot.id);
      target.set(snapshot.id, snapshot);
    }

    for (const id of Array.from(target.keys())) {
      if (seenIds.has(id)) {
        continue;
      }

      target.delete(id);
      onRemoved(id);
    }
  }

  private upsertSnapshots<T extends { id: string }>(snapshots: T[], target: Map<string, T>): void {
    for (const snapshot of snapshots) {
      target.set(snapshot.id, snapshot);
    }
  }

  private removeSnapshotsById<T extends { id: string }>(
    ids: string[],
    target: Map<string, T>,
    onRemoved: (id: string) => void
  ): void {
    for (const id of ids) {
      target.delete(id);
      onRemoved(id);
    }
  }

  private syncVisibleDrops(view: Phaser.Geom.Rectangle): void {
    for (const [id, drop] of this.dropSnapshotsById) {
      if (!this.isEntityInView(view, drop.x, drop.y)) {
        this.destroyDropEntity(id);
        continue;
      }

      let active = this.dropEntities.get(id);
      if (!active || active.kind !== drop.kind) {
        this.destroyDropEntity(id);
        active = {
          kind: drop.kind,
          entity: new DropEntity(this.scene, drop.id, drop.x, drop.y, drop.kind),
        };
        this.dropEntities.set(id, active);
      }

      active.entity.updatePosition(drop.x, drop.y);
    }
  }

  private syncVisiblePortals(view: Phaser.Geom.Rectangle): void {
    for (const [id, portal] of this.portalSnapshotsById) {
      if (!this.isEntityInView(view, portal.x, portal.y)) {
        this.destroyPortalEntity(id);
        continue;
      }

      let entity = this.portalEntities.get(id);
      if (!entity) {
        entity = new PortalEntity(this.scene, portal.x, portal.y, portal.kind);
        this.portalEntities.set(id, entity);
      }

      entity.updatePosition(portal.x, portal.y);
      entity.updateKind(portal.kind);
    }
  }

  private syncVisibleHazards(view: Phaser.Geom.Rectangle): void {
    for (const [id, hazard] of this.hazardSnapshotsById) {
      if (!this.isEntityInView(view, hazard.x, hazard.y)) {
        this.destroyHazardEntity(id);
        continue;
      }

      let active = this.hazardEntities.get(id);
      if (!active || active.kind !== hazard.kind) {
        this.destroyHazardEntity(id);
        active = {
          kind: hazard.kind,
          entity: hazardRegistry[hazard.kind].create(this.scene, hazard),
        };
        this.hazardEntities.set(id, active);
      }

      if (this.supportsSnapshotSync(active.entity)) {
        active.entity.syncSnapshot(hazard);
      } else {
        active.entity.updatePosition(hazard.x, hazard.y);
      }
    }
  }

  private destroyDropEntity(id: string): void {
    const active = this.dropEntities.get(id);
    if (!active) {
      return;
    }

    active.entity.destroy();
    this.dropEntities.delete(id);
  }

  private destroyPortalEntity(id: string): void {
    const entity = this.portalEntities.get(id);
    if (!entity) {
      return;
    }

    entity.destroy();
    this.portalEntities.delete(id);
  }

  private destroyHazardEntity(id: string): void {
    const active = this.hazardEntities.get(id);
    if (!active) {
      return;
    }

    active.entity.destroy();
    this.hazardEntities.delete(id);
  }
}
