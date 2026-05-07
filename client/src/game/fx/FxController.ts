import Phaser from 'phaser';

const BACKGROUND_MUSIC_VOLUME = 0.02;
const TOASTY_SFX_VOLUME = 0.8;
const TOASTY_MARGIN_TOP = 20;
const TOASTY_MARGIN_RIGHT = 20;
const TOASTY_OFFSCREEN_OFFSET_X = 220;
const TOASTY_SCALE = 0.42;
const TOASTY_DEPTH = 1000;
const TOASTY_SLIDE_IN_DURATION_MS = 120;
const TOASTY_HOLD_DURATION_MS = 550;
const TOASTY_SLIDE_OUT_DURATION_MS = 120;
const SAFE_ZONE_VISUAL_DURATION_MS = 3000;
const DAMAGE_NUMBER_DEPTH = 40;
const DAMAGE_NUMBER_DURATION_MS = 650;
const DAMAGE_NUMBER_RISE_PX = 42;
const DAMAGE_NUMBER_VIEW_MARGIN_PX = 180;

type DamageNumberTone = 'player' | 'enemy';

export class FxController {
  private readonly scene: Phaser.Scene;
  private safeZoneCircle: Phaser.GameObjects.Arc | null = null;
  private safeZoneRing: Phaser.GameObjects.Arc | null = null;
  private safeZoneTimer: Phaser.Time.TimerEvent | null = null;
  private backgroundMusic: Phaser.Sound.BaseSound | null = null;
  private toastyImage: Phaser.GameObjects.Image | null = null;
  private toastyHideTimer: Phaser.Time.TimerEvent | null = null;
  private toastyTween: Phaser.Tweens.Tween | null = null;
  private lastLocalToastyCount: number | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  startBackgroundMusic(): void {
    if (!this.backgroundMusic) {
      this.backgroundMusic =
        this.scene.sound.get('bg_music') ??
        this.scene.sound.add('bg_music', {
          loop: true,
          volume: BACKGROUND_MUSIC_VOLUME,
        });
    }
    if (this.backgroundMusic && !this.backgroundMusic.isPlaying) {
      this.backgroundMusic.play();
    }
  }

  createSafeZoneAt(x: number, y: number, radius: number): void {
    this.destroySafeZone();

    this.safeZoneCircle = this.scene.add.circle(x, y, radius, 0x44ff44, 0.15);
    this.safeZoneCircle.setDepth(0);
    this.safeZoneCircle.setScrollFactor(1, 1);

    this.safeZoneRing = this.scene.add.circle(x, y, radius);
    this.safeZoneRing.setStrokeStyle(3, 0x44ff44, 0.5);
    this.safeZoneRing.setDepth(0);
    this.safeZoneRing.setScrollFactor(1, 1);

    this.safeZoneTimer = this.scene.time.delayedCall(SAFE_ZONE_VISUAL_DURATION_MS, () => {
      this.destroySafeZone();
    });
  }

  destroySafeZone(): void {
    if (this.safeZoneCircle) {
      this.safeZoneCircle.destroy();
      this.safeZoneCircle = null;
    }
    if (this.safeZoneRing) {
      this.safeZoneRing.destroy();
      this.safeZoneRing = null;
    }
    if (this.safeZoneTimer) {
      this.safeZoneTimer.destroy();
      this.safeZoneTimer = null;
    }
  }

  handleLocalToastyCounter(toastyCount: number): void {
    if (this.lastLocalToastyCount === null) {
      this.lastLocalToastyCount = toastyCount;
      return;
    }

    if (toastyCount > this.lastLocalToastyCount) {
      this.playToastyEffect();
    }

    this.lastLocalToastyCount = toastyCount;
  }

  resetLocalToastyCounter(): void {
    this.lastLocalToastyCount = null;
  }

  spawnFloatingDamage(x: number, y: number, amount: number, tone: DamageNumberTone): void {
    if (amount <= 0 || !this.isWithinDamageNumberView(x, y)) {
      return;
    }

    const text = this.scene.add.text(x + Phaser.Math.Between(-10, 10), y - 26, String(amount), {
      fontSize: '18px',
      fontStyle: 'bold',
      color: tone === 'player' ? '#ff6b6b' : '#ffffff',
      stroke: '#111111',
      strokeThickness: 4,
    });
    text.setOrigin(0.5, 1);
    text.setDepth(DAMAGE_NUMBER_DEPTH);

    this.scene.tweens.add({
      targets: text,
      x: text.x + Phaser.Math.FloatBetween(-6, 6),
      y: text.y - DAMAGE_NUMBER_RISE_PX,
      alpha: 0,
      duration: DAMAGE_NUMBER_DURATION_MS,
      ease: 'Cubic.Out',
      onComplete: () => {
        text.destroy();
      },
    });
  }

  destroy(): void {
    this.destroySafeZone();
    if (this.toastyTween) {
      this.toastyTween.stop();
      this.toastyTween = null;
    }
    if (this.toastyHideTimer) {
      this.toastyHideTimer.destroy();
      this.toastyHideTimer = null;
    }
    if (this.toastyImage) {
      this.toastyImage.destroy();
      this.toastyImage = null;
    }
    this.lastLocalToastyCount = null;
  }

  private playToastyEffect(): void {
    this.scene.sound.play('toasty_sfx', { volume: TOASTY_SFX_VOLUME });

    const cam = this.scene.cameras.main;
    const toastyVisibleX = cam.width - TOASTY_MARGIN_RIGHT;
    const toastyHiddenX = cam.width + TOASTY_OFFSCREEN_OFFSET_X;
    const toastyY = TOASTY_MARGIN_TOP;

    if (!this.toastyImage) {
      this.toastyImage = this.scene.add.image(toastyHiddenX, toastyY, 'toasty');
      this.toastyImage.setScrollFactor(0, 0);
      this.toastyImage.setOrigin(1, 0);
      this.toastyImage.setDepth(TOASTY_DEPTH);
    }

    this.toastyImage.setPosition(toastyHiddenX, toastyY);
    this.toastyImage.setAlpha(1);
    this.toastyImage.setScale(TOASTY_SCALE);

    if (this.toastyTween) {
      this.toastyTween.stop();
      this.toastyTween = null;
    }

    if (this.toastyHideTimer) {
      this.toastyHideTimer.destroy();
      this.toastyHideTimer = null;
    }

    this.toastyTween = this.scene.tweens.add({
      targets: this.toastyImage,
      x: toastyVisibleX,
      duration: TOASTY_SLIDE_IN_DURATION_MS,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.toastyTween = null;
      },
    });

    this.toastyHideTimer = this.scene.time.delayedCall(TOASTY_HOLD_DURATION_MS, () => {
      if (!this.toastyImage) {
        this.toastyHideTimer = null;
        return;
      }

      this.toastyTween = this.scene.tweens.add({
        targets: this.toastyImage,
        x: toastyHiddenX,
        duration: TOASTY_SLIDE_OUT_DURATION_MS,
        ease: 'Cubic.In',
        onComplete: () => {
          if (this.toastyImage) {
            this.toastyImage.destroy();
            this.toastyImage = null;
          }
          this.toastyTween = null;
        },
      });
      this.toastyHideTimer = null;
    });
  }

  private isWithinDamageNumberView(x: number, y: number): boolean {
    const view = this.scene.cameras.main.worldView;
    return (
      x >= view.left - DAMAGE_NUMBER_VIEW_MARGIN_PX &&
      x <= view.right + DAMAGE_NUMBER_VIEW_MARGIN_PX &&
      y >= view.top - DAMAGE_NUMBER_VIEW_MARGIN_PX &&
      y <= view.bottom + DAMAGE_NUMBER_VIEW_MARGIN_PX
    );
  }
}
