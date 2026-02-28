import { distanceSquared } from '../Physics.js';
import { BossGelehk } from '../../entities/BossGelehk.js';
import { Entity } from '../../core/Entity.js';
import { Player } from '../../entities/Player.js';

const BOSS_REGION_SIZE = 2000;
const BOSS_ACTIVE_RANGE = 2000;
const BOSS_DESPAWN_TIME = 60000;

interface BossRegion {
  key: string;
  bossId: string;
  lastPlayerNearby: number;
}

export class BossRegionSystem {
  private readonly bossRegions: Map<string, BossRegion> = new Map();

  update(
    now: number,
    players: Map<string, Player>,
    bosses: Map<string, BossGelehk>,
    addEntity: (entity: Entity) => void,
    removeEntity: (id: string) => void,
    spawnMinions: (x: number, y: number) => void,
    dt: number
  ): void {
    const activeRegionKeys = new Set<string>();

    for (const player of players.values()) {
      if (player.state === 'dead') continue;

      const prx = Math.floor(player.x / BOSS_REGION_SIZE);
      const pry = Math.floor(player.y / BOSS_REGION_SIZE);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const rx = prx + dx;
          const ry = pry + dy;
          const key = `boss_${rx},${ry}`;
          activeRegionKeys.add(key);

          const center = this.getBossRegionCenter(rx, ry);
          const distSq = distanceSquared(player.x, player.y, center.x, center.y);
          if (distSq > BOSS_ACTIVE_RANGE * BOSS_ACTIVE_RANGE) continue;

          let region = this.bossRegions.get(key);
          if (!region) {
            const bossId = `gelehk_${rx}_${ry}`;
            const boss = new BossGelehk(bossId, center.x, center.y);
            bosses.set(bossId, boss);
            addEntity(boss);
            region = { key, bossId, lastPlayerNearby: now };
            this.bossRegions.set(key, region);
          } else {
            region.lastPlayerNearby = now;
          }
        }
      }
    }

    for (const [key, region] of this.bossRegions) {
      if (!activeRegionKeys.has(key) || now - region.lastPlayerNearby > BOSS_DESPAWN_TIME) {
        const boss = bosses.get(region.bossId);
        if (boss && (boss.state === 'idle' || boss.state === 'dead') && !boss.active) {
          bosses.delete(region.bossId);
          removeEntity(region.bossId);
          this.bossRegions.delete(key);
        }
      }
    }

    for (const boss of bosses.values()) {
      boss.update(dt, players, (x, y) => {
        spawnMinions(x, y);
      });
      boss.tryRespawn(dt);
    }
  }

  private getBossRegionCenter(rx: number, ry: number): { x: number; y: number } {
    return {
      x: rx * BOSS_REGION_SIZE + BOSS_REGION_SIZE / 2,
      y: ry * BOSS_REGION_SIZE + BOSS_REGION_SIZE / 2,
    };
  }
}
