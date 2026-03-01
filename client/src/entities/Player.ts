import Phaser from 'phaser';
import type { PlayerStatusSnapshot } from '@gelehka/shared';

const REMOTE_LERP_BASE = 0.3;
const LOCAL_LERP_BASE = 0.48;
const SNAP_THRESHOLD = 200; // px – teleport/respawn threshold
const MAX_LERP_DT_MS = 50;
// Offset the sprite DOWN so the character body visually centers on the server hitbox
const SPRITE_Y_OFFSET = -16;
const FIRE_FIELD_GIF_PATH = '/assets/sprites/fields/Fire_Field.gif';
const CONTACT_SHADOW_RADIUS = 24;
const CONTACT_SHADOW_COLOR = 0x000000;
const CONTACT_SHADOW_ALPHA = 0.3;
const ATTACK_SHADOW_COLOR = 0x000000;
const ATTACK_SHADOW_BASE_ALPHA = 0.38;
const ATTACK_SHADOW_PULSE_ALPHA = 0.62;
const ATTACK_SHADOW_PULSE_DURATION_MS = 140;
const ATTACK_CONE_RADIUS = 24;
const ATTACK_CONE_SPAN_DEG = 110;
const ATTACK_RANGE_UP = 20;
const ATTACK_RANGE_DOWN = 28;
const ATTACK_RANGE_LEFT = 24;
const ATTACK_RANGE_RIGHT = 24;

export class PlayerEntity {
  sprite: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  isLocal: boolean;
  targetX: number;
  targetY: number;
  serverState: string;
  serverDirection: string;
  hp: number;
  maxHp: number;
  nickname: string;
  statusEffects: PlayerStatusSnapshot;

  private currentAnimKey: string;
  private deathPlayed: boolean;
  private contactShadow: Phaser.GameObjects.Arc;
  private burningOverlay: Phaser.GameObjects.DOMElement;
  private attackShadow: Phaser.GameObjects.Arc;
  private attackShadowTween: Phaser.Tweens.Tween | null;
  private wasAttacking: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, isLocal: boolean, nickname: string) {
    this.isLocal = isLocal;
    this.targetX = x;
    this.targetY = y;
    this.serverState = 'idle';
    this.serverDirection = 'down';
    this.hp = 100;
    this.maxHp = 100;
    this.currentAnimKey = '';
    this.deathPlayed = false;
    this.attackShadowTween = null;
    this.wasAttacking = false;
    this.nickname = nickname;
    this.statusEffects = {};
    this.sprite = scene.add.sprite(x, y + SPRITE_Y_OFFSET, 'player');
    this.sprite.setScale(2);
    this.sprite.setDepth(10);

    this.contactShadow = scene.add.circle(
      x,
      y,
      CONTACT_SHADOW_RADIUS,
      CONTACT_SHADOW_COLOR,
      CONTACT_SHADOW_ALPHA
    );
    this.contactShadow.setDepth(8.5);

    this.hpBarBg = scene.add.rectangle(x, y - 26, 32, 4, 0x333333);
    this.hpBarBg.setDepth(11);

    this.hpBar = scene.add.rectangle(x, y - 26, 32, 4, 0x44ff44);
    this.hpBar.setDepth(12);

    const burningImg = document.createElement('img');
    burningImg.src = FIRE_FIELD_GIF_PATH;
    burningImg.alt = 'Burning effect';
    burningImg.draggable = false;
    burningImg.style.width = '58px';
    burningImg.style.height = '58px';
    burningImg.style.pointerEvents = 'none';
    burningImg.style.userSelect = 'none';
    burningImg.style.opacity = '0.65';

    this.burningOverlay = scene.add.dom(x, y + SPRITE_Y_OFFSET, burningImg);
    this.burningOverlay.setDepth(13);
    this.burningOverlay.setOrigin(0.5, 0.5);
    this.burningOverlay.setVisible(false);

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
    this.attackShadow.setDepth(9);
    this.attackShadow.setVisible(false);

    if (isLocal) {
      this.sprite.setTint(0xaaffaa);
    }
  }

  updateFromServer(
    x: number,
    y: number,
    hp: number,
    maxHp: number,
    state: string,
    direction: string,
    statusEffects: PlayerStatusSnapshot = {}
  ): void {
    const targetSpriteY = y + SPRITE_Y_OFFSET;

    if (this.isLocal) {
      const dx = x - this.sprite.x;
      const dy = targetSpriteY - this.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > SNAP_THRESHOLD) {
        this.sprite.x = x;
        this.sprite.y = targetSpriteY;
      }
    }

    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.serverDirection = direction;
    this.statusEffects = statusEffects;
  }

  update(_scene: Phaser.Scene, dt: number): void {
    const dtMs = Math.min(dt, MAX_LERP_DT_MS);

    if (this.isLocal) {
      const factor = 1 - Math.pow(1 - LOCAL_LERP_BASE, dtMs / 16.667);
      this.sprite.x += (this.targetX - this.sprite.x) * factor;
      this.sprite.y += (this.targetY + SPRITE_Y_OFFSET - this.sprite.y) * factor;
    } else {
      // Remote players: time-based exponential lerp (frame-rate independent)
      const factor = 1 - Math.pow(1 - REMOTE_LERP_BASE, dtMs / 16.667);
      this.sprite.x += (this.targetX - this.sprite.x) * factor;
      this.sprite.y += (this.targetY + SPRITE_Y_OFFSET - this.sprite.y) * factor;
    }

    this.hpBarBg.x = this.sprite.x;
    this.hpBarBg.y = this.sprite.y - 26;
    this.contactShadow.x = this.sprite.x;
    this.contactShadow.y = this.sprite.y - SPRITE_Y_OFFSET;
    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBar.width = 32 * hpRatio;
    this.hpBar.x = this.sprite.x - (32 - this.hpBar.width) / 2;
    this.hpBar.y = this.sprite.y - 26;
    this.hpBar.fillColor = hpRatio > 0.5 ? 0x44ff44 : hpRatio > 0.25 ? 0xffaa00 : 0xff4444;

    this.burningOverlay.x = this.sprite.x;
    this.burningOverlay.y = this.sprite.y;
    this.burningOverlay.setVisible(Boolean(this.statusEffects.burning));
    this.contactShadow.setVisible(this.serverState !== 'dead');

    this.updateAttackShadow();

    this.updateAnimation();
  }

  private updateAttackShadow(): void {
    const attacking = this.serverState === 'attacking';
    const alive = this.serverState !== 'dead';
    const visible = alive && attacking;

    if (!visible) {
      this.attackShadow.setVisible(false);
      this.wasAttacking = false;
      return;
    }

    const baseX = this.sprite.x;
    const baseY = this.sprite.y - SPRITE_Y_OFFSET;
    let hitX = baseX;
    let hitY = baseY;

    switch (this.serverDirection) {
      case 'up':
        hitY -= ATTACK_RANGE_UP;
        break;
      case 'down':
        hitY += ATTACK_RANGE_DOWN;
        break;
      case 'left':
        hitX -= ATTACK_RANGE_LEFT;
        break;
      case 'right':
        hitX += ATTACK_RANGE_RIGHT;
        break;
    }

    this.attackShadow.setPosition(hitX, hitY);
    const rotationDeg =
      this.serverDirection === 'up'
        ? -90
        : this.serverDirection === 'down'
          ? 90
          : this.serverDirection === 'left'
            ? 180
            : 0;
    this.attackShadow.setAngle(rotationDeg);
    this.attackShadow.setVisible(true);

    if (!this.wasAttacking) {
      this.pulseAttackShadow();
    }
    this.wasAttacking = true;
  }

  private pulseAttackShadow(): void {
    this.attackShadowTween?.stop();
    this.attackShadow.setFillStyle(ATTACK_SHADOW_COLOR, ATTACK_SHADOW_PULSE_ALPHA);
    this.attackShadowTween = this.sprite.scene.tweens.add({
      targets: this.attackShadow,
      alpha: ATTACK_SHADOW_BASE_ALPHA,
      duration: ATTACK_SHADOW_PULSE_DURATION_MS,
      ease: 'Sine.Out',
      onComplete: () => {
        this.attackShadowTween = null;
      },
    });
  }

  private updateAnimation(): void {
    const dir = this.serverDirection;
    const state = this.serverState;

    let animKey: string;
    let flipX = false;

    if (state === 'dead') {
      animKey = 'player_death';
      if (!this.deathPlayed) {
        this.sprite.setAlpha(1);
        this.sprite.play(animKey);
        this.deathPlayed = true;
        this.currentAnimKey = animKey;
      }
      return;
    }

    this.deathPlayed = false;
    this.sprite.setAlpha(1);

    const dirSuffix = dir === 'left' ? 'right' : dir;
    flipX = dir === 'left';

    if (state === 'attacking') {
      animKey = `player_attack_${dirSuffix}`;
      // Don't restart attack anim if already playing one
      if (this.currentAnimKey.startsWith('player_attack_') && this.sprite.anims.isPlaying) {
        this.sprite.setFlipX(flipX);
        return;
      }
    } else if (state === 'moving') {
      animKey = `player_move_${dirSuffix}`;
    } else {
      animKey = `player_idle_${dirSuffix}`;
    }

    this.sprite.setFlipX(flipX);

    if (this.currentAnimKey !== animKey) {
      this.sprite.play(animKey);
      this.currentAnimKey = animKey;
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.contactShadow.destroy();
    this.attackShadowTween?.stop();
    this.attackShadow.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
    this.burningOverlay.destroy();
  }
}
