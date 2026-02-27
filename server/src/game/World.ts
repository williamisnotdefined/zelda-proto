import { seededRandom } from '@gelehka/shared/utils';
import { nanoid } from 'nanoid';
import {
  AoeIndicator,
  IceZone,
  InputMessage,
  PlayerSnapshot,
  SnapshotMessage,
} from '../network/MessageTypes.js';
import { BossGelehk, ICE_ZONE_SLOW } from './BossGelehk.js';
import {
  resolveEnemyContactDamage,
  resolvePlayerAttacks,
  resolvePlayerVsPlayer,
} from './Combat.js';
import { distanceSquared } from './Physics.js';
import { Player } from './Player.js';
import { Slime } from './Slime.js';

export const PLAYER_SPAWN_X = 200;
export const PLAYER_SPAWN_Y = 200;
export const SPAWN_SAFE_ZONE_RADIUS = 150;
const PLAYER_RESPAWN_TIME = 3000;

const CHUNK_SIZE = 512;
const SLIMES_PER_CHUNK = 4;
const CHUNK_ACTIVE_RANGE = 1024;
const CHUNK_DESPAWN_TIME = 30000;

const BOSS_REGION_SIZE = 2000;
const BOSS_ACTIVE_RANGE = 2000;
const BOSS_DESPAWN_TIME = 60000;

interface SpawnChunk {
  cx: number;
  cy: number;
  slimeIds: Set<string>;
  lastPlayerNearby: number;
}

interface BossRegion {
  key: string;
  bossId: string;
  centerX: number;
  centerY: number;
  lastPlayerNearby: number;
}

export interface Drop {
  id: string;
  x: number;
  y: number;
  kind: 'heal';
}

export class World {
  players: Map<string, Player>;
  slimes: Map<string, Slime>;
  bosses: Map<string, BossGelehk>;
  drops: Map<string, Drop>;

  private spawnChunks: Map<string, SpawnChunk>;
  private bossRegions: Map<string, BossRegion>;
  private now: number;

  constructor() {
    this.players = new Map();
    this.slimes = new Map();
    this.bosses = new Map();
    this.drops = new Map();
    this.spawnChunks = new Map();
    this.bossRegions = new Map();
    this.now = Date.now();
  }

  addPlayer(id: string, nickname: string = 'Player'): Player {
    const player = new Player(id, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, nickname);
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  handleInput(playerId: string, input: InputMessage): void {
    const player = this.players.get(playerId);
    if (player) {
      player.applyInput(input);
    }
  }

  isSpawnSafeZoneActive(): boolean {
    for (const player of this.players.values()) {
      if (player.safeZoneTimer > 0) return true;
    }
    return false;
  }

  update(dt: number): void {
    this.now = Date.now();

    for (const player of this.players.values()) {
      if (player.safeZoneTimer > 0) {
        player.safeZoneTimer -= dt;
      }

      let speedMult = 1;
      for (const boss of this.bosses.values()) {
        if (boss.active && boss.state !== 'dead' && boss.isInIceZone(player.x, player.y)) {
          speedMult = ICE_ZONE_SLOW;
          break;
        }
      }
      player.update(dt, speedMult);
    }

    for (const player of this.players.values()) {
      if (player.state === 'dead') {
        player.respawnTimer += dt;
        if (player.respawnTimer >= PLAYER_RESPAWN_TIME) {
          player.respawn(PLAYER_SPAWN_X, PLAYER_SPAWN_Y);
        }
      }
    }

    this.updateSlimeChunks();

    const spawnSafeZoneActive = this.isSpawnSafeZoneActive();
    for (const slime of this.slimes.values()) {
      slime.update(dt, this.players, spawnSafeZoneActive);
      slime.tryRespawn(dt);
    }

    this.updateBossRegions(dt);

    for (const boss of this.bosses.values()) {
      boss.update(dt, this.players, (x, y, _count) => {
        this.spawnMinions(x, y);
      });
      boss.tryRespawn(dt);
    }

    resolvePlayerAttacks(this.players, this.slimes, this.bosses);
    resolvePlayerVsPlayer(this.players);
    resolveEnemyContactDamage(this.slimes, this.players);

    this.handleDropPickup();
    this.handleEnemyDrops();
  }

  private updateSlimeChunks(): void {
    const activeChunkKeys = new Set<string>();

    for (const player of this.players.values()) {
      if (player.state === 'dead') continue;

      const pcx = Math.floor(player.x / CHUNK_SIZE);
      const pcy = Math.floor(player.y / CHUNK_SIZE);
      const range = Math.ceil(CHUNK_ACTIVE_RANGE / CHUNK_SIZE);

      for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
          const cx = pcx + dx;
          const cy = pcy + dy;
          const key = `${cx},${cy}`;
          activeChunkKeys.add(key);

          let chunk = this.spawnChunks.get(key);
          if (!chunk) {
            chunk = { cx, cy, slimeIds: new Set(), lastPlayerNearby: this.now };
            this.spawnChunks.set(key, chunk);
            this.spawnSlimesInChunk(chunk);
          } else {
            chunk.lastPlayerNearby = this.now;
          }
        }
      }
    }

    for (const [key, chunk] of this.spawnChunks) {
      if (!activeChunkKeys.has(key) && this.now - chunk.lastPlayerNearby > CHUNK_DESPAWN_TIME) {
        for (const slimeId of chunk.slimeIds) {
          this.slimes.delete(slimeId);
        }
        this.spawnChunks.delete(key);
      }
    }
  }

  private spawnSlimesInChunk(chunk: SpawnChunk): void {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseY = chunk.cy * CHUNK_SIZE;

    for (let i = 0; i < SLIMES_PER_CHUNK; i++) {
      const rx = seededRandom(chunk.cx, chunk.cy, i * 2);
      const ry = seededRandom(chunk.cx, chunk.cy, i * 2 + 1);
      const x = baseX + rx * CHUNK_SIZE;
      const y = baseY + ry * CHUNK_SIZE;

      const id = `slime_${nanoid(8)}`;
      const key = `${chunk.cx},${chunk.cy}`;
      const slime = new Slime(id, x, y, key);
      this.slimes.set(id, slime);
      chunk.slimeIds.add(id);
    }
  }

  private getBossRegionCenter(rx: number, ry: number): { x: number; y: number } {
    return {
      x: rx * BOSS_REGION_SIZE + BOSS_REGION_SIZE / 2,
      y: ry * BOSS_REGION_SIZE + BOSS_REGION_SIZE / 2,
    };
  }

  private updateBossRegions(_dt: number): void {
    const activeRegionKeys = new Set<string>();

    for (const player of this.players.values()) {
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
            this.bosses.set(bossId, boss);
            region = {
              key,
              bossId,
              centerX: center.x,
              centerY: center.y,
              lastPlayerNearby: this.now,
            };
            this.bossRegions.set(key, region);
          } else {
            region.lastPlayerNearby = this.now;
          }
        }
      }
    }

    for (const [key, region] of this.bossRegions) {
      if (!activeRegionKeys.has(key) || this.now - region.lastPlayerNearby > BOSS_DESPAWN_TIME) {
        const boss = this.bosses.get(region.bossId);
        if (boss && (boss.state === 'idle' || boss.state === 'dead') && !boss.active) {
          this.bosses.delete(region.bossId);
          this.bossRegions.delete(key);
        }
      }
    }
  }

  private spawnMinions(x: number, y: number): void {
    const MINION_COUNT = 3;
    const MINION_SPAWN_RADIUS = 60;
    for (let i = 0; i < MINION_COUNT; i++) {
      const id = `minion_${nanoid(8)}`;
      const angle = (Math.PI * 2 * i) / MINION_COUNT;
      const sx = x + Math.cos(angle) * MINION_SPAWN_RADIUS;
      const sy = y + Math.sin(angle) * MINION_SPAWN_RADIUS;
      this.slimes.set(id, new Slime(id, sx, sy));
    }
  }

  private handleEnemyDrops(): void {
    const DROP_CHANCE = 0.5;
    for (const slime of this.slimes.values()) {
      if (slime.state === 'dead' && !slime.hasDropped) {
        slime.hasDropped = true;
        if (Math.random() < DROP_CHANCE) {
          const dropId = `drop_${nanoid(8)}`;
          this.drops.set(dropId, {
            id: dropId,
            x: slime.x,
            y: slime.y,
            kind: 'heal',
          });
        }
      }
    }
  }

  private handleDropPickup(): void {
    const PICKUP_RADIUS = 24;
    const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
    const HEAL_AMOUNT = 5;
    for (const [dropId, drop] of this.drops) {
      for (const player of this.players.values()) {
        if (player.state === 'dead') continue;
        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        if (dx * dx + dy * dy < PICKUP_RADIUS_SQ) {
          if (drop.kind === 'heal') {
            player.hp = Math.min(player.hp + HEAL_AMOUNT, player.maxHp);
          }
          this.drops.delete(dropId);
          break;
        }
      }
    }
  }

  private cachedPlayerSnapshots: PlayerSnapshot[] | null = null;

  /**
   * Pre-computes player snapshots once per tick so they can be reused
   * across all per-player snapshot calls.
   */
  cachePlayerSnapshots(): void {
    const snapshots: PlayerSnapshot[] = [];
    for (const p of this.players.values()) {
      snapshots.push(p.toSnapshot());
    }
    this.cachedPlayerSnapshots = snapshots;
  }

  private getPlayerSnapshots(): PlayerSnapshot[] {
    if (this.cachedPlayerSnapshots) return this.cachedPlayerSnapshots;
    const snapshots: PlayerSnapshot[] = [];
    for (const p of this.players.values()) {
      snapshots.push(p.toSnapshot());
    }
    return snapshots;
  }

  private collectBossEffects(
    filterFn?: (bx: number, by: number) => boolean
  ): { iceZones: IceZone[]; aoeIndicators: AoeIndicator[] } {
    const iceZones: IceZone[] = [];
    const aoeIndicators: AoeIndicator[] = [];

    for (const boss of this.bosses.values()) {
      if (boss.state === 'dead') continue;
      if (filterFn && !filterFn(boss.x, boss.y)) continue;
      for (const zone of boss.iceZones) iceZones.push(zone);
      for (const a of boss.aoeIndicators) {
        aoeIndicators.push({
          x: Math.round(a.x),
          y: Math.round(a.y),
          radius: a.radius,
          timer: Math.round(a.timer),
        });
      }
    }

    return { iceZones, aoeIndicators };
  }

  getSnapshot(): SnapshotMessage {
    const { iceZones, aoeIndicators } = this.collectBossEffects();

    const enemies = [];
    for (const s of this.slimes.values()) {
      if (s.state !== 'dead') enemies.push(s.toSnapshot());
    }

    const bosses = [];
    for (const b of this.bosses.values()) {
      bosses.push(b.toSnapshot());
    }

    const drops = [];
    for (const d of this.drops.values()) {
      drops.push(d);
    }

    return {
      type: 'snapshot',
      players: this.getPlayerSnapshots(),
      enemies,
      bosses,
      iceZones,
      aoeIndicators,
      drops,
    };
  }

  /**
   * Returns a snapshot filtered to entities within VIEW_RADIUS of the given player.
   * All players are always included (needed for the leaderboard).
   * Falls back to full snapshot if the player id is not found (e.g. pre-join).
   */
  getSnapshotForPlayer(playerId: string): SnapshotMessage {
    const viewer = this.players.get(playerId);
    if (!viewer) return this.getSnapshot();

    const VIEW_RADIUS_SQ = 2000 * 2000;
    const vx = viewer.x;
    const vy = viewer.y;

    const inRange = (ex: number, ey: number) => {
      const dx = ex - vx;
      const dy = ey - vy;
      return dx * dx + dy * dy <= VIEW_RADIUS_SQ;
    };

    const { iceZones, aoeIndicators } = this.collectBossEffects(inRange);

    const enemies = [];
    for (const s of this.slimes.values()) {
      if (s.state !== 'dead' && inRange(s.x, s.y)) enemies.push(s.toSnapshot());
    }

    const bosses = [];
    for (const b of this.bosses.values()) {
      if (inRange(b.x, b.y)) bosses.push(b.toSnapshot());
    }

    const drops = [];
    for (const d of this.drops.values()) {
      if (inRange(d.x, d.y)) drops.push(d);
    }

    return {
      type: 'snapshot',
      players: this.getPlayerSnapshots(),
      enemies,
      bosses,
      iceZones,
      aoeIndicators,
      drops,
    };
  }
}
