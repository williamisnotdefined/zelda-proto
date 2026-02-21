import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.image('grass', 'assets/grass.png');
    this.load.image('obstacle', 'assets/obstacle.png');
    this.load.tilemapTiledJSON('map', 'assets/map.json');
  }

  create(): void {
    this.scene.start('WorldScene');
  }
}
