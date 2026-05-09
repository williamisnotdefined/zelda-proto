import { PACMAN_GHOST_VARIANTS } from '@/shared';
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

function createStripDirectionAnims(
  scene: Phaser.Scene,
  textureKey: string,
  definitions: { key: string; start: number; end: number; frameRate: number }[]
): void {
  const texture = scene.textures.get(textureKey);
  const frameIndexes = texture
    .getFrameNames()
    .map((name) => Number(name))
    .filter((value) => Number.isInteger(value));
  const lastFrameIndex = frameIndexes.length > 0 ? Math.max(...frameIndexes) : 0;

  for (const def of definitions) {
    const start = Math.min(def.start, lastFrameIndex);
    const end = Math.min(def.end, lastFrameIndex);
    if (end < start) continue;
    const frames = scene.anims.generateFrameNumbers(textureKey, { start, end });
    if (frames.length === 0) continue;

    scene.anims.remove(def.key);
    scene.anims.create({
      key: def.key,
      frames,
      frameRate: def.frameRate,
      repeat: -1,
    });
  }
}

function createFullStripAnim(
  scene: Phaser.Scene,
  textureKey: string,
  key: string,
  frameRate: number,
  repeat = -1
): void {
  const texture = scene.textures.get(textureKey);
  const frameIndexes = texture
    .getFrameNames()
    .map((name) => Number(name))
    .filter((value) => Number.isInteger(value));
  const lastFrameIndex = frameIndexes.length > 0 ? Math.max(...frameIndexes) : 0;
  const frames = scene.anims.generateFrameNumbers(textureKey, { start: 0, end: lastFrameIndex });
  if (frames.length === 0) return;

  scene.anims.remove(key);
  scene.anims.create({
    key,
    frames,
    frameRate,
    repeat,
  });
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

  // --- Blob (32x32, 7 cols x 13 rows) ---
  // Rows: 0=idle_down, 1=idle_right, 2=idle_up
  //        3=move_down, 4=move_right, 5=move_up
  //        6=attack_down, 7=attack_right, 8=attack_up
  //        9=damaged_down, 10=damaged_right, 11=damaged_up
  //        12=death
  createRowAnims(scene, 'blob', 'blob', 7, [
    { key: 'idle_down', row: 0, frameCount: 4 },
    { key: 'idle_right', row: 1, frameCount: 4 },
    { key: 'idle_up', row: 2, frameCount: 4 },
    { key: 'move_down', row: 3, frameRate: 10, frameCount: 6 },
    { key: 'move_right', row: 4, frameRate: 10, frameCount: 6 },
    { key: 'move_up', row: 5, frameRate: 10, frameCount: 6 },
    { key: 'attack_down', row: 6, repeat: 0, frameRate: 12 },
    { key: 'attack_right', row: 7, repeat: 0, frameRate: 12 },
    { key: 'attack_up', row: 8, repeat: 0, frameRate: 12 },
    { key: 'damaged_down', row: 9, repeat: 0, frameRate: 10, frameCount: 3 },
    { key: 'damaged_right', row: 10, repeat: 0, frameRate: 10, frameCount: 3 },
    { key: 'damaged_up', row: 11, repeat: 0, frameRate: 10, frameCount: 3 },
    { key: 'death', row: 12, repeat: 0, frameRate: 6, frameCount: 5 },
  ]);

  // --- Skeleton / Gelehk (48x48, 6 cols x 13 rows) ---
  // Same layout as blob but 6 cols, 48x48
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

  createFullStripAnim(scene, 'skeleton_enemy_idle', 'skeleton_enemy_idle', 8);
  createFullStripAnim(scene, 'skeleton_enemy_walk', 'skeleton_enemy_walk', 10);
  createFullStripAnim(scene, 'skeleton_enemy_attack', 'skeleton_enemy_attack', 14, 0);
  createFullStripAnim(scene, 'skeleton_enemy_hit', 'skeleton_enemy_hit', 12, 0);
  createFullStripAnim(scene, 'skeleton_enemy_react', 'skeleton_enemy_react', 10, 0);
  createFullStripAnim(scene, 'skeleton_enemy_dead', 'skeleton_enemy_dead', 8, 0);

  // Dragon Lord spritesheet is a single horizontal strip:
  // 1st frame = dead, frames 2..9 = down, then left, right, up.
  // (Frame indexes below are 0-based.)
  const dragonAnims = [
    { key: 'dragon_dead', start: 0, end: 0 },
    { key: 'dragon_down', start: 1, end: 8 },
    { key: 'dragon_left', start: 9, end: 16 },
    { key: 'dragon_right', start: 17, end: 24 },
    { key: 'dragon_up', start: 25, end: 32 },
  ] as const;

  const dragonTexture = scene.textures.get('dragon_lord');
  const dragonFrameIndexes = dragonTexture
    .getFrameNames()
    .map((name) => Number(name))
    .filter((value) => Number.isInteger(value));
  const dragonLastFrameIndex = dragonFrameIndexes.length > 0 ? Math.max(...dragonFrameIndexes) : 0;

  for (const anim of dragonAnims) {
    const start = Math.min(anim.start, dragonLastFrameIndex);
    const end = Math.min(anim.end, dragonLastFrameIndex);
    if (end < start) continue;

    scene.anims.remove(anim.key);
    scene.anims.create({
      key: anim.key,
      frames: scene.anims.generateFrameNumbers('dragon_lord', { start, end }),
      frameRate: 10,
      repeat: -1,
    });
  }

  createStripDirectionAnims(scene, 'hand', [
    { key: 'hand_down', start: 0, end: 1, frameRate: 2.5 },
    { key: 'hand_right', start: 4, end: 5, frameRate: 2.5 },
    { key: 'hand_left', start: 2, end: 3, frameRate: 2.5 },
    { key: 'hand_up', start: 6, end: 7, frameRate: 2.5 },
  ]);

  for (const variant of Object.values(PACMAN_GHOST_VARIANTS)) {
    createStripDirectionAnims(scene, `pacman_ghost_${variant}`, [
      { key: `pacman_ghost_${variant}_down`, start: 6, end: 7, frameRate: 8 },
      { key: `pacman_ghost_${variant}_right`, start: 0, end: 1, frameRate: 8 },
      { key: `pacman_ghost_${variant}_left`, start: 2, end: 3, frameRate: 8 },
      { key: `pacman_ghost_${variant}_up`, start: 4, end: 5, frameRate: 8 },
    ]);
  }

  createStripDirectionAnims(scene, 'silverback_wainer', [
    { key: 'silverback_wainer_down', start: 0, end: 7, frameRate: 10 },
    { key: 'silverback_wainer_right', start: 16, end: 23, frameRate: 10 },
    { key: 'silverback_wainer_left', start: 8, end: 15, frameRate: 10 },
    { key: 'silverback_wainer_up', start: 24, end: 31, frameRate: 10 },
  ]);

  createStripDirectionAnims(scene, 'slim_maioli', [
    { key: 'slim_maioli_down', start: 0, end: 7, frameRate: 10 },
    { key: 'slim_maioli_right', start: 16, end: 23, frameRate: 10 },
    { key: 'slim_maioli_left', start: 8, end: 15, frameRate: 10 },
    { key: 'slim_maioli_up', start: 24, end: 31, frameRate: 10 },
  ]);

  createStripDirectionAnims(scene, 'frankly_stein', [
    { key: 'frankly_stein_down', start: 0, end: 1, frameRate: 2.5 },
    { key: 'frankly_stein_right', start: 4, end: 5, frameRate: 2.5 },
    { key: 'frankly_stein_left', start: 2, end: 3, frameRate: 2.5 },
    { key: 'frankly_stein_up', start: 6, end: 7, frameRate: 2.5 },
  ]);

  createStripDirectionAnims(scene, 'vanessa', [
    { key: 'vanessa_down', start: 0, end: 7, frameRate: 10 },
    { key: 'vanessa_left', start: 8, end: 15, frameRate: 10 },
    { key: 'vanessa_right', start: 16, end: 23, frameRate: 10 },
    { key: 'vanessa_up', start: 24, end: 31, frameRate: 10 },
  ]);
}
