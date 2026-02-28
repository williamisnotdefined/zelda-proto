import { seededRandom } from '@gelehka/shared/utils';
import { nanoid } from 'nanoid';
import { Entity } from '../../core/Entity.js';
import { Player } from '../../entities/Player.js';
import { Blob } from '../../entities/Blob.js';

const CHUNK_SIZE = 512;
const BLOBS_PER_CHUNK = 4;
const CHUNK_ACTIVE_RANGE = 1024;
const CHUNK_DESPAWN_TIME = 30000;

interface SpawnChunk {
  cx: number;
  cy: number;
  blobIds: Set<string>;
  lastPlayerNearby: number;
}

export class SpawnSystem {
  private readonly spawnChunks: Map<string, SpawnChunk> = new Map();

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
            chunk = { cx, cy, blobIds: new Set(), lastPlayerNearby: now };
            this.spawnChunks.set(key, chunk);
            this.spawnBlobsInChunk(chunk, blobs, addEntity);
          } else {
            chunk.lastPlayerNearby = now;
          }
        }
      }
    }

    for (const [key, chunk] of this.spawnChunks) {
      if (!activeChunkKeys.has(key) && now - chunk.lastPlayerNearby > CHUNK_DESPAWN_TIME) {
        for (const blobId of chunk.blobIds) {
          blobs.delete(blobId);
          removeEntity(blobId);
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
      const id = `minion_${nanoid(8)}`;
      const angle = (Math.PI * 2 * i) / MINION_COUNT;
      const sx = x + Math.cos(angle) * MINION_SPAWN_RADIUS;
      const sy = y + Math.sin(angle) * MINION_SPAWN_RADIUS;
      const minion = new Blob(id, sx, sy);
      blobs.set(id, minion);
      addEntity(minion);
    }
  }

  private spawnBlobsInChunk(
    chunk: SpawnChunk,
    blobs: Map<string, Blob>,
    addEntity: (entity: Entity) => void
  ): void {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseY = chunk.cy * CHUNK_SIZE;

    for (let i = 0; i < BLOBS_PER_CHUNK; i++) {
      const rx = seededRandom(chunk.cx, chunk.cy, i * 2);
      const ry = seededRandom(chunk.cx, chunk.cy, i * 2 + 1);
      const x = baseX + rx * CHUNK_SIZE;
      const y = baseY + ry * CHUNK_SIZE;

      const id = `blob_${nanoid(8)}`;
      const key = `${chunk.cx},${chunk.cy}`;
      const blob = new Blob(id, x, y, key);
      blobs.set(id, blob);
      addEntity(blob);
      chunk.blobIds.add(id);
    }
  }
}
