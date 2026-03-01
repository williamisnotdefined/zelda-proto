import {
  SERVER_MAX_FRAME_DT_MS,
  SERVER_NET_TICK_RATE,
  SERVER_SIM_TICK_RATE,
} from '@gelehka/shared/constants';
import { performance } from 'node:perf_hooks';
import { InstanceManager } from './InstanceManager.js';

const SIM_TICK_MS = 1000 / SERVER_SIM_TICK_RATE;
const NET_TICK_MS = 1000 / SERVER_NET_TICK_RATE;
const METRICS_LOG_INTERVAL_MS = 5000;

export class GameLoop {
  instances: InstanceManager;
  private timeoutId: ReturnType<typeof setTimeout> | null;
  private running: boolean;
  private lastTimeMs: number;
  private accumulatorMs: number;
  private networkAccumulatorMs: number;
  private nextTickTargetMs: number;
  private lastMetricsLogMs: number;
  private totalTicks: number;
  private slowTicks: number;
  private totalDriftMs: number;
  private maxDriftMs: number;
  private totalUpdateDurationMs: number;
  private onNetworkTick: (instances: InstanceManager) => void;

  constructor(onNetworkTick: (instances: InstanceManager) => void) {
    this.instances = new InstanceManager();
    this.timeoutId = null;
    this.running = false;
    this.lastTimeMs = performance.now();
    this.accumulatorMs = 0;
    this.networkAccumulatorMs = 0;
    this.nextTickTargetMs = this.lastTimeMs;
    this.lastMetricsLogMs = this.lastTimeMs;
    this.totalTicks = 0;
    this.slowTicks = 0;
    this.totalDriftMs = 0;
    this.maxDriftMs = 0;
    this.totalUpdateDurationMs = 0;
    this.onNetworkTick = onNetworkTick;
  }

  start(): void {
    if (this.running) return;

    const nowMs = performance.now();
    this.running = true;
    this.lastTimeMs = nowMs;
    this.accumulatorMs = 0;
    this.networkAccumulatorMs = 0;
    this.nextTickTargetMs = nowMs + SIM_TICK_MS;
    this.lastMetricsLogMs = nowMs;
    this.totalTicks = 0;
    this.slowTicks = 0;
    this.totalDriftMs = 0;
    this.maxDriftMs = 0;
    this.totalUpdateDurationMs = 0;

    this.scheduleNext(0);
  }

  stop(): void {
    this.running = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) return;
    this.timeoutId = setTimeout(() => this.tick(), Math.max(0, delayMs));
  }

  private tick(): void {
    if (!this.running) return;

    const tickStartMs = performance.now();
    const driftMs = tickStartMs - this.nextTickTargetMs;
    const frameDtMs = Math.min(tickStartMs - this.lastTimeMs, SERVER_MAX_FRAME_DT_MS);
    this.lastTimeMs = tickStartMs;
    this.accumulatorMs += frameDtMs;
    this.networkAccumulatorMs += frameDtMs;

    try {
      while (this.accumulatorMs >= SIM_TICK_MS) {
        this.instances.update(SIM_TICK_MS);
        this.accumulatorMs -= SIM_TICK_MS;
      }

      while (this.networkAccumulatorMs >= NET_TICK_MS) {
        this.onNetworkTick(this.instances);
        this.networkAccumulatorMs -= NET_TICK_MS;
      }
    } catch (error) {
      console.error('[GameLoop] Error in tick:', error);
    }

    const tickEndMs = performance.now();
    const updateDurationMs = tickEndMs - tickStartMs;
    this.recordMetrics(driftMs, updateDurationMs, tickEndMs);

    this.nextTickTargetMs += SIM_TICK_MS;
    while (this.nextTickTargetMs < tickEndMs - SIM_TICK_MS) {
      this.nextTickTargetMs += SIM_TICK_MS;
    }

    const nextDelayMs = this.nextTickTargetMs - performance.now();
    this.scheduleNext(nextDelayMs);
  }

  private recordMetrics(driftMs: number, updateDurationMs: number, nowMs: number): void {
    this.totalTicks += 1;
    this.totalDriftMs += Math.abs(driftMs);
    this.maxDriftMs = Math.max(this.maxDriftMs, Math.abs(driftMs));
    this.totalUpdateDurationMs += updateDurationMs;

    if (updateDurationMs > SIM_TICK_MS) {
      this.slowTicks += 1;
      console.warn(
        `[GameLoop] Slow tick: update_duration_ms=${updateDurationMs.toFixed(2)} budget_ms=${SIM_TICK_MS.toFixed(2)} drift_ms=${driftMs.toFixed(2)}`
      );
    }

    if (nowMs - this.lastMetricsLogMs < METRICS_LOG_INTERVAL_MS) {
      return;
    }

    const avgDriftMs = this.totalTicks > 0 ? this.totalDriftMs / this.totalTicks : 0;
    const avgUpdateDurationMs =
      this.totalTicks > 0 ? this.totalUpdateDurationMs / this.totalTicks : 0;

    console.log(
      `[GameLoop] metrics tick_drift_ms=${avgDriftMs.toFixed(2)} max_drift_ms=${this.maxDriftMs.toFixed(2)} update_duration_ms=${avgUpdateDurationMs.toFixed(2)} slow_ticks=${this.slowTicks}/${this.totalTicks}`
    );

    this.lastMetricsLogMs = nowMs;
    this.totalTicks = 0;
    this.slowTicks = 0;
    this.totalDriftMs = 0;
    this.maxDriftMs = 0;
    this.totalUpdateDurationMs = 0;
  }
}
