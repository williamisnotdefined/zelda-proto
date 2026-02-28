import { World } from './World.js';

const SIM_TICK_RATE = 60;
const SIM_TICK_MS = 1000 / SIM_TICK_RATE;
const NET_TICK_RATE = 20;
const NET_TICK_MS = 1000 / NET_TICK_RATE;
const MAX_FRAME_DT_MS = 250;

export class GameLoop {
  world: World;
  private intervalId: ReturnType<typeof setInterval> | null;
  private lastTimeMs: number;
  private accumulatorMs: number;
  private networkAccumulatorMs: number;
  private onNetworkTick: (world: World) => void;

  constructor(onNetworkTick: (world: World) => void) {
    this.world = new World();
    this.intervalId = null;
    this.lastTimeMs = Date.now();
    this.accumulatorMs = 0;
    this.networkAccumulatorMs = 0;
    this.onNetworkTick = onNetworkTick;
  }

  start(): void {
    this.lastTimeMs = Date.now();
    this.accumulatorMs = 0;
    this.networkAccumulatorMs = 0;
    this.intervalId = setInterval(() => this.tick(), 1);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    const nowMs = Date.now();
    const frameDtMs = Math.min(nowMs - this.lastTimeMs, MAX_FRAME_DT_MS);
    this.lastTimeMs = nowMs;
    this.accumulatorMs += frameDtMs;
    this.networkAccumulatorMs += frameDtMs;

    try {
      while (this.accumulatorMs >= SIM_TICK_MS) {
        this.world.update(SIM_TICK_MS);
        this.accumulatorMs -= SIM_TICK_MS;
      }

      while (this.networkAccumulatorMs >= NET_TICK_MS) {
        this.onNetworkTick(this.world);
        this.networkAccumulatorMs -= NET_TICK_MS;
      }
    } catch (err) {
      console.error('[GameLoop] Error in tick:', err);
    }
  }
}
