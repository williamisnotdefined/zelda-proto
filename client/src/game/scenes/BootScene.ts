import Phaser from 'phaser';
import { logError } from '../../monitoring/errorLogger';
import { setupAnimations } from '../AnimationSetup';

const EXPLOSION_FRAME_WIDTH = 221;
const EXPLOSION_FRAME_HEIGHT = 241;
const EXPLOSION_FRAME_COUNT = 7;
const EXPLOSION_STRIP_TEXTURE_KEY = 'explosion_strip';
const EXPLOSION_FRAME_TEXTURE_KEY_PREFIX = 'explosion_';

function getExplosionFrameTextureKey(frameIndex: number): string {
  return `${EXPLOSION_FRAME_TEXTURE_KEY_PREFIX}${frameIndex}`;
}

function registerExplosionTextures(scene: Phaser.Scene): void {
  const stripTexture = scene.textures.get(EXPLOSION_STRIP_TEXTURE_KEY);
  const sourceImage = stripTexture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;

  for (let frameIndex = 0; frameIndex < EXPLOSION_FRAME_COUNT; frameIndex += 1) {
    const textureKey = getExplosionFrameTextureKey(frameIndex);

    if (scene.textures.exists(textureKey)) {
      continue;
    }

    const frameTexture = scene.textures.createCanvas(
      textureKey,
      EXPLOSION_FRAME_WIDTH,
      EXPLOSION_FRAME_HEIGHT
    );

    if (!frameTexture) {
      continue;
    }

    frameTexture.context.imageSmoothingEnabled = false;
    frameTexture.context.drawImage(
      sourceImage,
      frameIndex * EXPLOSION_FRAME_WIDTH,
      0,
      EXPLOSION_FRAME_WIDTH,
      EXPLOSION_FRAME_HEIGHT,
      0,
      0,
      EXPLOSION_FRAME_WIDTH,
      EXPLOSION_FRAME_HEIGHT
    );
    frameTexture.refresh();
  }
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
    this.load.image('grenade', 'assets/sprites/attacks/grenade_48x48.png');
    this.load.image('landmine', 'assets/sprites/attacks/landmine_mine.png');
    this.load.image(EXPLOSION_STRIP_TEXTURE_KEY, 'assets/sprites/attacks/explosion.png');

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

    this.load.image('food', 'assets/sprites/heart/food.png');
    this.load.image('toasty', 'assets/sprites/eastereggs/toasty.png');
  }

  create(): void {
    try {
      registerExplosionTextures(this);
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
