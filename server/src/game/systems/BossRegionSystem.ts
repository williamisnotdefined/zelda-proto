import { distanceSquared } from '../Physics.js';
import { Entity } from '../../core/Entity.js';
import { Player } from '../../entities/Player.js';

export interface BossActor extends Entity {
  state: string;
  active?: boolean;
  update: (
    dt: number,
    players: Map<string, Player>,
    callback: (...args: unknown[]) => void
  ) => void;
  tryRespawn: (dt: number) => boolean;
}

export interface BossRegionContext {
  dt: number;
  players: Map<string, Player>;
  spawnMinions: (x: number, y: number) => void;
  spawnFireLine: (x: number, y: number, dirX: number, dirY: number) => void;
  safeZone: { x: number; y: number; radius: number };
}

export interface BossRegionSystemConfig<TBoss extends BossActor> {
  regionSize: number;
  activeRange: number;
  despawnTimeMs: number;
  keyPrefix: string;
  bossPrefix: string;
  createBoss: (id: string, x: number, y: number) => TBoss;
  updateBoss: (boss: TBoss, ctx: BossRegionContext) => void;
}

const DEFAULT_CONFIG: BossRegionSystemConfig<BossActor> = {
  regionSize: 2000,
  activeRange: 2000,
  despawnTimeMs: 60000,
  keyPrefix: 'boss',
  bossPrefix: 'boss',
  createBoss: (id, x, y) => {
    throw new Error(`createBoss not provided for ${id} @ ${x},${y}`);
  },
  updateBoss: () => {
    return;
  },
};

interface BossRegion {
  key: string;
  bossId: string;
  lastPlayerNearby: number;
}

export class BossRegionSystem<TBoss extends BossActor> {
  private readonly bossRegions: Map<string, BossRegion> = new Map();
  private readonly config: BossRegionSystemConfig<TBoss>;

  constructor(config: BossRegionSystemConfig<TBoss>) {
    this.config = {
      ...(DEFAULT_CONFIG as BossRegionSystemConfig<BossActor>),
      ...config,
    } as BossRegionSystemConfig<TBoss>;
  }

  update(
    now: number,
    players: Map<string, Player>,
    bosses: Map<string, TBoss>,
    addEntity: (entity: Entity) => void,
    removeEntity: (id: string) => void,
    context: BossRegionContext
  ): void {
    const activeRegionKeys = new Set<string>();

    for (const player of players.values()) {
      if (player.state === 'dead') continue;

      const prx = Math.floor(player.x / this.config.regionSize);
      const pry = Math.floor(player.y / this.config.regionSize);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const rx = prx + dx;
          const ry = pry + dy;
          const key = `${this.config.keyPrefix}_${rx},${ry}`;
          activeRegionKeys.add(key);

          const center = this.getBossRegionCenter(rx, ry);
          const distSq = distanceSquared(player.x, player.y, center.x, center.y);
          if (distSq > this.config.activeRange * this.config.activeRange) continue;

          let region = this.bossRegions.get(key);
          if (!region) {
            const bossId = `${this.config.bossPrefix}_${rx}_${ry}`;
            const boss = this.config.createBoss(bossId, center.x, center.y);
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
      if (!activeRegionKeys.has(key) || now - region.lastPlayerNearby > this.config.despawnTimeMs) {
        const boss = bosses.get(region.bossId);
        const bossInactive = boss && boss.state === 'idle' && !boss.active;
        const bossDead = boss && boss.state === 'dead';
        if (boss && (bossInactive || bossDead)) {
          bosses.delete(region.bossId);
          removeEntity(region.bossId);
          this.bossRegions.delete(key);
        }
      }
    }

    for (const boss of bosses.values()) {
      this.config.updateBoss(boss, context);
      boss.tryRespawn(context.dt);
    }
  }

  private getBossRegionCenter(rx: number, ry: number): { x: number; y: number } {
    return {
      x: rx * this.config.regionSize + this.config.regionSize / 2,
      y: ry * this.config.regionSize + this.config.regionSize / 2,
    };
  }
}
