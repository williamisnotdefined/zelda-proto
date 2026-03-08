import { INSTANCE_IDS, type InstanceId } from '@gelehka/shared';
import { seededRandom } from '@gelehka/shared/utils';

export interface DecorPlacement {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export function getChunkDecor(
  instanceId: InstanceId | null,
  mapWidth: number,
  mapHeight: number
): DecorPlacement[] {
  if (instanceId !== INSTANCE_IDS.PHASE1) {
    return [];
  }

  const placements: DecorPlacement[] = [];
  const chunkSize = 256;
  const maxX = Math.max(1, Math.ceil(mapWidth / chunkSize));
  const maxY = Math.max(1, Math.ceil(mapHeight / chunkSize));

  for (let cx = 0; cx < maxX; cx += 1) {
    for (let cy = 0; cy < maxY; cy += 1) {
      const count = 2 + Math.floor(seededRandom(cx, cy, 999) * 4);
      for (let i = 0; i < count; i += 1) {
        const x = cx * chunkSize + seededRandom(cx, cy, i * 3) * chunkSize;
        const y = cy * chunkSize + seededRandom(cx, cy, i * 3 + 1) * chunkSize;
        placements.push({
          x,
          y,
          rotation: (seededRandom(cx, cy, i * 3 + 2) - 0.5) * 20,
          scale: 0.85 + seededRandom(cx, cy, i * 17 + 4) * 0.45,
        });
      }
    }
  }

  return placements;
}
