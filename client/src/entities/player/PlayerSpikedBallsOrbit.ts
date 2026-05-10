import Phaser from 'phaser';

const SPIKED_BALL_COUNT = 8;
const ORBIT_RADIUS = 240;
const ORBIT_Y_SCALE = 0.66;
const DISPLAY_SIZE = 52;
const GLOW_RADIUS = 34;
const ORBIT_SPEED_RAD_PER_MS = 0.00125;
const SPIN_SPEED_RAD_PER_MS = 0.0048;
const BLOOD_COLOR = 0x8a0710;

function blendColor(from: number, to: number, amount: number): number {
  const t = Math.max(0, Math.min(1, amount));
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return (r << 16) | (g << 8) | b;
}

export class PlayerSpikedBallsOrbit {
  private readonly balls: Phaser.GameObjects.Sprite[] = [];
  private readonly glows: Phaser.GameObjects.Arc[] = [];
  private elapsedMs = 0;
  private active = false;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < SPIKED_BALL_COUNT; i++) {
      const glow = scene.add.circle(0, 0, GLOW_RADIUS, BLOOD_COLOR, 0);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      glow.setDepth(10.3);
      glow.setVisible(false);
      this.glows.push(glow);

      const ball = scene.add.sprite(0, 0, 'spiked_ball');
      ball.setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE);
      ball.setDepth(10.36);
      ball.setVisible(false);
      this.balls.push(ball);
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
    const bloodFade = (Math.sin(this.elapsedMs * 0.0042) + 1) / 2;
    const bloodTint = bloodFade * bloodFade;
    const spriteTint = blendColor(0xffffff, BLOOD_COLOR, bloodTint);

    for (let i = 0; i < SPIKED_BALL_COUNT; i++) {
      const angle = orbitAngle + (i / SPIKED_BALL_COUNT) * Math.PI * 2;
      const pulse = 0.92 + Math.sin(this.elapsedMs * 0.005 + i * 0.7) * 0.08;
      const sx = x + Math.cos(angle) * ORBIT_RADIUS;
      const sy = y + Math.sin(angle) * ORBIT_RADIUS * ORBIT_Y_SCALE;

      const glow = this.glows[i];
      glow.setPosition(sx, sy);
      glow.setFillStyle(BLOOD_COLOR, (0.08 + bloodFade * 0.24) * pulse);
      glow.setScale(0.85 + bloodFade * 0.35);

      const ball = this.balls[i];
      ball.setPosition(sx, sy);
      ball.setRotation(-spinAngle + i * 0.35);
      ball.setTint(spriteTint);
      ball.setAlpha(0.9 + bloodFade * 0.1);
      ball.setDisplaySize(DISPLAY_SIZE * pulse, DISPLAY_SIZE * pulse);
    }
  }

  destroy(): void {
    for (const glow of this.glows) glow.destroy();
    for (const ball of this.balls) ball.destroy();
  }

  private setVisible(visible: boolean): void {
    for (const glow of this.glows) glow.setVisible(visible);
    for (const ball of this.balls) ball.setVisible(visible);
  }
}
