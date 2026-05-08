import type { AoeIndicator, BossSnapshot, IceZone, WaveIndicator } from '@/shared';
import type Phaser from 'phaser';
import { FxController } from '../../fx/FxController';
import type { GameUiSink } from '../ui/GameUiSink';
import { bossRegistry, type BossEntity } from './bossRegistry';

export class BossRuntime {
  private readonly bossEntities = new Map<string, BossEntity>();
  private readonly bossSnapshotsById = new Map<string, BossSnapshot>();

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

  update(delta: number): void {
    for (const entity of this.bossEntities.values()) {
      entity.update(delta);
    }
  }

  reset(): void {
    for (const entity of this.bossEntities.values()) {
      entity.destroy();
    }
    this.bossEntities.clear();
    this.bossSnapshotsById.clear();
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
      if (!entity) {
        entity = bossRegistry[boss.kind].create(this.scene, boss);
        this.bossEntities.set(boss.id, entity);
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
      this.bossEntities.delete(id);
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
}
