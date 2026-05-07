import Phaser from 'phaser';

export class PlayerAnimationController {
  private currentAnimKey = '';
  private deathPlayed = false;

  update(sprite: Phaser.GameObjects.Sprite, state: string, direction: string): void {
    let animKey: string;
    let flipX = false;

    if (state === 'dead') {
      animKey = 'player_death';
      if (!this.deathPlayed) {
        sprite.setAlpha(1);
        sprite.play(animKey);
        this.deathPlayed = true;
        this.currentAnimKey = animKey;
      }
      return;
    }

    this.deathPlayed = false;
    sprite.setAlpha(1);

    const dirSuffix = direction === 'left' ? 'right' : direction;
    flipX = direction === 'left';

    if (state === 'moving') {
      animKey = `player_move_${dirSuffix}`;
    } else {
      animKey = `player_idle_${dirSuffix}`;
    }

    sprite.setFlipX(flipX);
    if (this.currentAnimKey !== animKey) {
      sprite.play(animKey);
      this.currentAnimKey = animKey;
    }
  }
}
