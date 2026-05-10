import Phaser from 'phaser';

const SPIKED_BALL_COUNT = 8;
const SPIKES_PER_BALL = 8;
const ORBIT_RADIUS = 240;
const ORBIT_Y_SCALE = 0.66;
const BALL_RADIUS = 13;
const SPIKE_RADIUS = 4;
const GLOW_RADIUS = 28;
const ORBIT_SPEED_RAD_PER_MS = 0.00125;
const SPIN_SPEED_RAD_PER_MS = 0.0048;
const IRON_COLOR = 0x59565c;
const IRON_DARK_COLOR = 0x252329;
const IRON_HIGHLIGHT_COLOR = 0xc7c2ba;
const BLOOD_COLOR = 0x8a0710;
const BLOOD_HIGHLIGHT_COLOR = 0xff3a38;

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
  private readonly balls: Phaser.GameObjects.Arc[] = [];
  private readonly glows: Phaser.GameObjects.Arc[] = [];
  private readonly highlights: Phaser.GameObjects.Arc[] = [];
  private readonly spikes: Phaser.GameObjects.Arc[][] = [];
  private elapsedMs = 0;
  private active = false;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < SPIKED_BALL_COUNT; i++) {
      const glow = scene.add.circle(0, 0, GLOW_RADIUS, BLOOD_COLOR, 0);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      glow.setDepth(10.3);
      glow.setVisible(false);
      this.glows.push(glow);

      const ballSpikes: Phaser.GameObjects.Arc[] = [];
      for (let j = 0; j < SPIKES_PER_BALL; j++) {
        const spike = scene.add.circle(0, 0, SPIKE_RADIUS, IRON_DARK_COLOR, 0.95);
        spike.setDepth(10.34);
        spike.setVisible(false);
        ballSpikes.push(spike);
      }
      this.spikes.push(ballSpikes);

      const ball = scene.add.circle(0, 0, BALL_RADIUS, IRON_COLOR, 0.95);
      ball.setDepth(10.36);
      ball.setVisible(false);
      this.balls.push(ball);

      const highlight = scene.add.circle(0, 0, BALL_RADIUS * 0.35, IRON_HIGHLIGHT_COLOR, 0.7);
      highlight.setDepth(10.38);
      highlight.setVisible(false);
      this.highlights.push(highlight);
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
    const coreColor = blendColor(IRON_COLOR, BLOOD_COLOR, bloodTint);
    const spikeColor = blendColor(IRON_DARK_COLOR, BLOOD_COLOR, bloodTint);
    const highlightColor = blendColor(IRON_HIGHLIGHT_COLOR, BLOOD_HIGHLIGHT_COLOR, bloodTint);

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
      ball.setFillStyle(coreColor, 0.95);
      ball.setScale(pulse);

      const highlight = this.highlights[i];
      highlight.setPosition(sx - 4 * pulse, sy - 5 * pulse);
      highlight.setFillStyle(highlightColor, 0.42 + bloodFade * 0.22);
      highlight.setScale(pulse);

      const ballSpikes = this.spikes[i];
      for (let j = 0; j < SPIKES_PER_BALL; j++) {
        const spikeAngle = spinAngle + i * 0.45 + (j / SPIKES_PER_BALL) * Math.PI * 2;
        const spikeDistance = BALL_RADIUS + 4;
        const spike = ballSpikes[j];
        spike.setPosition(
          sx + Math.cos(spikeAngle) * spikeDistance * pulse,
          sy + Math.sin(spikeAngle) * spikeDistance * pulse
        );
        spike.setFillStyle(spikeColor, 0.9);
        spike.setScale(0.9 + bloodFade * 0.25);
      }
    }
  }

  destroy(): void {
    for (const glow of this.glows) glow.destroy();
    for (const ball of this.balls) ball.destroy();
    for (const highlight of this.highlights) highlight.destroy();
    for (const ballSpikes of this.spikes) {
      for (const spike of ballSpikes) spike.destroy();
    }
  }

  private setVisible(visible: boolean): void {
    for (const glow of this.glows) glow.setVisible(visible);
    for (const ball of this.balls) ball.setVisible(visible);
    for (const highlight of this.highlights) highlight.setVisible(visible);
    for (const ballSpikes of this.spikes) {
      for (const spike of ballSpikes) spike.setVisible(visible);
    }
  }
}
