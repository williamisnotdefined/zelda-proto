import { nanoid } from 'nanoid';
import { InputMessage, SnapshotMessage } from '../network/MessageTypes.js';
import { Player } from './Player.js';
import { Slime } from './Slime.js';
import { BossGelehk, ICE_ZONE_SLOW, BOSS_RESPAWN_TIME } from './BossGelehk.js';
import { resolvePlayerAttacks, resolvePlayerVsPlayer, resolveEnemyContactDamage } from './Combat.js';
import { distance } from './Physics.js';

export const MAP_WIDTH = 0;
export const MAP_HEIGHT = 0;
const PLAYER_SPAWN_X = 200;
const PLAYER_SPAWN_Y = 200;
const PLAYER_RESPAWN_TIME = 3000;

const CHUNK_SIZE = 512;
const SLIMES_PER_CHUNK = 4;
const CHUNK_ACTIVE_RANGE = 1024;
const CHUNK_DESPAWN_TIME = 30000;

const BOSS_REGION_SIZE = 800;
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

function seededRandom(cx: number, cy: number, index: number): number {
  let h = (cx * 374761393 + cy * 668265263 + index * 1013904223) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  h = (h ^ (h >> 16)) | 0;
  return (h >>> 0) / 4294967296;
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

  addPlayer(id: string): Player {
    const player = new Player(id, PLAYER_SPAWN_X, PLAYER_SPAWN_Y);
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

  update(dt: number): void {
    this.now = Date.now();

    for (const player of this.players.values()) {
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

    for (const slime of this.slimes.values()) {
      slime.update(dt, this.players);
      slime.tryRespawn(dt);
    }

    this.updateBossRegions(dt);

    for (const boss of this.bosses.values()) {
      boss.update(dt, this.players, (x, y, count) => {
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

  private updateBossRegions(dt: number): void {
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
          const dist = distance(player.x, player.y, center.x, center.y);

          if (dist > BOSS_ACTIVE_RANGE) continue;

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
    const count = 3;
    for (let i = 0; i < count; i++) {
      const id = `minion_${nanoid(8)}`;
      const angle = (Math.PI * 2 * i) / count;
      const sx = x + Math.cos(angle) * 60;
      const sy = y + Math.sin(angle) * 60;
      this.slimes.set(id, new Slime(id, sx, sy));
    }
  }

  private handleEnemyDrops(): void {
    for (const slime of this.slimes.values()) {
      if (slime.state === 'dead' && slime.respawnTimer >= 9900) {
        if (Math.random() < 0.5) {
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
    for (const [dropId, drop] of this.drops) {
      for (const player of this.players.values()) {
        if (player.state === 'dead') continue;
        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        if (Math.sqrt(dx * dx + dy * dy) < 24) {
          if (drop.kind === 'heal') {
            player.hp = Math.min(player.hp + 20, player.maxHp);
          }
          this.drops.delete(dropId);
          break;
        }
      }
    }
  }

  getSnapshot(): SnapshotMessage {
    const allIceZones = [];
    const allAoeIndicators = [];

    for (const boss of this.bosses.values()) {
      if (boss.state === 'dead') continue;
      allIceZones.push(...boss.iceZones);
      allAoeIndicators.push(...boss.aoeIndicators.map((a) => ({
        x: Math.round(a.x),
        y: Math.round(a.y),
        radius: a.radius,
        timer: Math.round(a.timer),
      })));
    }

    return {
      type: 'snapshot',
      players: Array.from(this.players.values()).map((p) => p.toSnapshot()),
      enemies: Array.from(this.slimes.values())
        .filter((s) => s.state !== 'dead')
        .map((s) => s.toSnapshot()),
      bosses: Array.from(this.bosses.values()).map((b) => b.toSnapshot()),
      iceZones: allIceZones,
      aoeIndicators: allAoeIndicators,
      drops: Array.from(this.drops.values()),
    };
  }
}
