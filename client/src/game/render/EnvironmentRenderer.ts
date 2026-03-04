import { INSTANCE_IDS } from '@gelehka/shared';
import type { InstanceId } from '@gelehka/shared';
import { seededRandom } from '@gelehka/shared/utils';
import Phaser from 'phaser';

const CHUNK_SIZE = 512;
const CHUNK_MARGIN = 1;
const DECOR_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19];
const PHASE1_DECOR_PER_CHUNK = 6;
const CUT_GRASS_MIN_PER_CHUNK = 2;
const CUT_GRASS_MAX_PER_CHUNK = 3;
const CUT_GRASS_DEPTH = 0;
const CUT_GRASS_COUNT_SEED = 4000;
const CUT_GRASS_POSITION_SEED = 5000;
const PHASE2_REMAINS_KEYS = [
  'humanoid_remains',
  'pile_of_bones_animal',
  'skull_animal',
  'pirate_remains',
] as const;
const PHASE2_REMAINS_MIN_PER_CHUNK = 5;
const PHASE2_REMAINS_MAX_PER_CHUNK = 10;
const PHASE2_REMAINS_COUNT_SEED = 6000;
const PHASE2_REMAINS_POSITION_SEED = 7000;
const PHASE2_REMAINS_VARIANT_SEED = 8000;

export class EnvironmentRenderer {
  private readonly scene: Phaser.Scene;
  private bgTileSprite!: Phaser.GameObjects.TileSprite;
  private readonly activeChunks: Map<string, Phaser.GameObjects.Sprite[]> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(instanceId: InstanceId | null): void {
    const cam = this.scene.cameras.main;
    this.bgTileSprite = this.scene.add.tileSprite(
      0,
      0,
      cam.width + 256,
      cam.height + 256,
      this.getBackgroundTextureKey(instanceId)
    );
    this.bgTileSprite.setScrollFactor(0, 0);
    this.bgTileSprite.setOrigin(0.5, 0.5);
    this.bgTileSprite.setDepth(-1);
  }

  update(instanceId: InstanceId | null): void {
    const cam = this.scene.cameras.main;
    this.bgTileSprite.x = cam.width / 2;
    this.bgTileSprite.y = cam.height / 2;
    this.bgTileSprite.tilePositionX = cam.scrollX;
    this.bgTileSprite.tilePositionY = cam.scrollY;

    this.updateChunks(instanceId);
  }

  applyInstanceVisualTheme(instanceId: InstanceId): void {
    this.bgTileSprite.setTexture(this.getBackgroundTextureKey(instanceId));
    this.resetChunkDecor();
  }

  destroy(): void {
    this.resetChunkDecor();
    this.bgTileSprite?.destroy();
  }

  private getBackgroundTextureKey(instanceId: InstanceId | null): string {
    if (instanceId === INSTANCE_IDS.PHASE2) return 'stone_floor_bege_tile';
    if (instanceId === INSTANCE_IDS.PHASE3) return 'ice_stone_floor_tile';
    return 'grass_tile';
  }

  private resetChunkDecor(): void {
    for (const sprites of this.activeChunks.values()) {
      for (const sprite of sprites) {
        sprite.destroy();
      }
    }
    this.activeChunks.clear();
  }

  private getChunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private updateChunks(instanceId: InstanceId | null): void {
    const cam = this.scene.cameras.main;
    const camCX = Math.floor((cam.scrollX + cam.width / 2) / CHUNK_SIZE);
    const camCY = Math.floor((cam.scrollY + cam.height / 2) / CHUNK_SIZE);

    const neededChunks = new Set<string>();

    for (let dx = -CHUNK_MARGIN; dx <= CHUNK_MARGIN; dx++) {
      for (let dy = -CHUNK_MARGIN; dy <= CHUNK_MARGIN; dy++) {
        const cx = camCX + dx;
        const cy = camCY + dy;
        const key = this.getChunkKey(cx, cy);
        neededChunks.add(key);

        if (!this.activeChunks.has(key)) {
          this.spawnChunkDecor(cx, cy, key, instanceId);
        }
      }
    }

    for (const [key, sprites] of this.activeChunks) {
      if (!neededChunks.has(key)) {
        for (const s of sprites) s.destroy();
        this.activeChunks.delete(key);
      }
    }
  }

  private spawnChunkDecor(
    cx: number,
    cy: number,
    key: string,
    instanceId: InstanceId | null
  ): void {
    const sprites: Phaser.GameObjects.Sprite[] = [];
    const baseX = cx * CHUNK_SIZE;
    const baseY = cy * CHUNK_SIZE;

    if (instanceId === INSTANCE_IDS.PHASE2) {
      const remainsCountRandom = seededRandom(cx, cy, PHASE2_REMAINS_COUNT_SEED);
      const remainsCountRange = PHASE2_REMAINS_MAX_PER_CHUNK - PHASE2_REMAINS_MIN_PER_CHUNK + 1;
      const remainsCount =
        PHASE2_REMAINS_MIN_PER_CHUNK + Math.floor(remainsCountRandom * remainsCountRange);

      for (let i = 0; i < remainsCount; i++) {
        const rx = seededRandom(cx, cy, PHASE2_REMAINS_POSITION_SEED + i * 2);
        const ry = seededRandom(cx, cy, PHASE2_REMAINS_POSITION_SEED + i * 2 + 1);
        const rv = seededRandom(cx, cy, PHASE2_REMAINS_VARIANT_SEED + i);
        const rs = seededRandom(cx, cy, PHASE2_REMAINS_VARIANT_SEED + 100 + i);
        const ra = seededRandom(cx, cy, PHASE2_REMAINS_VARIANT_SEED + 200 + i);

        const x = baseX + rx * CHUNK_SIZE;
        const y = baseY + ry * CHUNK_SIZE;
        const typeIndex = Math.min(
          PHASE2_REMAINS_KEYS.length - 1,
          Math.floor(rv * PHASE2_REMAINS_KEYS.length)
        );
        const remainsKey = PHASE2_REMAINS_KEYS[typeIndex];

        const sprite = this.scene.add.sprite(x, y, remainsKey);
        sprite.setDepth(1);
        sprite.setAlpha(0.78);
        sprite.setScale(0.8 + rs * 0.35);
        sprite.setAngle((ra - 0.5) * 18);
        sprites.push(sprite);
      }

      this.activeChunks.set(key, sprites);
      return;
    }

    if (instanceId === INSTANCE_IDS.PHASE3) {
      this.activeChunks.set(key, sprites);
      return;
    }

    const count = Math.floor(seededRandom(cx, cy, 999) * PHASE1_DECOR_PER_CHUNK) + 2;

    for (let i = 0; i < count; i++) {
      const rx = seededRandom(cx, cy, i * 3);
      const ry = seededRandom(cx, cy, i * 3 + 1);
      const rf = seededRandom(cx, cy, i * 3 + 2);

      const x = baseX + rx * CHUNK_SIZE;
      const y = baseY + ry * CHUNK_SIZE;
      const frameIdx = Math.floor(rf * DECOR_FRAMES.length);
      const frame = DECOR_FRAMES[frameIdx];

      const sprite = this.scene.add.sprite(x, y, 'decor', frame);
      sprite.setDepth(1);
      sprite.setAlpha(0.8);
      sprites.push(sprite);
    }

    const cutGrassCountRandom = seededRandom(cx, cy, CUT_GRASS_COUNT_SEED);
    const cutGrassCountRange = CUT_GRASS_MAX_PER_CHUNK - CUT_GRASS_MIN_PER_CHUNK + 1;
    const cutGrassCount =
      CUT_GRASS_MIN_PER_CHUNK + Math.floor(cutGrassCountRandom * cutGrassCountRange);

    for (let i = 0; i < cutGrassCount; i++) {
      const rx = seededRandom(cx, cy, CUT_GRASS_POSITION_SEED + i * 2);
      const ry = seededRandom(cx, cy, CUT_GRASS_POSITION_SEED + i * 2 + 1);

      const x = baseX + rx * CHUNK_SIZE;
      const y = baseY + ry * CHUNK_SIZE;

      const sprite = this.scene.add.sprite(x, y, 'cut_grass_tile');
      sprite.setDepth(CUT_GRASS_DEPTH);
      sprites.push(sprite);
    }

    this.activeChunks.set(key, sprites);
  }
}
