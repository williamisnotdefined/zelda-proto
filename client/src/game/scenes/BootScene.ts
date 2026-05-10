import Phaser from 'phaser';
import { logError } from '../../monitoring/errorLogger';
import { setupAnimations } from '../AnimationSetup';

const EXPLOSION_FRAME_WIDTH = 221;
const EXPLOSION_FRAME_HEIGHT = 241;
const EXPLOSION_FRAME_COUNT = 7;
const EXPLOSION_STRIP_TEXTURE_KEY = 'explosion_strip';
const EXPLOSION_FRAME_TEXTURE_KEY_PREFIX = 'explosion_';
const MOLOTOV_EXPLOSION_FRAME_WIDTH = 311;
const MOLOTOV_EXPLOSION_FRAME_HEIGHT = 242;
const MOLOTOV_EXPLOSION_FRAME_COUNT = 5;
const MOLOTOV_EXPLOSION_FRAME_COLUMNS = 3;
const MOLOTOV_EXPLOSION_STRIP_TEXTURE_KEY = 'molotov_explosion_strip';
const MOLOTOV_EXPLOSION_FRAME_TEXTURE_KEY_PREFIX = 'molotov_explosion_';
const FIELD_FIRE_FRAME_WIDTH = 55;
const FIELD_FIRE_FRAME_HEIGHT = 50;
const FIELD_PURPLE_FRAME_WIDTH = 50;
const FIELD_PURPLE_FRAME_HEIGHT = 51;
const FIELD_BLUE_FRAME_WIDTH = 49;
const FIELD_BLUE_FRAME_HEIGHT = 47;
const PORTAL_LARGE_FRAME_SIZE = 64;
const PORTAL_RETURN_FRAME_SIZE = 32;
const CITY_ONE_BASE_PATH = 'assets/sprites/city_one/Pack content';
const CITY_ONE_TILESET_SOURCE_KEY = 'city_grass_tileset_source';
const CITY_ONE_TILE_SIZE = 16;
const CITY_ONE_TILESET_COLUMNS = 30;
const CITY_ONE_DIRT_BASE_KEY = 'city_tile_dirt_base';
const CITY_ONE_SHORE_WATER_LEFT_RIGHT_KEY = 'city_tile_water_shore_water_left_right';
const CITY_ONE_SHORE_WATER_UP_DOWN_KEY = 'city_tile_water_shore_water_up_down';
const CITY_ONE_GRASS_FRAME = 132;
const CITY_ONE_SHORE_WATER_LEFT_FRAME = 402;
const CITY_ONE_SHORE_WATER_RIGHT_FRAME = 405;
const CITY_ONE_SHORE_WATER_ABOVE_FRAME = 467;
const CITY_ONE_SHORE_WATER_BELOW_FRAME = 377;

const CITY_ONE_TILE_FRAMES: Record<string, number> = {
  city_tile_grass_0: 132,
  city_tile_grass_1: 133,
  city_tile_grass_flower: 92,
  city_tile_grass_blades_0: 93,
  city_tile_grass_blades_1: 122,
  city_tile_grass_sprout: 123,
  city_tile_grass_rock: 216,
  city_tile_dirt_plain_0: 227,
  city_tile_dirt_plain_1: 228,
  city_tile_dirt_plain_2: 257,
  city_tile_dirt_plain_3: 258,
  city_tile_dirt_detail_0: 246,
  city_tile_dirt_detail_1: 247,
  city_tile_dirt_detail_2: 276,
  city_tile_dirt_detail_3: 277,
  city_tile_path_grass_above_0: 197,
  city_tile_path_grass_above_1: 198,
  city_tile_path_grass_above_2: 199,
  city_tile_path_grass_below_0: 287,
  city_tile_path_grass_below_1: 288,
  city_tile_path_grass_below_2: 289,
  city_tile_path_grass_left_0: 220,
  city_tile_path_grass_left_1: 226,
  city_tile_path_grass_left_2: 250,
  city_tile_path_grass_right_0: 218,
  city_tile_path_grass_right_1: 229,
  city_tile_path_grass_right_2: 248,
  city_tile_water_0: 437,
  city_tile_water_1: 438,
  city_tile_water_2: 439,
  city_tile_water_top_0: 407,
  city_tile_water_top_1: 408,
  city_tile_water_top_2: 409,
  city_tile_water_bottom_0: 467,
  city_tile_water_bottom_1: 468,
  city_tile_water_bottom_2: 469,
  city_tile_water_grass_left: 402,
  city_tile_water_grass_right: 405,
  city_tile_water_shore_water_below_0: 377,
  city_tile_water_shore_water_below_1: 378,
  city_tile_water_shore_water_below_2: 379,
  city_tile_water_shore_water_above_0: 467,
  city_tile_water_shore_water_above_1: 468,
  city_tile_water_shore_water_above_2: 469,
  city_tile_water_shore_water_left_0: 402,
  city_tile_water_shore_water_left_1: 432,
  city_tile_water_shore_water_left_2: 440,
  city_tile_water_shore_water_right_0: 405,
  city_tile_water_shore_water_right_1: 406,
  city_tile_water_shore_water_right_2: 435,
  city_tile_water_shore_water_up_left: 372,
  city_tile_water_shore_water_up_right: 375,
  city_tile_water_shore_water_down_left: 462,
  city_tile_water_shore_water_down_right: 465,
};

function preloadCityOneAssets(scene: Phaser.Scene): void {
  const spritesPath = `${CITY_ONE_BASE_PATH}/Sprites`;
  const animatedPath = `${CITY_ONE_BASE_PATH}/Animated sprites`;

  scene.load.image(CITY_ONE_TILESET_SOURCE_KEY, `${spritesPath}/Tileset/spr_grass_tileset.png`);

  scene.load.image('city_tree1', `${spritesPath}/Vegetation/spr_tree1.png`);
  scene.load.image('city_tree2', `${spritesPath}/Vegetation/spr_tree2.png`);
  scene.load.image('city_tree3', `${spritesPath}/Vegetation/spr_tree3.png`);

  scene.load.image('city_boulder1', `${spritesPath}/Rocks/spr_boulder1.png`);
  scene.load.image('city_boulder2', `${spritesPath}/Rocks/spr_boulder2.png`);
  scene.load.image('city_boulder3', `${spritesPath}/Rocks/spr_boulder3.png`);
  scene.load.image('city_boulder4', `${spritesPath}/Rocks/spr_boulder4.png`);
  scene.load.image('city_smallrock1', `${spritesPath}/Rocks/spr_smallrock1.png`);
  scene.load.image('city_smallrock2', `${spritesPath}/Rocks/spr_smallrock2.png`);

  const objectPath = `${spritesPath}/Objects and buildings`;
  scene.load.image('city_barrel1', `${objectPath}/Barrels and crates/spr_barrel1.png`);
  scene.load.image('city_barrel2', `${objectPath}/Barrels and crates/spr_barrel2.png`);
  scene.load.image('city_crate1', `${objectPath}/Barrels and crates/spr_crate1.png`);
  scene.load.image('city_crate2', `${objectPath}/Barrels and crates/spr_crate2.png`);
  scene.load.image('city_crate3', `${objectPath}/Barrels and crates/spr_crate3.png`);
  scene.load.image('city_crate4', `${objectPath}/Barrels and crates/spr_crate4.png`);
  scene.load.image(
    'city_bridge_horizontal',
    `${objectPath}/Bridge/spr_wooden_bridge_horizontal.png`
  );
  scene.load.image('city_bridge_vertical', `${objectPath}/Bridge/spr_wooden_bridge_vertical.png`);
  scene.load.image('city_chest', `${objectPath}/Chest/spr_chest.png`);
  scene.load.image('city_small_chest', `${objectPath}/Chest/spr_small_chest.png`);
  scene.load.image('city_fence_front', `${objectPath}/Fences/spr_front_fence.png`);
  scene.load.image('city_fence_side', `${objectPath}/Fences/spr_side_fence.png`);

  scene.load.spritesheet(
    'city_campfire_burning',
    `${animatedPath}/Animated Campfire/spr_campfire_burning.png`,
    { frameWidth: 32, frameHeight: 64 }
  );
  const waterWavePath = `${animatedPath}/Animated water waves`;
  const loadWaterWave = (key: string, filename: string): void => {
    scene.load.spritesheet(key, `${waterWavePath}/${filename}`, {
      frameWidth: 16,
      frameHeight: 16,
    });
  };

  loadWaterWave('city_wave_front', 'spr_front_wave_animated.png');
  loadWaterWave('city_wave_left', 'spr_left_side_wave_animated.png');
  loadWaterWave('city_wave_right', 'spr_right_side_wave_animated.png');
  loadWaterWave('city_wave_left_corner', 'spr_left_corner_wave_animated.png');
  loadWaterWave('city_wave_right_corner', 'spr_right_corner_wave_animated.png');
  loadWaterWave('city_wave_left_backcorner', 'spr_left_backcorner_wave_animated.png');
  loadWaterWave('city_wave_right_backcorner', 'spr_right_backcorner_wave_animated.png');
  loadWaterWave(
    'city_wave_front_left_corner_intersection',
    'spr_front_left_corner_intersection_wave_animated.png'
  );
  loadWaterWave(
    'city_wave_front_right_corner_intersection',
    'spr_front_right_corner_intersection_wave_animated.png'
  );
}

function registerCityOneTileTextures(scene: Phaser.Scene): void {
  const sourceTexture = scene.textures.get(CITY_ONE_TILESET_SOURCE_KEY);
  const sourceImage = sourceTexture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;

  if (!scene.textures.exists(CITY_ONE_DIRT_BASE_KEY)) {
    const dirtBaseTexture = scene.textures.createCanvas(
      CITY_ONE_DIRT_BASE_KEY,
      CITY_ONE_TILE_SIZE,
      CITY_ONE_TILE_SIZE
    );
    if (dirtBaseTexture) {
      dirtBaseTexture.context.imageSmoothingEnabled = false;
      dirtBaseTexture.context.fillStyle = '#c07652';
      dirtBaseTexture.context.fillRect(0, 0, CITY_ONE_TILE_SIZE, CITY_ONE_TILE_SIZE);
      dirtBaseTexture.refresh();
    }
  }

  for (const [textureKey, frameIndex] of Object.entries(CITY_ONE_TILE_FRAMES)) {
    if (scene.textures.exists(textureKey)) {
      continue;
    }

    const tileTexture = scene.textures.createCanvas(
      textureKey,
      CITY_ONE_TILE_SIZE,
      CITY_ONE_TILE_SIZE
    );
    if (!tileTexture) {
      continue;
    }

    const sourceColumn = frameIndex % CITY_ONE_TILESET_COLUMNS;
    const sourceRow = Math.floor(frameIndex / CITY_ONE_TILESET_COLUMNS);
    const sourceX = sourceColumn * CITY_ONE_TILE_SIZE;
    const sourceY = sourceRow * CITY_ONE_TILE_SIZE;

    tileTexture.context.imageSmoothingEnabled = false;
    tileTexture.context.clearRect(0, 0, CITY_ONE_TILE_SIZE, CITY_ONE_TILE_SIZE);
    tileTexture.context.drawImage(
      sourceImage,
      sourceX,
      sourceY,
      CITY_ONE_TILE_SIZE,
      CITY_ONE_TILE_SIZE,
      0,
      0,
      CITY_ONE_TILE_SIZE,
      CITY_ONE_TILE_SIZE
    );

    const imageData = tileTexture.context.getImageData(
      0,
      0,
      CITY_ONE_TILE_SIZE,
      CITY_ONE_TILE_SIZE
    );
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 158 && data[i + 1] === 92 && data[i + 2] === 182) {
        data[i + 3] = 0;
      }
    }
    tileTexture.context.putImageData(imageData, 0, 0);
    tileTexture.refresh();
  }

  registerCityOneCompositeShoreTextures(scene, sourceImage);
}

function registerCityOneCompositeShoreTextures(
  scene: Phaser.Scene,
  sourceImage: HTMLImageElement | HTMLCanvasElement
): void {
  registerCityOneCompositeShoreTexture(scene, sourceImage, CITY_ONE_SHORE_WATER_LEFT_RIGHT_KEY, [
    { frameIndex: CITY_ONE_GRASS_FRAME },
    { frameIndex: CITY_ONE_SHORE_WATER_LEFT_FRAME, sourceX: 0, sourceY: 0, width: 6, height: 16 },
    {
      frameIndex: CITY_ONE_SHORE_WATER_RIGHT_FRAME,
      sourceX: 10,
      sourceY: 0,
      width: 6,
      height: 16,
      destX: 10,
    },
  ]);

  registerCityOneCompositeShoreTexture(scene, sourceImage, CITY_ONE_SHORE_WATER_UP_DOWN_KEY, [
    { frameIndex: CITY_ONE_GRASS_FRAME },
    { frameIndex: CITY_ONE_SHORE_WATER_ABOVE_FRAME, sourceX: 0, sourceY: 0, width: 16, height: 6 },
    {
      frameIndex: CITY_ONE_SHORE_WATER_BELOW_FRAME,
      sourceX: 0,
      sourceY: 10,
      width: 16,
      height: 6,
      destY: 10,
    },
  ]);
}

function registerCityOneCompositeShoreTexture(
  scene: Phaser.Scene,
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  textureKey: string,
  parts: {
    frameIndex: number;
    sourceX?: number;
    sourceY?: number;
    width?: number;
    height?: number;
    destX?: number;
    destY?: number;
  }[]
): void {
  if (scene.textures.exists(textureKey)) {
    return;
  }

  const tileTexture = scene.textures.createCanvas(
    textureKey,
    CITY_ONE_TILE_SIZE,
    CITY_ONE_TILE_SIZE
  );
  if (!tileTexture) {
    return;
  }

  tileTexture.context.imageSmoothingEnabled = false;
  tileTexture.context.clearRect(0, 0, CITY_ONE_TILE_SIZE, CITY_ONE_TILE_SIZE);

  for (const part of parts) {
    const sourceColumn = part.frameIndex % CITY_ONE_TILESET_COLUMNS;
    const sourceRow = Math.floor(part.frameIndex / CITY_ONE_TILESET_COLUMNS);
    const width = part.width ?? CITY_ONE_TILE_SIZE;
    const height = part.height ?? CITY_ONE_TILE_SIZE;
    const sourceX = sourceColumn * CITY_ONE_TILE_SIZE + (part.sourceX ?? 0);
    const sourceY = sourceRow * CITY_ONE_TILE_SIZE + (part.sourceY ?? 0);

    tileTexture.context.drawImage(
      sourceImage,
      sourceX,
      sourceY,
      width,
      height,
      part.destX ?? 0,
      part.destY ?? 0,
      width,
      height
    );
  }

  tileTexture.refresh();
}

function registerStripTextures(
  scene: Phaser.Scene,
  stripTextureKey: string,
  frameTextureKeyPrefix: string,
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
  frameColumns: number
): void {
  const stripTexture = scene.textures.get(stripTextureKey);
  const sourceImage = stripTexture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const textureKey = `${frameTextureKeyPrefix}${frameIndex}`;

    if (scene.textures.exists(textureKey)) {
      continue;
    }

    const frameTexture = scene.textures.createCanvas(textureKey, frameWidth, frameHeight);

    if (!frameTexture) {
      continue;
    }

    const sourceColumn = frameIndex % frameColumns;
    const sourceRow = Math.floor(frameIndex / frameColumns);
    frameTexture.context.imageSmoothingEnabled = false;
    frameTexture.context.drawImage(
      sourceImage,
      sourceColumn * frameWidth,
      sourceRow * frameHeight,
      frameWidth,
      frameHeight,
      0,
      0,
      frameWidth,
      frameHeight
    );
    frameTexture.refresh();
  }
}

function registerExplosionTextures(scene: Phaser.Scene): void {
  registerStripTextures(
    scene,
    EXPLOSION_STRIP_TEXTURE_KEY,
    EXPLOSION_FRAME_TEXTURE_KEY_PREFIX,
    EXPLOSION_FRAME_WIDTH,
    EXPLOSION_FRAME_HEIGHT,
    EXPLOSION_FRAME_COUNT,
    EXPLOSION_FRAME_COUNT
  );
  registerStripTextures(
    scene,
    MOLOTOV_EXPLOSION_STRIP_TEXTURE_KEY,
    MOLOTOV_EXPLOSION_FRAME_TEXTURE_KEY_PREFIX,
    MOLOTOV_EXPLOSION_FRAME_WIDTH,
    MOLOTOV_EXPLOSION_FRAME_HEIGHT,
    MOLOTOV_EXPLOSION_FRAME_COUNT,
    MOLOTOV_EXPLOSION_FRAME_COLUMNS
  );
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      logError({
        category: 'game',
        type: 'phaser.asset-load-error',
        message: `Failed to load asset: ${file.key}`,
        handled: true,
        context: {
          key: file.key,
          src: file.src,
          type: file.type,
        },
      });
    });

    this.load.spritesheet('player', 'assets/sprites/characters/player.png', {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.spritesheet('blob', 'assets/sprites/monsters/blob.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet(
      'skeleton_enemy_idle',
      'assets/sprites/monsters/Skeleton/Skeleton Idle.png',
      {
        frameWidth: 24,
        frameHeight: 32,
      }
    );
    this.load.spritesheet(
      'skeleton_enemy_walk',
      'assets/sprites/monsters/Skeleton/Skeleton Walk.png',
      {
        frameWidth: 22,
        frameHeight: 33,
      }
    );
    this.load.spritesheet(
      'skeleton_enemy_attack',
      'assets/sprites/monsters/Skeleton/Skeleton Attack.png',
      {
        frameWidth: 43,
        frameHeight: 37,
      }
    );
    this.load.spritesheet(
      'skeleton_enemy_hit',
      'assets/sprites/monsters/Skeleton/Skeleton Hit.png',
      {
        frameWidth: 30,
        frameHeight: 32,
      }
    );
    this.load.spritesheet(
      'skeleton_enemy_react',
      'assets/sprites/monsters/Skeleton/Skeleton React.png',
      {
        frameWidth: 22,
        frameHeight: 32,
      }
    );
    this.load.spritesheet(
      'skeleton_enemy_dead',
      'assets/sprites/monsters/Skeleton/Skeleton Dead.png',
      {
        frameWidth: 33,
        frameHeight: 32,
      }
    );

    this.load.audio('bg_music', 'assets/sounds/bg_music.mp3');
    this.load.audio('toasty_sfx', 'assets/sounds/toasty.mp3');

    this.load.spritesheet('skeleton', 'assets/sprites/monsters/gelehk.png', {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.spritesheet('dragon_lord', 'assets/sprites/monsters/dragon_lord.png', {
      frameWidth: 64,
      frameHeight: 64,
    });

    this.load.spritesheet(
      'knight_idle',
      'assets/sprites/monsters/Knight/noBKG_KnightIdle_strip.png',
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );
    this.load.spritesheet(
      'knight_run',
      'assets/sprites/monsters/Knight/noBKG_KnightRun_strip.png',
      {
        frameWidth: 96,
        frameHeight: 64,
      }
    );
    this.load.spritesheet(
      'knight_attack',
      'assets/sprites/monsters/Knight/noBKG_KnightAttack_strip.png',
      {
        frameWidth: 144,
        frameHeight: 64,
      }
    );
    this.load.spritesheet(
      'knight_roll',
      'assets/sprites/monsters/Knight/noBKG_KnightRoll_strip.png',
      {
        frameWidth: 180,
        frameHeight: 64,
      }
    );
    this.load.spritesheet(
      'knight_jump',
      'assets/sprites/monsters/Knight/noBKG_KnightJumpAndFall_strip.png',
      {
        frameWidth: 144,
        frameHeight: 64,
      }
    );
    this.load.spritesheet(
      'knight_shield',
      'assets/sprites/monsters/Knight/noBKG_KnightShield_strip.png',
      {
        frameWidth: 96,
        frameHeight: 64,
      }
    );
    this.load.spritesheet(
      'knight_death',
      'assets/sprites/monsters/Knight/noBKG_KnightDeath_strip.png',
      {
        frameWidth: 96,
        frameHeight: 64,
      }
    );

    this.load.spritesheet('pacman_ghost_red', 'assets/sprites/monsters/pacman_ghost_red.png', {
      frameWidth: 86,
      frameHeight: 86,
    });

    this.load.spritesheet('pacman_ghost_blue', 'assets/sprites/monsters/pacman_ghost_blue.png', {
      frameWidth: 86,
      frameHeight: 86,
    });

    this.load.spritesheet(
      'pacman_ghost_orange',
      'assets/sprites/monsters/pacman_ghost_orange.png',
      {
        frameWidth: 86,
        frameHeight: 86,
      }
    );

    this.load.spritesheet('pacman_ghost_pink', 'assets/sprites/monsters/pacman_ghost_pink.png', {
      frameWidth: 86,
      frameHeight: 86,
    });

    this.load.spritesheet('silverback_wainer', 'assets/sprites/monsters/silverback_wainer.png', {
      frameWidth: 64,
      frameHeight: 64,
    });

    this.load.spritesheet('slim_maioli', 'assets/sprites/monsters/slim_maioli.png', {
      frameWidth: 64,
      frameHeight: 64,
    });

    this.load.spritesheet('frankly_stein', 'assets/sprites/monsters/frankly_stein.png', {
      frameWidth: 64,
      frameHeight: 64,
    });

    this.load.spritesheet('vanessa', 'assets/sprites/monsters/vanessa.png', {
      frameWidth: 64,
      frameHeight: 64,
    });

    this.load.spritesheet('fire_field', 'assets/sprites/generated/fire_field_strip.png', {
      frameWidth: FIELD_FIRE_FRAME_WIDTH,
      frameHeight: FIELD_FIRE_FRAME_HEIGHT,
    });
    this.load.spritesheet('purple_field', 'assets/sprites/generated/purple_field_strip.png', {
      frameWidth: FIELD_PURPLE_FRAME_WIDTH,
      frameHeight: FIELD_PURPLE_FRAME_HEIGHT,
    });
    this.load.spritesheet('blue_flame', 'assets/sprites/generated/blue_flame_strip.png', {
      frameWidth: FIELD_BLUE_FRAME_WIDTH,
      frameHeight: FIELD_BLUE_FRAME_HEIGHT,
    });
    this.load.spritesheet('portal_advance', 'assets/sprites/generated/energy_portal_strip.png', {
      frameWidth: PORTAL_LARGE_FRAME_SIZE,
      frameHeight: PORTAL_LARGE_FRAME_SIZE,
    });
    this.load.spritesheet(
      'portal_return',
      'assets/sprites/generated/magic_forcefield_blue_strip.png',
      {
        frameWidth: PORTAL_RETURN_FRAME_SIZE,
        frameHeight: PORTAL_RETURN_FRAME_SIZE,
      }
    );
    this.load.spritesheet('portal_earth', 'assets/sprites/generated/earth_portal_strip.png', {
      frameWidth: PORTAL_LARGE_FRAME_SIZE,
      frameHeight: PORTAL_LARGE_FRAME_SIZE,
    });
    this.load.image('grenade', 'assets/sprites/attacks/grenade_48x48.png');
    this.load.image('molotov', 'assets/sprites/attacks/molotov.png');
    this.load.image('landmine', 'assets/sprites/attacks/landmine_mine.png');
    this.load.image('spiked_ball', 'assets/sprites/attacks/mace_ball.png');
    this.load.spritesheet('shuriken', 'assets/sprites/attacks/shuriken.png', {
      frameWidth: 99,
      frameHeight: 99,
      spacing: 1,
    });
    this.load.image(EXPLOSION_STRIP_TEXTURE_KEY, 'assets/sprites/attacks/explosion.png');
    this.load.image(MOLOTOV_EXPLOSION_STRIP_TEXTURE_KEY, 'assets/sprites/attacks/explosion_2.png');

    this.load.image('grass_tile', 'assets/sprites/tilesets/Grass_Tile.gif');
    this.load.image('stone_floor_bege_tile', 'assets/sprites/tilesets/Stone_Floor_(Bege).gif');
    this.load.image('ice_stone_floor_tile', 'assets/sprites/tilesets/Ice_Stone_Floor.gif');
    this.load.image('void_tile', 'assets/sprites/tilesets/Void.gif');
    this.load.image('floor_fase_4', 'assets/sprites/tilesets/floor_fase_4.gif');
    this.load.image('cut_grass_tile', 'assets/sprites/tilesets/Cut_Grass.gif');
    this.load.image('humanoid_remains', 'assets/sprites/objects/Humanoid_Remains.gif');
    this.load.image('pile_of_bones_animal', 'assets/sprites/objects/Pile_of_Bones_(Animal).gif');
    this.load.image('skull_animal', 'assets/sprites/objects/Skull_(Animal).gif');
    this.load.image('pirate_remains', 'assets/sprites/objects/The_Remains_of_a_Pirate.gif');

    this.load.spritesheet('plains', 'assets/sprites/tilesets/plains.png', {
      frameWidth: 16,
      frameHeight: 16,
    });

    this.load.spritesheet('decor', 'assets/sprites/tilesets/decor_16x16.png', {
      frameWidth: 16,
      frameHeight: 16,
    });

    this.load.spritesheet('objects', 'assets/sprites/objects/objects.png', {
      frameWidth: 16,
      frameHeight: 16,
    });

    this.load.spritesheet('dust', 'assets/sprites/particles/dust_particles_01.png', {
      frameWidth: 12,
      frameHeight: 12,
    });

    this.load.spritesheet('chest', 'assets/sprites/objects/chest_01.png', {
      frameWidth: 16,
      frameHeight: 16,
    });

    this.load.image('food', 'assets/sprites/food/food.png');
    this.load.image('toasty', 'assets/sprites/eastereggs/toasty.png');
    preloadCityOneAssets(this);
  }

  create(): void {
    try {
      registerExplosionTextures(this);
      registerCityOneTileTextures(this);
      setupAnimations(this);
      this.scene.start('WorldScene');
    } catch (error) {
      logError({
        category: 'game',
        type: 'phaser.boot-scene-create-failed',
        message: 'BootScene failed during create()',
        error,
      });
      throw error;
    }
  }
}
