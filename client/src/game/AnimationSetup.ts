import Phaser from 'phaser';

function createRowAnims(
  scene: Phaser.Scene,
  textureKey: string,
  prefix: string,
  colsPerRow: number,
  definitions: {
    key: string;
    row: number;
    repeat?: number;
    frameRate?: number;
    frameCount?: number;
  }[]
): void {
  for (const def of definitions) {
    const startFrame = def.row * colsPerRow;
    const endFrame = startFrame + (def.frameCount ?? colsPerRow) - 1;

    scene.anims.create({
      key: `${prefix}_${def.key}`,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        start: startFrame,
        end: endFrame,
      }),
      frameRate: def.frameRate ?? 8,
      repeat: def.repeat ?? -1,
    });
  }
}

export function setupAnimations(scene: Phaser.Scene): void {
  // --- Player (48x48, 6 cols x 10 rows) ---
  // Rows: 0=idle_down, 1=idle_right, 2=idle_up
  //        3=move_down, 4=move_right, 5=move_up
  //        6=attack_down, 7=attack_right, 8=attack_up
  //        9=death
  createRowAnims(scene, 'player', 'player', 6, [
    { key: 'idle_down', row: 0 },
    { key: 'idle_right', row: 1 },
    { key: 'idle_up', row: 2 },
    { key: 'move_down', row: 3, frameRate: 10 },
    { key: 'move_right', row: 4, frameRate: 10 },
    { key: 'move_up', row: 5, frameRate: 10 },
    { key: 'attack_down', row: 6, repeat: 0, frameRate: 14, frameCount: 4 },
    { key: 'attack_right', row: 7, repeat: 0, frameRate: 14, frameCount: 4 },
    { key: 'attack_up', row: 8, repeat: 0, frameRate: 14, frameCount: 4 },
    { key: 'death', row: 9, repeat: 0, frameRate: 6 },
  ]);

  // --- Slime (32x32, 7 cols x 13 rows) ---
  // Rows: 0=idle_down, 1=idle_right, 2=idle_up
  //        3=move_down, 4=move_right, 5=move_up
  //        6=attack_down, 7=attack_right, 8=attack_up
  //        9=damaged_down, 10=damaged_right, 11=damaged_up
  //        12=death
  createRowAnims(scene, 'slime', 'slime', 7, [
    { key: 'idle_down', row: 0 },
    { key: 'idle_right', row: 1 },
    { key: 'idle_up', row: 2 },
    { key: 'move_down', row: 3, frameRate: 10 },
    { key: 'move_right', row: 4, frameRate: 10 },
    { key: 'move_up', row: 5, frameRate: 10 },
    { key: 'attack_down', row: 6, repeat: 0, frameRate: 12 },
    { key: 'attack_right', row: 7, repeat: 0, frameRate: 12 },
    { key: 'attack_up', row: 8, repeat: 0, frameRate: 12 },
    { key: 'damaged_down', row: 9, repeat: 0, frameRate: 10 },
    { key: 'damaged_right', row: 10, repeat: 0, frameRate: 10 },
    { key: 'damaged_up', row: 11, repeat: 0, frameRate: 10 },
    { key: 'death', row: 12, repeat: 0, frameRate: 6 },
  ]);

  // --- Skeleton / Gelehk (48x48, 6 cols x 13 rows) ---
  // Same layout as slime but 6 cols, 48x48
  createRowAnims(scene, 'skeleton', 'skeleton', 6, [
    { key: 'idle_down', row: 0 },
    { key: 'idle_right', row: 1 },
    { key: 'idle_up', row: 2 },
    { key: 'move_down', row: 3, frameRate: 10 },
    { key: 'move_right', row: 4, frameRate: 10 },
    { key: 'move_up', row: 5, frameRate: 10 },
    { key: 'attack_down', row: 6, repeat: 0, frameRate: 14 },
    { key: 'attack_right', row: 7, repeat: 0, frameRate: 14 },
    { key: 'attack_up', row: 8, repeat: 0, frameRate: 14 },
    { key: 'damaged_down', row: 9, repeat: 0, frameRate: 10 },
    { key: 'damaged_right', row: 10, repeat: 0, frameRate: 10 },
    { key: 'damaged_up', row: 11, repeat: 0, frameRate: 10 },
    { key: 'death', row: 12, repeat: 0, frameRate: 6 },
  ]);
}
