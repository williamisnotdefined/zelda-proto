import { seededRandom } from '@gelehka/shared/utils';
import { nanoid } from 'nanoid';
import { Entity } from '../../core/Entity.js';
import { Player } from '../../entities/Player.js';
import { Blob } from '../../entities/Blob.js';

export interface SpawnSystemConfig {
  chunkSize: number;
  enemiesPerChunk: number;
  activeRange: number;
  despawnTimeMs: number;
  enemyPrefix: string;
  createEnemy: (id: string, x: number, y: number, chunkKey: string) => Blob;
}

const DEFAULT_CONFIG: SpawnSystemConfig = {
  chunkSize: 512,
  enemiesPerChunk: 4,
  activeRange: 1024,
  despawnTimeMs: 30000,
  enemyPrefix: 'blob',
  createEnemy: (id, x, y, chunkKey) => new Blob(id, x, y, chunkKey),
};

interface SpawnChunk {
  cx: number;
  cy: number;
  enemyIds: Set<string>;
  lastPlayerNearby: number;
}

export class SpawnSystem {
  private readonly spawnChunks: Map<string, SpawnChunk> = new Map();
  private readonly config: SpawnSystemConfig;

  constructor(config: Partial<SpawnSystemConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  update(
    now: number,
    players: Map<string, Player>,
    blobs: Map<string, Blob>,
    addEntity: (entity: Entity) => void,
    removeEntity: (id: string) => void
  ): void {
    const activeChunkKeys = new Set<string>();

    for (const player of players.values()) {
      if (player.state === 'dead') continue;

      const pcx = Math.floor(player.x / this.config.chunkSize);
      const pcy = Math.floor(player.y / this.config.chunkSize);
      const range = Math.ceil(this.config.activeRange / this.config.chunkSize);

      for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
          const cx = pcx + dx;
          const cy = pcy + dy;
          const key = `${cx},${cy}`;
          activeChunkKeys.add(key);

          let chunk = this.spawnChunks.get(key);
          if (!chunk) {
            chunk = { cx, cy, enemyIds: new Set(), lastPlayerNearby: now };
            this.spawnChunks.set(key, chunk);
            this.spawnBlobsInChunk(chunk, blobs, addEntity);
          } else {
            chunk.lastPlayerNearby = now;
          }
        }
      }
    }

    for (const [key, chunk] of this.spawnChunks) {
      if (!activeChunkKeys.has(key) && now - chunk.lastPlayerNearby > this.config.despawnTimeMs) {
        for (const enemyId of chunk.enemyIds) {
          blobs.delete(enemyId);
          removeEntity(enemyId);
        }
        this.spawnChunks.delete(key);
      }
    }
  }

  spawnMinions(
    x: number,
    y: number,
    blobs: Map<string, Blob>,
    addEntity: (entity: Entity) => void
  ): void {
    const MINION_COUNT = 3;
    const MINION_SPAWN_RADIUS = 60;

    for (let i = 0; i < MINION_COUNT; i++) {
      const id = `${this.config.enemyPrefix}_minion_${nanoid(8)}`;
      const angle = (Math.PI * 2 * i) / MINION_COUNT;
      const sx = x + Math.cos(angle) * MINION_SPAWN_RADIUS;
      const sy = y + Math.sin(angle) * MINION_SPAWN_RADIUS;
      const minion = this.config.createEnemy(id, sx, sy, 'minion');
      blobs.set(id, minion);
      addEntity(minion);
    }
  }

  private spawnBlobsInChunk(
    chunk: SpawnChunk,
    blobs: Map<string, Blob>,
    addEntity: (entity: Entity) => void
  ): void {
    const baseX = chunk.cx * this.config.chunkSize;
    const baseY = chunk.cy * this.config.chunkSize;

    for (let i = 0; i < this.config.enemiesPerChunk; i++) {
      const rx = seededRandom(chunk.cx, chunk.cy, i * 2);
      const ry = seededRandom(chunk.cx, chunk.cy, i * 2 + 1);
      const x = baseX + rx * this.config.chunkSize;
      const y = baseY + ry * this.config.chunkSize;

      const id = `${this.config.enemyPrefix}_${nanoid(8)}`;
      const key = `${chunk.cx},${chunk.cy}`;
      const blob = this.config.createEnemy(id, x, y, key);
      blobs.set(id, blob);
      addEntity(blob);
      chunk.enemyIds.add(id);
    }
  }
}
