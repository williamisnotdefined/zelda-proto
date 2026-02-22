import Phaser from 'phaser';
import { setupAnimations } from '../AnimationSetup';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.spritesheet('player', 'assets/sprites/characters/player.png', {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.spritesheet('slime', 'assets/sprites/characters/slime.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet('skeleton', 'assets/sprites/characters/skeleton.png', {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.image('grass_tile', 'assets/sprites/tilesets/grass.png');

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
  }

  create(): void {
    setupAnimations(this);
    this.scene.start('WorldScene');
  }
}
