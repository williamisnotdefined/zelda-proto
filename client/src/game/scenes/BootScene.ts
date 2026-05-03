import Phaser from 'phaser';
import { logError } from '../../monitoring/errorLogger';
import { setupAnimations } from '../AnimationSetup';

const LANDMINE_SOURCE_KEY = 'landmine_source';
const LANDMINE_MINE_TEXTURE_KEY = 'landmine_mine';
const LANDMINE_EXPLOSION_TEXTURE_KEY = 'landmine_explosion';
const LANDMINE_SOURCE_FRAME_WIDTH = 183;
const LANDMINE_SOURCE_FRAME_HEIGHT = 225;
const LANDMINE_EXPLOSION_FRAME_COUNT = 7;

type OpaqueBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getOpaqueBounds(
  context: CanvasRenderingContext2D,
  frameX: number,
  frameY: number,
  frameWidth: number,
  frameHeight: number
): OpaqueBounds {
  const { data } = context.getImageData(frameX, frameY, frameWidth, frameHeight);
  let left = frameWidth;
  let top = frameHeight;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      if (data[(y * frameWidth + x) * 4 + 3] === 0) {
        continue;
      }

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right === -1 || bottom === -1) {
    return {
      x: 0,
      y: 0,
      width: frameWidth,
      height: frameHeight,
    };
  }

  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function buildLandmineTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(LANDMINE_MINE_TEXTURE_KEY)) {
    scene.textures.remove(LANDMINE_MINE_TEXTURE_KEY);
  }
  if (scene.textures.exists(LANDMINE_EXPLOSION_TEXTURE_KEY)) {
    scene.textures.remove(LANDMINE_EXPLOSION_TEXTURE_KEY);
  }

  const sourceTexture = scene.textures.get(LANDMINE_SOURCE_KEY);
  const sourceImage = sourceTexture.getSourceImage() as CanvasImageSource & {
    width: number;
    height: number;
  };

  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = sourceImage.width;
  analysisCanvas.height = sourceImage.height;

  const analysisContext = analysisCanvas.getContext('2d');
  if (!analysisContext) {
    throw new Error('Unable to create landmine texture analysis context');
  }

  analysisContext.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
  analysisContext.drawImage(sourceImage, 0, 0);

  const mineBounds = getOpaqueBounds(
    analysisContext,
    0,
    0,
    LANDMINE_SOURCE_FRAME_WIDTH,
    LANDMINE_SOURCE_FRAME_HEIGHT
  );

  const mineTexture = scene.textures.createCanvas(
    LANDMINE_MINE_TEXTURE_KEY,
    mineBounds.width,
    mineBounds.height
  );
  if (!mineTexture) {
    throw new Error('Unable to create landmine mine texture');
  }
  const mineContext = mineTexture.getContext();
  mineContext.clearRect(0, 0, mineBounds.width, mineBounds.height);
  mineContext.drawImage(
    sourceImage,
    mineBounds.x,
    mineBounds.y,
    mineBounds.width,
    mineBounds.height,
    0,
    0,
    mineBounds.width,
    mineBounds.height
  );
  mineTexture.refresh();

  const explosionTexture = scene.textures.createCanvas(
    LANDMINE_EXPLOSION_TEXTURE_KEY,
    LANDMINE_SOURCE_FRAME_WIDTH * LANDMINE_EXPLOSION_FRAME_COUNT,
    LANDMINE_SOURCE_FRAME_HEIGHT
  );
  if (!explosionTexture) {
    throw new Error('Unable to create landmine explosion texture');
  }
  const explosionContext = explosionTexture.getContext();
  explosionContext.clearRect(
    0,
    0,
    LANDMINE_SOURCE_FRAME_WIDTH * LANDMINE_EXPLOSION_FRAME_COUNT,
    LANDMINE_SOURCE_FRAME_HEIGHT
  );

  for (let frame = 0; frame < LANDMINE_EXPLOSION_FRAME_COUNT; frame += 1) {
    const sourceFrameX = LANDMINE_SOURCE_FRAME_WIDTH * (frame + 1);
    const bounds = getOpaqueBounds(
      analysisContext,
      sourceFrameX,
      0,
      LANDMINE_SOURCE_FRAME_WIDTH,
      LANDMINE_SOURCE_FRAME_HEIGHT
    );
    const destinationX =
      frame * LANDMINE_SOURCE_FRAME_WIDTH +
      Math.floor((LANDMINE_SOURCE_FRAME_WIDTH - bounds.width) / 2);
    const destinationY = Math.floor((LANDMINE_SOURCE_FRAME_HEIGHT - bounds.height) / 2);

    explosionContext.drawImage(
      sourceImage,
      sourceFrameX + bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      destinationX,
      destinationY,
      bounds.width,
      bounds.height
    );
    explosionTexture.add(
      String(frame),
      0,
      frame * LANDMINE_SOURCE_FRAME_WIDTH,
      0,
      LANDMINE_SOURCE_FRAME_WIDTH,
      LANDMINE_SOURCE_FRAME_HEIGHT
    );
  }

  explosionTexture.refresh();
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

    this.load.spritesheet('slime', 'assets/sprites/monsters/Slime.png', {
      frameWidth: 64,
      frameHeight: 64,
    });

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

    this.load.spritesheet('hand', 'assets/sprites/monsters/hand.png', {
      frameWidth: 64,
      frameHeight: 64,
    });

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

    this.load.image('fire_field', 'assets/sprites/fields/Fire_Field.gif');
    this.load.image('purple_field', 'assets/sprites/fields/Purple_Field.gif');
    this.load.image('blue_flame', 'assets/sprites/fields/Blue_Flame.gif');
    this.load.spritesheet('fireball', 'assets/sprites/attacks/fireball.png', {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.image(LANDMINE_SOURCE_KEY, 'assets/sprites/attacks/landmine.png');

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

    this.load.image('heart', 'assets/sprites/heart/heart_16x16.png');
    this.load.image('heart_large', 'assets/sprites/heart/heart_32x32.png');
    this.load.image('toasty', 'assets/sprites/eastereggs/toasty.png');
  }

  create(): void {
    try {
      buildLandmineTextures(this);
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
