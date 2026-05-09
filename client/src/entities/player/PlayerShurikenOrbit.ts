import Phaser from 'phaser';

const SHURIKEN_COUNT = 6;
const SPARKLE_COUNT = 18;
const ORBIT_RADIUS = 62;
const SHURIKEN_DISPLAY_SIZE = 30;
const SHURIKEN_GLOW_SIZE = 42;
const ORBIT_SPEED_RAD_PER_MS = 0.0032;
const SPIN_SPEED_RAD_PER_MS = 0.018;
const SPARKLE_ORBIT_SPEED_RAD_PER_MS = 0.0024;
const RAINBOW_TINTS = [0xff5fd8, 0xffb45f, 0xfff56a, 0x78ff8a, 0x59d8ff, 0xad7bff];

export class PlayerShurikenOrbit {
  private readonly shurikens: Phaser.GameObjects.Sprite[] = [];
  private readonly glows: Phaser.GameObjects.Sprite[] = [];
  private readonly sparkles: Phaser.GameObjects.Arc[] = [];
  private elapsedMs = 0;
  private active = false;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < SHURIKEN_COUNT; i++) {
      const glow = scene.add.sprite(0, 0, 'shuriken', i);
      glow.setDisplaySize(SHURIKEN_GLOW_SIZE, SHURIKEN_GLOW_SIZE);
      glow.setAlpha(0.24);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      glow.setDepth(10.28);
      glow.setVisible(false);
      this.glows.push(glow);

      const sprite = scene.add.sprite(0, 0, 'shuriken', i);
      sprite.setDisplaySize(SHURIKEN_DISPLAY_SIZE, SHURIKEN_DISPLAY_SIZE);
      sprite.setBlendMode(Phaser.BlendModes.ADD);
      sprite.setDepth(10.36);
      sprite.setVisible(false);
      this.shurikens.push(sprite);
    }

    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const sparkle = scene.add.circle(0, 0, 2.2, 0xffffff, 0.0);
      sparkle.setBlendMode(Phaser.BlendModes.ADD);
      sparkle.setDepth(10.34);
      sparkle.setVisible(false);
      this.sparkles.push(sparkle);
    }
  }

  sync(active: boolean): void {
    if (this.active === active) {
      return;
    }
    this.active = active;
    this.setVisible(active);
  }

  update(dt: number, x: number, y: number, visible: boolean): void {
    const shouldRender = this.active && visible;
    this.setVisible(shouldRender);
    if (!shouldRender) {
      return;
    }

    this.elapsedMs += dt;
    const orbitAngle = this.elapsedMs * ORBIT_SPEED_RAD_PER_MS;
    const spinAngle = this.elapsedMs * SPIN_SPEED_RAD_PER_MS;

    for (let i = 0; i < SHURIKEN_COUNT; i++) {
      const angle = orbitAngle + (i / SHURIKEN_COUNT) * Math.PI * 2;
      const pulse = 0.78 + Math.sin(this.elapsedMs * 0.006 + i) * 0.12;
      const tint = RAINBOW_TINTS[(Math.floor(this.elapsedMs / 140) + i) % RAINBOW_TINTS.length];
      const sx = x + Math.cos(angle) * ORBIT_RADIUS;
      const sy = y + Math.sin(angle) * ORBIT_RADIUS * 0.72;

      const glow = this.glows[i];
      glow.setPosition(sx, sy);
      glow.setRotation(spinAngle * 0.6 + i);
      glow.setTint(tint);
      glow.setAlpha(0.16 + pulse * 0.14);
      const glowSize = SHURIKEN_GLOW_SIZE * (0.95 + pulse * 0.08);
      glow.setDisplaySize(glowSize, glowSize);

      const sprite = this.shurikens[i];
      sprite.setPosition(sx, sy);
      sprite.setRotation(-spinAngle + i * 0.4);
      sprite.setTint(tint);
      sprite.setAlpha(0.82 + pulse * 0.14);
      const spriteSize = SHURIKEN_DISPLAY_SIZE * (0.92 + pulse * 0.06);
      sprite.setDisplaySize(spriteSize, spriteSize);
    }

    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const angle =
        this.elapsedMs * SPARKLE_ORBIT_SPEED_RAD_PER_MS + (i / SPARKLE_COUNT) * Math.PI * 2;
      const wave = (Math.sin(this.elapsedMs * 0.009 + i * 1.7) + 1) / 2;
      const radius = ORBIT_RADIUS + 6 + Math.sin(this.elapsedMs * 0.004 + i) * 8;
      const sparkle = this.sparkles[i];
      sparkle.setPosition(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.74);
      sparkle.setFillStyle(
        RAINBOW_TINTS[(i + Math.floor(this.elapsedMs / 220)) % RAINBOW_TINTS.length],
        0.18 + wave * 0.48
      );
      sparkle.setScale(0.55 + wave * 0.85);
    }
  }

  destroy(): void {
    for (const sprite of this.shurikens) sprite.destroy();
    for (const glow of this.glows) glow.destroy();
    for (const sparkle of this.sparkles) sparkle.destroy();
  }

  private setVisible(visible: boolean): void {
    for (const sprite of this.shurikens) sprite.setVisible(visible);
    for (const glow of this.glows) glow.setVisible(visible);
    for (const sparkle of this.sparkles) sparkle.setVisible(visible);
  }
}
