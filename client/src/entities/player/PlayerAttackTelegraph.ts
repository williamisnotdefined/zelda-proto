import {
  PLAYER_ATTACK_RANGE_DOWN,
  PLAYER_ATTACK_RANGE_LEFT,
  PLAYER_ATTACK_RANGE_RIGHT,
  PLAYER_ATTACK_RANGE_UP,
} from '@/game-core/player';
import Phaser from 'phaser';
import {
  ATTACK_CONE_RADIUS,
  ATTACK_CONE_SPAN_DEG,
  ATTACK_SHADOW_BASE_ALPHA,
  ATTACK_SHADOW_COLOR,
  ATTACK_SHADOW_PULSE_ALPHA,
  ATTACK_SHADOW_PULSE_DURATION_MS,
  ATTACK_SHADOW_STROKE_ALPHA,
  ATTACK_SHADOW_STROKE_COLOR,
} from './playerVisualConfig';

export class PlayerAttackTelegraph {
  private readonly attackShadow: Phaser.GameObjects.Arc;
  private attackShadowTween: Phaser.Tweens.Tween | null = null;
  private wasAttacking = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.attackShadow = scene.add.arc(
      x,
      y,
      ATTACK_CONE_RADIUS,
      -ATTACK_CONE_SPAN_DEG / 2,
      ATTACK_CONE_SPAN_DEG / 2,
      false,
      ATTACK_SHADOW_COLOR,
      ATTACK_SHADOW_BASE_ALPHA
    );
    this.attackShadow.setStrokeStyle(2, ATTACK_SHADOW_STROKE_COLOR, ATTACK_SHADOW_STROKE_ALPHA);
    this.attackShadow.setBlendMode(Phaser.BlendModes.ADD);
    this.attackShadow.setDepth(9);
    this.attackShadow.setVisible(false);
  }

  sync(baseX: number, baseY: number, state: string, direction: string): void {
    const visible = state !== 'dead' && state === 'attacking';
    if (!visible) {
      this.attackShadow.setVisible(false);
      this.wasAttacking = false;
      return;
    }

    let hitX = baseX;
    let hitY = baseY;
    switch (direction) {
      case 'up':
        hitY -= PLAYER_ATTACK_RANGE_UP;
        break;
      case 'down':
        hitY += PLAYER_ATTACK_RANGE_DOWN;
        break;
      case 'left':
        hitX -= PLAYER_ATTACK_RANGE_LEFT;
        break;
      case 'right':
        hitX += PLAYER_ATTACK_RANGE_RIGHT;
        break;
    }

    this.attackShadow.setPosition(hitX, hitY);
    this.attackShadow.setAngle(
      direction === 'up' ? -90 : direction === 'down' ? 90 : direction === 'left' ? 180 : 0
    );
    this.attackShadow.setVisible(true);

    if (!this.wasAttacking) {
      this.pulse();
    }
    this.wasAttacking = true;
  }

  destroy(): void {
    this.attackShadowTween?.stop();
    this.attackShadow.destroy();
  }

  private pulse(): void {
    this.attackShadowTween?.stop();
    this.attackShadow.setFillStyle(ATTACK_SHADOW_COLOR, ATTACK_SHADOW_PULSE_ALPHA);
    this.attackShadowTween = this.attackShadow.scene.tweens.add({
      targets: this.attackShadow,
      alpha: ATTACK_SHADOW_BASE_ALPHA,
      duration: ATTACK_SHADOW_PULSE_DURATION_MS,
      ease: 'Sine.Out',
      onComplete: () => {
        this.attackShadowTween = null;
      },
    });
  }
}
