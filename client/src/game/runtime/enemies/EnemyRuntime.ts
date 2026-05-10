import type { EnemySnapshot, EnemyStateDelta, EnemyTransformSnapshot } from '@/shared';
import Phaser from 'phaser';
import { BurningStatusOverlay } from '../../../entities/BurningStatusOverlay';
import { FxController } from '../../fx/FxController';
import { EnemySnapshotStore } from './EnemySnapshotStore';
import {
  type EnemyVisualEntity,
  type EnemyVisualLod,
  type EnemyVisualStats,
  createEnemyVisualRegistry,
} from './enemyVisualRegistry';

const MAX_COMMON_ENEMY_POOL_SIZE = 128;
const MAX_PACMAN_GHOST_ENTITY_POOL_SIZE = 64;
const ENTITY_CULL_MARGIN_PX = 220;
const ENEMY_VISUAL_SYNC_MOVEMENT_THRESHOLD_PX = ENTITY_CULL_MARGIN_PX;
const ENEMY_VISUAL_LOD_NEAR_DISTANCE_PX = 420;
const ENEMY_VISUAL_LOD_MID_DISTANCE_PX = 860;
const ENEMY_VISUAL_LOD_NEAR_TIME_SCALE = 1;
const ENEMY_VISUAL_LOD_MID_TIME_SCALE = 0.75;
const ENEMY_VISUAL_ANIMATION_BUDGET = 160;
const MAX_SMOOTH_VISIBLE_ENEMIES = 400;

type EnemyVisualCandidate = {
  id: string;
  distSq: number;
  baseLod: EnemyVisualLod;
};

type EnemyVisualBudget = {
  lodById: Map<string, EnemyVisualLod>;
  nearCount: number;
  midCount: number;
  farCount: number;
  animatedCount: number;
};

const ENEMY_VISUAL_LOD_NEAR: EnemyVisualLod = {
  tier: 'near',
  animate: true,
  animationTimeScale: ENEMY_VISUAL_LOD_NEAR_TIME_SCALE,
};

const ENEMY_VISUAL_LOD_MID: EnemyVisualLod = {
  tier: 'mid',
  animate: true,
  animationTimeScale: ENEMY_VISUAL_LOD_MID_TIME_SCALE,
};

const ENEMY_VISUAL_LOD_FAR: EnemyVisualLod = {
  tier: 'far',
  animate: false,
  animationTimeScale: 0,
};

export class EnemyRuntime {
  private readonly snapshotStore = new EnemySnapshotStore();
  private readonly registry = createEnemyVisualRegistry(
    MAX_COMMON_ENEMY_POOL_SIZE,
    MAX_PACMAN_GHOST_ENTITY_POOL_SIZE
  );
  private readonly expandedEnemyView = new Phaser.Geom.Rectangle();
  private readonly dirtyEnemyVisualIds = new Set<string>();
  private readonly burningOverlays = new Map<string, BurningStatusOverlay>();
  private pendingEnemyVisualSync = true;
  private lastEnemyVisualSyncCenterX = Number.NaN;
  private lastEnemyVisualSyncCenterY = Number.NaN;
  private lastEnemyVisualSyncWidth = 0;
  private lastEnemyVisualSyncHeight = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: FxController
  ) {}

  syncSnapshots(enemies: EnemySnapshot[]): void {
    const result = this.snapshotStore.sync(enemies);
    this.applySnapshotSyncResult(result);
  }

  syncSnapshotDelta(
    enemies: EnemySnapshot[],
    enemyTransforms: EnemyTransformSnapshot[],
    enemyStates: EnemyStateDelta[],
    removedEnemyIds: string[]
  ): void {
    const result = this.snapshotStore.syncDelta(
      enemies,
      enemyTransforms,
      enemyStates,
      removedEnemyIds
    );
    this.applySnapshotSyncResult(result);
  }

  private applySnapshotSyncResult(result: {
    dirtyIds: Set<string>;
    releasedVisuals: Array<{ id: string; kind: EnemySnapshot['kind'] }>;
  }): void {
    for (const releasedVisual of result.releasedVisuals) {
      this.releaseEnemyVisual(releasedVisual.id, releasedVisual.kind);
    }

    for (const enemyId of result.dirtyIds) {
      this.dirtyEnemyVisualIds.add(enemyId);
    }
  }

  update(delta: number, originX: number, originY: number): EnemyVisualStats {
    const expandedView = this.getExpandedEnemyView();

    if (this.shouldSyncEnemyVisuals(expandedView)) {
      this.syncVisibleEnemyEntities(expandedView);
      this.pendingEnemyVisualSync = false;
      this.dirtyEnemyVisualIds.clear();
      this.rememberEnemyVisualSyncView(expandedView);
    } else {
      this.syncDirtyEnemyVisualPresence(expandedView);
    }

    const visibleEnemyCount = this.snapshotStore.countInRect(this.scene.cameras.main.worldView);
    if (visibleEnemyCount <= MAX_SMOOTH_VISIBLE_ENEMIES) {
      return this.updateEnemyVisualsWithDistanceLod(
        originX,
        originY,
        expandedView,
        delta,
        visibleEnemyCount
      );
    }

    return this.updateEnemyVisualsWithBudget(
      originX,
      originY,
      expandedView,
      delta,
      visibleEnemyCount
    );
  }

  handleScaleResize(): void {
    this.pendingEnemyVisualSync = true;
  }

  forEachSnapshotInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (enemy: EnemySnapshot) => void
  ): void {
    this.snapshotStore.forEachInRadius(x, y, radius, callback);
  }

  getSnapshotCount(): number {
    return this.snapshotStore.size();
  }

  getVisualCount(): number {
    return this.getRegistryEntries().reduce((total, entry) => total + entry.entities.size, 0);
  }

  getPooledVisualCount(): number {
    return this.getRegistryEntries().reduce((total, entry) => total + entry.pooledCount(), 0);
  }

  reset(): void {
    for (const entry of this.getRegistryEntries()) {
      this.destroyEntityMap(entry.entities);
      entry.destroyPools();
    }

    this.snapshotStore.clear();
    this.dirtyEnemyVisualIds.clear();
    for (const overlay of this.burningOverlays.values()) {
      overlay.destroy();
    }
    this.burningOverlays.clear();
    this.pendingEnemyVisualSync = true;
    this.lastEnemyVisualSyncCenterX = Number.NaN;
    this.lastEnemyVisualSyncCenterY = Number.NaN;
    this.lastEnemyVisualSyncWidth = 0;
    this.lastEnemyVisualSyncHeight = 0;
  }

  private getRegistryEntries() {
    return Object.values(this.registry);
  }

  private getExpandedEnemyView(): Phaser.Geom.Rectangle {
    const worldView = this.scene.cameras.main.worldView;
    this.expandedEnemyView.setTo(
      worldView.x - ENTITY_CULL_MARGIN_PX,
      worldView.y - ENTITY_CULL_MARGIN_PX,
      worldView.width + ENTITY_CULL_MARGIN_PX * 2,
      worldView.height + ENTITY_CULL_MARGIN_PX * 2
    );
    return this.expandedEnemyView;
  }

  private syncDirtyEnemyVisualPresence(view: Phaser.Geom.Rectangle): void {
    if (this.dirtyEnemyVisualIds.size === 0) {
      return;
    }

    for (const enemyId of this.dirtyEnemyVisualIds) {
      const enemy = this.snapshotStore.get(enemyId);
      if (!enemy) {
        continue;
      }

      if (!this.isEntityInView(view, enemy.x, enemy.y)) {
        this.releaseEnemyVisual(enemy.id, enemy.kind);
        continue;
      }

      if (!this.hasEnemyVisual(enemy)) {
        this.ensureEnemyVisual(enemy);
        continue;
      }

      this.updateExistingEnemyVisual(enemy);
    }

    this.dirtyEnemyVisualIds.clear();
  }

  private shouldSyncEnemyVisuals(view: Phaser.Geom.Rectangle): boolean {
    if (this.pendingEnemyVisualSync) {
      return true;
    }

    if (
      Number.isNaN(this.lastEnemyVisualSyncCenterX) ||
      Number.isNaN(this.lastEnemyVisualSyncCenterY)
    ) {
      return true;
    }

    if (
      view.width !== this.lastEnemyVisualSyncWidth ||
      view.height !== this.lastEnemyVisualSyncHeight
    ) {
      return true;
    }

    const centerX = view.x + view.width / 2;
    const centerY = view.y + view.height / 2;
    const dx = centerX - this.lastEnemyVisualSyncCenterX;
    const dy = centerY - this.lastEnemyVisualSyncCenterY;

    return (
      Math.abs(dx) > ENEMY_VISUAL_SYNC_MOVEMENT_THRESHOLD_PX ||
      Math.abs(dy) > ENEMY_VISUAL_SYNC_MOVEMENT_THRESHOLD_PX
    );
  }

  private rememberEnemyVisualSyncView(view: Phaser.Geom.Rectangle): void {
    this.lastEnemyVisualSyncCenterX = view.x + view.width / 2;
    this.lastEnemyVisualSyncCenterY = view.y + view.height / 2;
    this.lastEnemyVisualSyncWidth = view.width;
    this.lastEnemyVisualSyncHeight = view.height;
  }

  private syncVisibleEnemyEntities(view: Phaser.Geom.Rectangle): void {
    const visibleEnemyIds = new Set<string>();

    this.snapshotStore.forEachInRect(view, (enemy) => {
      visibleEnemyIds.add(enemy.id);
      if (!this.hasEnemyVisual(enemy)) {
        this.ensureEnemyVisual(enemy);
        return;
      }

      this.updateExistingEnemyVisual(enemy);
    });

    for (const entry of this.getRegistryEntries()) {
      this.destroyEnemyVisualsOutsideSet(entry.entities, visibleEnemyIds, entry.kind);
    }
  }

  private destroyEnemyVisualsOutsideSet(
    entities: Map<string, EnemyVisualEntity>,
    visibleEnemyIds: Set<string>,
    kind: EnemySnapshot['kind']
  ): void {
    for (const [id] of entities) {
      if (visibleEnemyIds.has(id)) {
        continue;
      }

      this.releaseEnemyVisual(id, kind);
    }
  }

  private hasEnemyVisual(enemy: EnemySnapshot): boolean {
    const entry = this.registry[enemy.kind];
    const entity = entry.entities.get(enemy.id);
    return !!entity && entry.matches(entity, enemy);
  }

  private updateExistingEnemyVisual(enemy: EnemySnapshot): void {
    const entry = this.registry[enemy.kind];
    const entity = entry.entities.get(enemy.id);
    if (!entity || !entry.matches(entity, enemy)) {
      return;
    }

    const previousHp = entity.hp;

    entry.update(entity, enemy);

    const damageTaken = previousHp - enemy.hp;
    if (damageTaken > 0) {
      this.fx.spawnFloatingDamage(enemy.x, enemy.y, damageTaken, 'enemy');
    }
  }

  private ensureEnemyVisual(enemy: EnemySnapshot): void {
    const entry = this.registry[enemy.kind];
    const existing = entry.entities.get(enemy.id);
    if (existing) {
      if (entry.matches(existing, enemy)) {
        return;
      }
      this.releaseEnemyVisual(enemy.id, enemy.kind);
    }

    const pool = entry.getAcquirePool(enemy);
    const entity = this.acquirePooledEntity(
      pool,
      () => entry.create(this.scene, enemy),
      (pooled) => entry.restore(pooled, enemy)
    );
    entry.entities.set(enemy.id, entity);
  }

  private releaseEnemyVisual(id: string, kind: EnemySnapshot['kind']): void {
    const entry = this.registry[kind];
    const entity = entry.entities.get(id);
    if (!entity) {
      return;
    }

    entry.entities.delete(id);
    this.destroyBurningOverlay(id);
    this.releaseToPoolOrDestroy(entry.getReleasePool(entity), entity, entry.maxPoolSize);
  }

  private syncEnemyBurningOverlay(
    id: string,
    x: number,
    y: number,
    active: boolean,
    inView: boolean
  ): void {
    if (!active) {
      this.destroyBurningOverlay(id);
      return;
    }

    let overlay = this.burningOverlays.get(id);
    if (!overlay) {
      overlay = new BurningStatusOverlay(this.scene, x, y, { depth: 13.3 });
      this.burningOverlays.set(id, overlay);
    }
    overlay.sync(x, y, inView);
  }

  private destroyBurningOverlay(id: string): void {
    const overlay = this.burningOverlays.get(id);
    if (!overlay) {
      return;
    }

    overlay.destroy();
    this.burningOverlays.delete(id);
  }

  private acquirePooledEntity<T extends EnemyVisualEntity>(
    pool: T[],
    createEntity: () => T,
    prepareEntity: (entity: T) => void
  ): T {
    const entity = pool.pop() ?? createEntity();
    prepareEntity(entity);
    return entity;
  }

  private releaseToPoolOrDestroy<T extends EnemyVisualEntity>(
    pool: T[],
    entity: T,
    maxSize: number
  ): void {
    entity.setDormant();
    if (pool.length < maxSize) {
      pool.push(entity);
      return;
    }

    entity.destroy();
  }

  private destroyEntityMap<T extends { destroy: () => void }>(entities: Map<string, T>): void {
    for (const entity of entities.values()) {
      entity.destroy();
    }
    entities.clear();
  }

  private isEntityInView(view: Phaser.Geom.Rectangle, x: number, y: number): boolean {
    return x >= view.left && x <= view.right && y >= view.top && y <= view.bottom;
  }

  private getEnemyVisualLodForDistance(distSq: number): EnemyVisualLod {
    if (distSq <= ENEMY_VISUAL_LOD_NEAR_DISTANCE_PX * ENEMY_VISUAL_LOD_NEAR_DISTANCE_PX) {
      return ENEMY_VISUAL_LOD_NEAR;
    }

    if (distSq <= ENEMY_VISUAL_LOD_MID_DISTANCE_PX * ENEMY_VISUAL_LOD_MID_DISTANCE_PX) {
      return ENEMY_VISUAL_LOD_MID;
    }

    return ENEMY_VISUAL_LOD_FAR;
  }

  private getBudgetedEnemyVisualLod(
    baseLod: EnemyVisualLod,
    priorityIndex: number
  ): EnemyVisualLod {
    if (priorityIndex < ENEMY_VISUAL_ANIMATION_BUDGET) {
      return baseLod;
    }

    return ENEMY_VISUAL_LOD_FAR;
  }

  private collectEnemyVisualCandidates(
    view: Phaser.Geom.Rectangle,
    originX: number,
    originY: number,
    candidates: EnemyVisualCandidate[]
  ): void {
    for (const entry of this.getRegistryEntries()) {
      for (const [id, entity] of entry.entities) {
        if (entity.serverState === 'dead') {
          continue;
        }

        const { x, y } = entity;
        if (!this.isEntityInView(view, x, y)) {
          continue;
        }

        const dx = x - originX;
        const dy = y - originY;
        const distSq = dx * dx + dy * dy;
        candidates.push({
          id,
          distSq,
          baseLod: this.getEnemyVisualLodForDistance(distSq),
        });
      }
    }
  }

  private buildEnemyVisualBudget(
    originX: number,
    originY: number,
    view: Phaser.Geom.Rectangle
  ): EnemyVisualBudget {
    const candidates: EnemyVisualCandidate[] = [];
    this.collectEnemyVisualCandidates(view, originX, originY, candidates);
    candidates.sort((a, b) => a.distSq - b.distSq);

    const lodById = new Map<string, EnemyVisualLod>();
    let nearCount = 0;
    let midCount = 0;
    let farCount = 0;
    let animatedCount = 0;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const lod = this.getBudgetedEnemyVisualLod(candidate.baseLod, index);
      lodById.set(candidate.id, lod);

      if (lod.tier === 'near') {
        nearCount += 1;
      } else if (lod.tier === 'mid') {
        midCount += 1;
      } else {
        farCount += 1;
      }

      if (lod.animate) {
        animatedCount += 1;
      }
    }

    return {
      lodById,
      nearCount,
      midCount,
      farCount,
      animatedCount,
    };
  }

  private createEnemyVisualStats(visibleCount: number, usingBudget: boolean): EnemyVisualStats {
    return {
      visibleCount,
      nearCount: 0,
      midCount: 0,
      farCount: 0,
      animatedCount: 0,
      usingBudget,
    };
  }

  private recordEnemyVisualStats(stats: EnemyVisualStats, lod: EnemyVisualLod): void {
    if (lod.tier === 'near') {
      stats.nearCount += 1;
    } else if (lod.tier === 'mid') {
      stats.midCount += 1;
    } else {
      stats.farCount += 1;
    }

    if (lod.animate) {
      stats.animatedCount += 1;
    }
  }

  private updateEnemyVisualsWithDistanceLod(
    originX: number,
    originY: number,
    view: Phaser.Geom.Rectangle,
    delta: number,
    visibleCount: number
  ): EnemyVisualStats {
    const stats = this.createEnemyVisualStats(visibleCount, false);

    for (const entry of this.getRegistryEntries()) {
      for (const [id, entity] of entry.entities) {
        const { x, y } = entity;
        const inView = this.isEntityInView(view, x, y);

        let lod = ENEMY_VISUAL_LOD_FAR;
        if (inView && entity.serverState !== 'dead') {
          const dx = x - originX;
          const dy = y - originY;
          lod = this.getEnemyVisualLodForDistance(dx * dx + dy * dy);
          this.recordEnemyVisualStats(stats, lod);
        }

        entity.update(delta, inView, lod);
        this.syncEnemyBurningOverlay(
          id,
          entity.x,
          entity.y,
          entity.serverState !== 'dead' && !!this.snapshotStore.get(id)?.statusEffects?.burning,
          inView
        );
      }
    }

    return stats;
  }

  private updateEnemyVisualsWithBudget(
    originX: number,
    originY: number,
    view: Phaser.Geom.Rectangle,
    delta: number,
    visibleCount: number
  ): EnemyVisualStats {
    const enemyVisualBudget = this.buildEnemyVisualBudget(originX, originY, view);

    for (const entry of this.getRegistryEntries()) {
      for (const [id, entity] of entry.entities) {
        const inView = this.isEntityInView(view, entity.x, entity.y);
        const lod = inView
          ? (enemyVisualBudget.lodById.get(id) ?? ENEMY_VISUAL_LOD_FAR)
          : ENEMY_VISUAL_LOD_FAR;
        entity.update(delta, inView, lod);
        this.syncEnemyBurningOverlay(
          id,
          entity.x,
          entity.y,
          entity.serverState !== 'dead' && !!this.snapshotStore.get(id)?.statusEffects?.burning,
          inView
        );
      }
    }

    return {
      visibleCount,
      nearCount: enemyVisualBudget.nearCount,
      midCount: enemyVisualBudget.midCount,
      farCount: enemyVisualBudget.farCount,
      animatedCount: enemyVisualBudget.animatedCount,
      usingBudget: true,
    };
  }
}
