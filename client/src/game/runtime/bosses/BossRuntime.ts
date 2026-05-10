import type { AoeIndicator, BossSnapshot, IceZone, WaveIndicator } from '@/shared';
import type Phaser from 'phaser';
import { BurningStatusOverlay } from '../../../entities/BurningStatusOverlay';
import { FxController } from '../../fx/FxController';
import type { GameUiSink } from '../ui/GameUiSink';
import { bossRegistry, type BossEntity } from './bossRegistry';

export class BossRuntime {
  private readonly bossEntities = new Map<string, BossEntity>();
  private readonly bossEntityKindsById = new Map<string, BossSnapshot['kind']>();
  private readonly bossSnapshotsById = new Map<string, BossSnapshot>();
  private readonly burningOverlays = new Map<string, BurningStatusOverlay>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ui: GameUiSink,
    private readonly fx: FxController
  ) {}

  syncSnapshots(
    bosses: BossSnapshot[],
    iceZones: IceZone[],
    aoeIndicators: AoeIndicator[],
    waveIndicators: WaveIndicator[],
    localPlayer: { x: number; y: number } | null
  ): void {
    this.bossSnapshotsById.clear();
    for (const boss of bosses) {
      this.bossSnapshotsById.set(boss.id, boss);
    }

    this.renderBosses(iceZones, aoeIndicators, waveIndicators, localPlayer);
  }

  syncSnapshotDelta(
    bosses: BossSnapshot[],
    removedBossIds: string[],
    iceZones: IceZone[],
    aoeIndicators: AoeIndicator[],
    waveIndicators: WaveIndicator[],
    localPlayer: { x: number; y: number } | null
  ): void {
    for (const boss of bosses) {
      this.bossSnapshotsById.set(boss.id, boss);
    }

    for (const id of removedBossIds) {
      this.bossSnapshotsById.delete(id);
    }

    this.renderBosses(iceZones, aoeIndicators, waveIndicators, localPlayer);
  }

  update(delta: number): void {
    for (const [id, entity] of this.bossEntities) {
      entity.update(delta);
      const snapshot = this.bossSnapshotsById.get(id);
      this.syncBossBurningOverlay(
        id,
        entity.x,
        entity.y,
        snapshot?.state !== 'dead' && !!snapshot?.statusEffects?.burning
      );
    }
  }

  reset(): void {
    for (const entity of this.bossEntities.values()) {
      entity.destroy();
    }
    this.bossEntities.clear();
    this.bossEntityKindsById.clear();
    this.bossSnapshotsById.clear();
    for (const overlay of this.burningOverlays.values()) {
      overlay.destroy();
    }
    this.burningOverlays.clear();
    this.ui.setBoss(null);
  }

  getEntities(): ReadonlyMap<string, BossEntity> {
    return this.bossEntities;
  }

  getCount(): number {
    return this.bossEntities.size;
  }

  private renderBosses(
    iceZones: IceZone[],
    aoeIndicators: AoeIndicator[],
    waveIndicators: WaveIndicator[],
    localPlayer: { x: number; y: number } | null
  ): void {
    const seenBossIds = new Set<string>();
    const newBossIds = new Set<string>();
    let nearestBoss: BossSnapshot | null = null;
    let nearestBossDist = Infinity;

    for (const boss of this.bossSnapshotsById.values()) {
      seenBossIds.add(boss.id);
      let entity = this.bossEntities.get(boss.id);
      const previousKind = this.bossEntityKindsById.get(boss.id);
      if (entity && previousKind !== boss.kind) {
        entity.destroy();
        this.destroyBurningOverlay(boss.id);
        this.bossEntities.delete(boss.id);
        this.bossEntityKindsById.delete(boss.id);
        entity = undefined;
      }

      if (!entity) {
        entity = bossRegistry[boss.kind].create(this.scene, boss);
        this.bossEntities.set(boss.id, entity);
        this.bossEntityKindsById.set(boss.id, boss.kind);
        newBossIds.add(boss.id);
      }
    }

    for (const boss of this.bossSnapshotsById.values()) {
      const entity = this.bossEntities.get(boss.id);
      if (!entity) {
        continue;
      }

      const previousHp = entity.hp;

      bossRegistry[boss.kind].update(entity, boss, {
        iceZones,
        aoeIndicators,
        waveIndicators,
      });
      if (!newBossIds.has(boss.id)) {
        const damageTaken = previousHp - boss.hp;
        if (damageTaken > 0) {
          this.fx.spawnFloatingDamage(boss.x, boss.y, damageTaken, 'enemy');
        }
      }

      if (localPlayer) {
        const dx = localPlayer.x - boss.x;
        const dy = localPlayer.y - boss.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < nearestBossDist) {
          nearestBossDist = distSq;
          nearestBoss = boss;
        }
      }
    }

    for (const [id, entity] of this.bossEntities) {
      if (seenBossIds.has(id)) {
        continue;
      }

      entity.destroy();
      this.destroyBurningOverlay(id);
      this.bossEntities.delete(id);
      this.bossEntityKindsById.delete(id);
    }

    if (nearestBoss && nearestBoss.state !== 'dead') {
      this.ui.setBoss({
        id: nearestBoss.id,
        kind: nearestBoss.kind,
        x: nearestBoss.x,
        y: nearestBoss.y,
        hp: nearestBoss.hp,
        maxHp: nearestBoss.maxHp,
        state: nearestBoss.state,
        phase: nearestBoss.phase,
      });
      return;
    }

    this.ui.setBoss(null);
  }

  private syncBossBurningOverlay(id: string, x: number, y: number, active: boolean): void {
    if (!active) {
      this.destroyBurningOverlay(id);
      return;
    }

    let overlay = this.burningOverlays.get(id);
    if (!overlay) {
      overlay = new BurningStatusOverlay(this.scene, x, y, {
        sizePx: 126,
        offsetY: -6,
        depth: 13.4,
      });
      this.burningOverlays.set(id, overlay);
    }
    overlay.sync(x, y, true);
  }

  private destroyBurningOverlay(id: string): void {
    const overlay = this.burningOverlays.get(id);
    if (!overlay) {
      return;
    }

    overlay.destroy();
    this.burningOverlays.delete(id);
  }
}
