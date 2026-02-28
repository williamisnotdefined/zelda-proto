import Phaser from 'phaser';
import { onError, onMessage } from '../../network/socket';
import { useGameStore } from '../../ui/store';
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

    this.load.spritesheet('slime', 'assets/sprites/monsters/blob.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet('skeleton', 'assets/sprites/monsters/gelehk.png', {
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

    this.load.image('heart', 'assets/sprites/heart/heart_16x16.png');
  }

  create(): void {
    setupAnimations(this);

    // Set up WebSocket message handlers globally before WorldScene starts
    // This ensures handlers are ready when user connects
    const messageHandler = onMessage((msg) => {
      switch (msg.type) {
        case 'welcome':
          useGameStore.getState().setLocalPlayerId(msg.id as string);
          useGameStore.getState().setConnected(true);
          useGameStore.getState().setConnectionError(null);
          break;
        case 'snapshot':
          // Snapshot will be handled by WorldScene's own handler
          // We just need to ensure welcome message is caught
          break;
        default:
          break;
      }
    });

    const errorHandler = onError((error) => {
      useGameStore.getState().setConnectionError(error);
    });

    // Store handlers for cleanup if needed
    this.registry.set('globalMessageHandler', messageHandler);
    this.registry.set('globalErrorHandler', errorHandler);

    this.scene.start('WorldScene');
  }
}
