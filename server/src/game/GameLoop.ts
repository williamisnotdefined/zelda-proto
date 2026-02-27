import { World } from './World.js';

const TICK_RATE = 60;
const TICK_INTERVAL = 1000 / TICK_RATE;

export class GameLoop {
  world: World;
  private intervalId: ReturnType<typeof setInterval> | null;
  private lastTime: number;
  private onTick: (world: World) => void;

  constructor(onTick: (world: World) => void) {
    this.world = new World();
    this.intervalId = null;
    this.lastTime = Date.now();
    this.onTick = onTick;
  }

  start(): void {
    this.lastTime = Date.now();
    this.intervalId = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    try {
      this.world.update(dt);
      this.onTick(this.world);
    } catch (err) {
      console.error('[GameLoop] Error in tick:', err);
    }
  }
}
