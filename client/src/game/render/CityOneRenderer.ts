import type { InstanceId } from '@/shared';
import { INSTANCE_IDS } from '@/shared';
import Phaser from 'phaser';
import { CITY_ONE_CENTER_X, CITY_ONE_CENTER_Y, CITY_ONE_SAFE_ZONE_RADIUS } from './cityOneConfig';

const SCALE = 2;
const TILE = 16 * SCALE;
const GROUND_DEPTH = -0.85;
const GROUND_DETAIL_DEPTH = -0.82;
const PATH_DEPTH = -0.75;
const WATER_DEPTH = -0.7;
const WATER_SHORE_DEPTH = -0.58;
const WATER_EDGE_DEPTH = -0.55;
const PROP_DEPTH = 2;
const TREE_DEPTH = 3;
const SAFE_ZONE_RING_DEPTH = 30;

const GRASS_TILES = ['city_tile_grass_0', 'city_tile_grass_1'] as const;
const GRASS_DETAIL_TILES = [
  'city_tile_grass_flower',
  'city_tile_grass_blades_0',
  'city_tile_grass_blades_1',
  'city_tile_grass_sprout',
] as const;
const DIRT_BASE_TILES = ['city_tile_dirt_base'] as const;
const DIRT_DETAIL_TILES = [
  'city_tile_dirt_detail_0',
  'city_tile_dirt_detail_1',
  'city_tile_dirt_detail_2',
  'city_tile_dirt_detail_3',
] as const;
const PATH_GRASS_ABOVE_TILES = [
  'city_tile_path_grass_above_0',
  'city_tile_path_grass_above_1',
  'city_tile_path_grass_above_2',
] as const;
const PATH_GRASS_BELOW_TILES = [
  'city_tile_path_grass_below_0',
  'city_tile_path_grass_below_1',
  'city_tile_path_grass_below_2',
] as const;
const PATH_GRASS_LEFT_TILES = [
  'city_tile_path_grass_left_0',
  'city_tile_path_grass_left_1',
  'city_tile_path_grass_left_2',
] as const;
const PATH_GRASS_RIGHT_TILES = [
  'city_tile_path_grass_right_0',
  'city_tile_path_grass_right_1',
  'city_tile_path_grass_right_2',
] as const;
const WATER_TILES = ['city_tile_water_0', 'city_tile_water_1', 'city_tile_water_2'] as const;
const WATER_SHORE_WATER_BELOW_TILES = [
  'city_tile_water_shore_water_below_0',
  'city_tile_water_shore_water_below_1',
  'city_tile_water_shore_water_below_2',
] as const;
const WATER_SHORE_WATER_ABOVE_TILES = [
  'city_tile_water_shore_water_above_0',
  'city_tile_water_shore_water_above_1',
  'city_tile_water_shore_water_above_2',
] as const;
const WATER_SHORE_WATER_LEFT_TILES = [
  'city_tile_water_shore_water_left_0',
  'city_tile_water_shore_water_left_1',
  'city_tile_water_shore_water_left_2',
] as const;
const WATER_SHORE_WATER_RIGHT_TILES = [
  'city_tile_water_shore_water_right_0',
  'city_tile_water_shore_water_right_1',
  'city_tile_water_shore_water_right_2',
] as const;
const WATER_SHORE_WATER_UP_LEFT_TILE = 'city_tile_water_shore_water_up_left';
const WATER_SHORE_WATER_UP_RIGHT_TILE = 'city_tile_water_shore_water_up_right';
const WATER_SHORE_WATER_DOWN_LEFT_TILE = 'city_tile_water_shore_water_down_left';
const WATER_SHORE_WATER_DOWN_RIGHT_TILE = 'city_tile_water_shore_water_down_right';
const WATER_SHORE_WATER_LEFT_RIGHT_TILE = 'city_tile_water_shore_water_left_right';
const WATER_SHORE_WATER_UP_DOWN_TILE = 'city_tile_water_shore_water_up_down';
const WATER_WAVE_ANIMS = {
  front: 'city_wave_front_loop',
  left: 'city_wave_left_loop',
  right: 'city_wave_right_loop',
  leftCorner: 'city_wave_left_corner_loop',
  rightCorner: 'city_wave_right_corner_loop',
  leftBackCorner: 'city_wave_left_backcorner_loop',
  rightBackCorner: 'city_wave_right_backcorner_loop',
  frontLeftIntersection: 'city_wave_front_left_corner_intersection_loop',
  frontRightIntersection: 'city_wave_front_right_corner_intersection_loop',
} as const;

type GameObject = Phaser.GameObjects.GameObject & { setVisible?: (visible: boolean) => GameObject };

type PropDef = {
  key: string;
  x: number;
  y: number;
  scale?: number;
  depth?: number;
  flipX?: boolean;
  angle?: number;
};

const TREE_PROPS: PropDef[] = [
  { key: 'city_tree3', x: -290, y: -210 },
  { key: 'city_tree2', x: -135, y: -265 },
  { key: 'city_tree1', x: 60, y: -292 },
  { key: 'city_tree2', x: 310, y: -255 },
  { key: 'city_tree3', x: 510, y: -130 },
  { key: 'city_tree1', x: 560, y: 135 },
  { key: 'city_tree2', x: 500, y: 420 },
  { key: 'city_tree3', x: 240, y: 530 },
  { key: 'city_tree1', x: -70, y: 515 },
  { key: 'city_tree2', x: -335, y: 395 },
  { key: 'city_tree3', x: -395, y: 85 },
  { key: 'city_tree1', x: -360, y: -95 },
];

const PROP_CLUSTERS: PropDef[] = [
  { key: 'city_crate2', x: -100, y: -188 },
  { key: 'city_crate1', x: -72, y: -220 },
  { key: 'city_barrel1', x: -36, y: -190 },
  { key: 'city_crate3', x: 84, y: -188 },
  { key: 'city_crate1', x: 122, y: -220 },
  { key: 'city_barrel2', x: 158, y: -190 },
  { key: 'city_crate4', x: 360, y: -50 },
  { key: 'city_crate2', x: 396, y: -22 },
  { key: 'city_barrel1', x: 438, y: -34 },
  { key: 'city_chest', x: 405, y: 72 },
  { key: 'city_crate1', x: 460, y: 104 },
  { key: 'city_barrel2', x: 344, y: 118 },
  { key: 'city_small_chest', x: 24, y: 354, scale: 2.2 },
  { key: 'city_barrel1', x: -24, y: 360 },
  { key: 'city_crate3', x: 76, y: 382 },
  { key: 'city_crate1', x: -216, y: -90 },
  { key: 'city_barrel2', x: -258, y: -56 },
  { key: 'city_crate4', x: -208, y: -42 },
  { key: 'city_chest', x: -224, y: 420 },
  { key: 'city_barrel1', x: -172, y: 422 },
];

const ROCK_PROPS: PropDef[] = [
  { key: 'city_boulder1', x: -270, y: -170 },
  { key: 'city_boulder3', x: 228, y: -238 },
  { key: 'city_boulder4', x: 468, y: -192 },
  { key: 'city_boulder2', x: 520, y: 28 },
  { key: 'city_boulder1', x: 452, y: 330 },
  { key: 'city_boulder3', x: -122, y: 442 },
  { key: 'city_boulder4', x: -338, y: 280 },
  { key: 'city_smallrock1', x: -50, y: -120 },
  { key: 'city_smallrock2', x: 220, y: -110 },
  { key: 'city_smallrock1', x: 298, y: 12 },
  { key: 'city_smallrock2', x: 162, y: 420 },
  { key: 'city_smallrock1', x: -300, y: 142 },
  { key: 'city_smallrock2', x: 562, y: 260 },
];

export class CityOneRenderer {
  private readonly scene: Phaser.Scene;
  private readonly objects: GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(instanceId: InstanceId | null): void {
    this.destroy();
    this.createGround();
    this.createPaths();
    this.createWaterGarden();
    this.createFences();
    this.createProps();
    this.createSafeZoneBoundary();
    this.setVisible(this.shouldShow(instanceId));
  }

  applyInstance(instanceId: InstanceId | null): void {
    this.setVisible(this.shouldShow(instanceId));
  }

  destroy(): void {
    for (const object of this.objects) {
      object.destroy();
    }
    this.objects.length = 0;
  }

  private shouldShow(instanceId: InstanceId | null): boolean {
    return instanceId === null || instanceId === INSTANCE_IDS.PHASE1;
  }

  private setVisible(visible: boolean): void {
    for (const object of this.objects) {
      object.setVisible?.(visible);
    }
  }

  private createGround(): void {
    for (let gy = -21; gy <= 22; gy += 1) {
      for (let gx = -25; gx <= 25; gx += 1) {
        this.addTile(this.pick(GRASS_TILES, gx, gy, 1), gx, gy, GROUND_DEPTH);

        const detailRoll = this.noise(gx, gy, 2);
        if (detailRoll < 0.18) {
          this.addTile(this.pick(GRASS_DETAIL_TILES, gx, gy, 3), gx, gy, GROUND_DETAIL_DEPTH);
        }
      }
    }
  }

  private createWaterGarden(): void {
    const waterCells = new Set<string>();
    this.addRectCells(waterCells, -16, -7, 1, 10);
    this.addRectCells(waterCells, -10, -4, 5, 12);
    this.addRectCells(waterCells, -13, -5, 8, 12);
    for (let gy = 5; gy <= 12; gy += 1) {
      waterCells.delete(this.cellKey(-4, gy));
    }
    for (let gy = 5; gy <= 12; gy += 1) {
      waterCells.delete(this.cellKey(-5, gy));
    }

    for (const cell of waterCells) {
      const [gx, gy] = this.parseCellKey(cell);
      this.addTile(this.pick(WATER_TILES, gx, gy, 19), gx, gy, WATER_DEPTH);
    }

    this.addWaterShore(waterCells);
    this.addWaterWaves(waterCells);

    this.addImage('city_bridge_horizontal', -236, 226, WATER_EDGE_DEPTH + 0.1, SCALE);
  }

  private addWaterShore(waterCells: Set<string>): void {
    const shoreCells = new Set<string>();
    const neighborOffsets: Array<[number, number]> = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];

    for (const cell of waterCells) {
      const [gx, gy] = this.parseCellKey(cell);
      for (const [dx, dy] of neighborOffsets) {
        const shoreKey = this.cellKey(gx + dx, gy + dy);
        if (!waterCells.has(shoreKey)) {
          shoreCells.add(shoreKey);
        }
      }
    }

    for (const cell of shoreCells) {
      const [gx, gy] = this.parseCellKey(cell);
      const tileKey = this.pickWaterShoreTile(waterCells, gx, gy);
      if (tileKey) {
        this.addTile(tileKey, gx, gy, WATER_SHORE_DEPTH);
      }
    }
  }

  private pickWaterShoreTile(waterCells: Set<string>, gx: number, gy: number): string | null {
    const waterUp = waterCells.has(this.cellKey(gx, gy - 1));
    const waterDown = waterCells.has(this.cellKey(gx, gy + 1));
    const waterLeft = waterCells.has(this.cellKey(gx - 1, gy));
    const waterRight = waterCells.has(this.cellKey(gx + 1, gy));

    if (waterUp && waterLeft && !waterDown && !waterRight) {
      return WATER_SHORE_WATER_UP_LEFT_TILE;
    }
    if (waterUp && waterRight && !waterDown && !waterLeft) {
      return WATER_SHORE_WATER_UP_RIGHT_TILE;
    }
    if (waterDown && waterLeft && !waterUp && !waterRight) {
      return WATER_SHORE_WATER_DOWN_LEFT_TILE;
    }
    if (waterDown && waterRight && !waterUp && !waterLeft) {
      return WATER_SHORE_WATER_DOWN_RIGHT_TILE;
    }
    if (waterLeft && waterRight && !waterUp && !waterDown) {
      return WATER_SHORE_WATER_LEFT_RIGHT_TILE;
    }
    if (waterUp && waterDown && !waterLeft && !waterRight) {
      return WATER_SHORE_WATER_UP_DOWN_TILE;
    }
    if (waterDown) {
      return this.pick(WATER_SHORE_WATER_BELOW_TILES, gx, gy, 26);
    }
    if (waterUp) {
      return this.pick(WATER_SHORE_WATER_ABOVE_TILES, gx, gy, 27);
    }
    if (waterLeft) {
      return this.pick(WATER_SHORE_WATER_LEFT_TILES, gx, gy, 28);
    }
    if (waterRight) {
      return this.pick(WATER_SHORE_WATER_RIGHT_TILES, gx, gy, 29);
    }

    return null;
  }

  private addWaterWaves(waterCells: Set<string>): void {
    for (const cell of waterCells) {
      const [gx, gy] = this.parseCellKey(cell);
      const topOpen = !waterCells.has(this.cellKey(gx, gy - 1));
      const bottomOpen = !waterCells.has(this.cellKey(gx, gy + 1));
      const leftOpen = !waterCells.has(this.cellKey(gx - 1, gy));
      const rightOpen = !waterCells.has(this.cellKey(gx + 1, gy));

      let bottomCovered = false;
      let leftCovered = false;
      let rightCovered = false;

      if (bottomOpen && leftOpen && !rightOpen) {
        this.addAnimatedTile(WATER_WAVE_ANIMS.leftCorner, gx, gy, WATER_EDGE_DEPTH);
        bottomCovered = true;
        leftCovered = true;
      }
      if (bottomOpen && rightOpen && !leftOpen) {
        this.addAnimatedTile(WATER_WAVE_ANIMS.rightCorner, gx, gy, WATER_EDGE_DEPTH);
        bottomCovered = true;
        rightCovered = true;
      }
      if (topOpen && leftOpen && !rightOpen) {
        this.addAnimatedTile(WATER_WAVE_ANIMS.leftBackCorner, gx, gy, WATER_EDGE_DEPTH);
        leftCovered = true;
      }
      if (topOpen && rightOpen && !leftOpen) {
        this.addAnimatedTile(WATER_WAVE_ANIMS.rightBackCorner, gx, gy, WATER_EDGE_DEPTH);
        rightCovered = true;
      }

      if (bottomOpen && !bottomCovered) {
        this.addAnimatedTile(WATER_WAVE_ANIMS.front, gx, gy, WATER_EDGE_DEPTH);
      }
      if (leftOpen && !leftCovered) {
        this.addAnimatedTile(WATER_WAVE_ANIMS.left, gx, gy, WATER_EDGE_DEPTH);
      }
      if (rightOpen && !rightCovered) {
        this.addAnimatedTile(WATER_WAVE_ANIMS.right, gx, gy, WATER_EDGE_DEPTH);
      }

      if (!bottomOpen && !leftOpen && !waterCells.has(this.cellKey(gx - 1, gy + 1))) {
        this.addAnimatedTile(WATER_WAVE_ANIMS.frontLeftIntersection, gx, gy, WATER_EDGE_DEPTH);
      }
      if (!bottomOpen && !rightOpen && !waterCells.has(this.cellKey(gx + 1, gy + 1))) {
        this.addAnimatedTile(WATER_WAVE_ANIMS.frontRightIntersection, gx, gy, WATER_EDGE_DEPTH);
      }
    }
  }

  private createSafeZoneBoundary(): void {
    const ring = this.scene.add.circle(
      CITY_ONE_CENTER_X,
      CITY_ONE_CENTER_Y,
      CITY_ONE_SAFE_ZONE_RADIUS
    );
    ring.setStrokeStyle(5, 0x65ff65, 0.75);
    ring.setDepth(SAFE_ZONE_RING_DEPTH);
    ring.setScrollFactor(1, 1);
    this.objects.push(ring);
  }

  private createPaths(): void {
    const pathCells = this.buildPathCells();
    this.paintPathCells(pathCells, PATH_DEPTH);

    const patches = [
      this.makePatchCells(-11, -2, 1),
      this.makePatchCells(12, -7, 1),
      this.makePatchCells(12, 7, 1),
      this.makePatchCells(-9, 12, 1),
    ];
    for (const patchCells of patches) {
      this.paintPathCells(patchCells, PATH_DEPTH - 0.01);
    }
  }

  private createFences(): void {
    this.addFenceLine(-292, 416, -260, true, [-36, 132]);
    this.addFenceLine(-292, 416, 500, true, [-36, 132]);
    this.addFenceLine(-292, 500, -212, false, [130, 226]);
    this.addFenceLine(548, 500, -212, false, [130, 258]);
    this.addFenceLine(-180, 112, -228, true);
    this.addFenceLine(260, 232, 112, true);
    this.addFenceLine(260, 328, 112, true);
    this.addFenceLine(260, 424, 112, true);
  }

  private createProps(): void {
    for (const prop of TREE_PROPS) {
      this.addImage(
        prop.key,
        prop.x,
        prop.y,
        TREE_DEPTH,
        prop.scale ?? SCALE,
        prop.flipX,
        prop.angle
      );
    }
    for (const prop of ROCK_PROPS) {
      this.addImage(
        prop.key,
        prop.x,
        prop.y,
        prop.depth ?? PROP_DEPTH,
        prop.scale ?? SCALE,
        prop.flipX,
        prop.angle
      );
    }
    for (const prop of PROP_CLUSTERS) {
      this.addImage(
        prop.key,
        prop.x,
        prop.y,
        prop.depth ?? PROP_DEPTH,
        prop.scale ?? SCALE,
        prop.flipX,
        prop.angle
      );
    }

    const fire = this.scene.add.sprite(
      CITY_ONE_CENTER_X - 30,
      CITY_ONE_CENTER_Y + 285,
      'city_campfire_burning'
    );
    fire.setScale(SCALE);
    fire.setDepth(PROP_DEPTH + 0.2);
    fire.play('city_campfire_burning_loop');
    this.objects.push(fire);
  }

  private addFenceLine(
    startX: number,
    endX: number,
    y: number,
    horizontal: boolean,
    gap?: [number, number]
  ): void {
    const min = horizontal ? Math.min(startX, endX) : Math.min(y, endX);
    const max = horizontal ? Math.max(startX, endX) : Math.max(y, endX);
    for (let pos = min; pos <= max; pos += TILE) {
      if (gap && pos >= gap[0] && pos <= gap[1]) {
        continue;
      }
      this.addImage(
        horizontal ? 'city_fence_front' : 'city_fence_side',
        horizontal ? pos : startX,
        horizontal ? y : pos,
        PROP_DEPTH,
        SCALE
      );
    }
  }

  private buildPathCells(): Set<string> {
    const cells = new Set<string>();

    this.addRectCells(cells, -3, 3, -14, -4);
    this.addRectCells(cells, -5, 5, -3, 4);
    this.addRectCells(cells, 6, 23, -2, 2);
    this.addRectCells(cells, -2, 2, 5, 19);
    this.addRectCells(cells, -13, -5, 6, 8);
    this.addRectCells(cells, -3, 1, 8, 11);

    const organicAdds: Array<[number, number]> = [
      [-4, -13],
      [4, -12],
      [-4, -7],
      [4, -5],
      [-6, -2],
      [-6, 2],
      [6, -3],
      [6, 3],
      [10, -3],
      [15, 3],
      [20, -3],
      [-3, 13],
      [3, 15],
      [-3, 18],
      [-14, 7],
      [-12, 9],
      [-6, 5],
    ];
    for (const [gx, gy] of organicAdds) {
      cells.add(this.cellKey(gx, gy));
    }

    const organicRemoves: Array<[number, number]> = [
      [-5, -3],
      [5, 4],
      [23, 2],
      [-2, 19],
      [2, 19],
      [-13, 6],
    ];
    for (const [gx, gy] of organicRemoves) {
      cells.delete(this.cellKey(gx, gy));
    }

    return cells;
  }

  private makePatchCells(centerGx: number, centerGy: number, radius: number): Set<string> {
    const cells = new Set<string>();
    for (let gy = centerGy - radius; gy <= centerGy + radius; gy += 1) {
      for (let gx = centerGx - radius; gx <= centerGx + radius; gx += 1) {
        if (Math.abs(gx - centerGx) + Math.abs(gy - centerGy) <= radius + 1) {
          cells.add(this.cellKey(gx, gy));
        }
      }
    }
    return cells;
  }

  private paintPathCells(cells: Set<string>, depth: number): void {
    const edgeCells = new Set<string>();

    for (const cell of cells) {
      const [gx, gy] = this.parseCellKey(cell);
      const tileKey =
        this.noise(gx, gy, 7) < 0.18
          ? this.pick(DIRT_DETAIL_TILES, gx, gy, 12)
          : this.pick(DIRT_BASE_TILES, gx, gy, 7);
      this.addTile(tileKey, gx, gy, depth);
    }

    for (const cell of cells) {
      const [gx, gy] = this.parseCellKey(cell);
      if (!cells.has(this.cellKey(gx, gy - 1))) {
        this.paintPathEdge(
          edgeCells,
          gx,
          gy - 1,
          this.pick(PATH_GRASS_ABOVE_TILES, gx, gy, 8),
          depth + 0.01
        );
      }
      if (!cells.has(this.cellKey(gx, gy + 1))) {
        this.paintPathEdge(
          edgeCells,
          gx,
          gy + 1,
          this.pick(PATH_GRASS_BELOW_TILES, gx, gy, 9),
          depth + 0.01
        );
      }
      if (!cells.has(this.cellKey(gx - 1, gy))) {
        this.paintPathEdge(
          edgeCells,
          gx - 1,
          gy,
          this.pick(PATH_GRASS_LEFT_TILES, gx, gy, 10),
          depth + 0.01
        );
      }
      if (!cells.has(this.cellKey(gx + 1, gy))) {
        this.paintPathEdge(
          edgeCells,
          gx + 1,
          gy,
          this.pick(PATH_GRASS_RIGHT_TILES, gx, gy, 11),
          depth + 0.01
        );
      }
    }
  }

  private paintPathEdge(
    edgeCells: Set<string>,
    gx: number,
    gy: number,
    tileKey: string,
    depth: number
  ): void {
    const key = this.cellKey(gx, gy);
    if (edgeCells.has(key)) {
      return;
    }
    edgeCells.add(key);
    this.addTile(tileKey, gx, gy, depth);
  }

  private addRectCells(
    cells: Set<string>,
    minGx: number,
    maxGx: number,
    minGy: number,
    maxGy: number
  ): void {
    for (let gy = minGy; gy <= maxGy; gy += 1) {
      for (let gx = minGx; gx <= maxGx; gx += 1) {
        cells.add(this.cellKey(gx, gy));
      }
    }
  }

  private addTile(key: string, gx: number, gy: number, depth: number): Phaser.GameObjects.Image {
    const image = this.scene.add.image(
      CITY_ONE_CENTER_X + gx * TILE,
      CITY_ONE_CENTER_Y + gy * TILE,
      key
    );
    image.setScale(SCALE);
    image.setDepth(depth);
    this.objects.push(image);
    return image;
  }

  private addAnimatedTile(
    animationKey: string,
    gx: number,
    gy: number,
    depth: number
  ): Phaser.GameObjects.Sprite {
    const textureKey = animationKey.endsWith('_loop') ? animationKey.slice(0, -5) : animationKey;
    const sprite = this.scene.add.sprite(
      CITY_ONE_CENTER_X + gx * TILE,
      CITY_ONE_CENTER_Y + gy * TILE,
      textureKey
    );
    sprite.setScale(SCALE);
    sprite.setDepth(depth);
    sprite.play(animationKey);
    this.objects.push(sprite);
    return sprite;
  }

  private pick<T extends readonly string[]>(
    options: T,
    gx: number,
    gy: number,
    salt: number
  ): T[number] {
    return options[Math.floor(this.noise(gx, gy, salt) * options.length) % options.length];
  }

  private noise(gx: number, gy: number, salt: number): number {
    let n =
      Math.imul(gx + 2048, 374761393) ^ Math.imul(gy + 2048, 668265263) ^ Math.imul(salt, 362437);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  private cellKey(gx: number, gy: number): string {
    return `${gx},${gy}`;
  }

  private parseCellKey(key: string): [number, number] {
    const [gx, gy] = key.split(',').map(Number);
    return [gx, gy];
  }

  private addImage(
    key: string,
    x: number,
    y: number,
    depth: number,
    scale: number,
    flipX = false,
    angle = 0
  ): Phaser.GameObjects.Image {
    const image = this.scene.add.image(CITY_ONE_CENTER_X + x, CITY_ONE_CENTER_Y + y, key);
    image.setScale(scale);
    image.setDepth(depth);
    image.setFlipX(flipX);
    image.setAngle(angle);
    this.objects.push(image);
    return image;
  }
}
