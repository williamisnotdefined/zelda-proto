import type { AoeIndicator, BossSnapshot, BossWaveIndicator, IceZone } from '@gelehka/shared';
import Phaser from 'phaser';
import { bossRegistry, type BossEntity } from './bossRegistry';
import type { GameUiSink } from '../ui/GameUiSink';

export class BossRuntime {
  private readonly bossEntities = new Map<string, BossEntity>();
  private readonly bossSnapshotsById = new Map<string, BossSnapshot>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ui: GameUiSink
  ) {}

  syncSnapshots(
    bosses: BossSnapshot[],
    iceZones: IceZone[],
    aoeIndicators: AoeIndicator[],
    waveIndicators: BossWaveIndicator[],
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
    waveIndicators: BossWaveIndicator[],
    localPlayer: { x: number; y: number } | null
  ): void {
    const seenBossIds = new Set<string>();
    let nearestBoss: BossSnapshot | null = null;
    let nearestBossDist = Infinity;

    for (const boss of this.bossSnapshotsById.values()) {
      seenBossIds.add(boss.id);
      let entity = this.bossEntities.get(boss.id);
      if (!entity) {
        entity = bossRegistry[boss.kind].create(this.scene, boss);
        this.bossEntities.set(boss.id, entity);
      }
    }

    for (const boss of this.bossSnapshotsById.values()) {
      const entity = this.bossEntities.get(boss.id);
      if (!entity) {
        continue;
      }

      bossRegistry[boss.kind].update(entity, boss, {
        iceZones,
        aoeIndicators,
        waveIndicators,
      });

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
