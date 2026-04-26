import type Phaser from 'phaser';

/** Module-level reference to the running Phaser game, set by App.tsx. */
export let phaserGame: Phaser.Game | null = null;

export function setPhaserGame(game: Phaser.Game | null): void {
  phaserGame = game;
  if (typeof window !== 'undefined') {
    (window as unknown as { __PHASER_GAME__: Phaser.Game | null }).__PHASER_GAME__ = game;
  }
}
