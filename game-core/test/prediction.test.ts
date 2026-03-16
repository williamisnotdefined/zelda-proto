import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from '@gelehka/shared';
import { createInputMessage } from '../src/input';
import { getPredictedPosition, reconcilePredictedPosition } from '../src/prediction';
import { PLAYER_ATTACK_SPEED_PENALTY, PLAYER_SPEED } from '../src/player';

function createPlayer(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: 'player-1',
    nickname: 'Link',
    x: 100,
    y: 200,
    hp: 100,
    maxHp: 100,
    state: 'idle',
    direction: 'right',
    playerKills: 0,
    monsterKills: 0,
    deaths: 0,
    toastyCount: 0,
    lastProcessedInputSeq: -1,
    statusEffects: {},
    ...overrides,
  };
}

describe('getPredictedPosition', () => {
  it('replays only fresh unacknowledged inputs', () => {
    const result = getPredictedPosition(
      createPlayer({ x: 0, y: 0, lastProcessedInputSeq: 1 }),
      [
        {
          input: createInputMessage(1, {
            up: false,
            down: false,
            left: false,
            right: true,
            attack: false,
          }),
          dtMs: 16,
          sentAtMs: 980,
        },
        {
          input: createInputMessage(2, {
            up: false,
            down: false,
            left: false,
            right: true,
            attack: false,
          }),
          dtMs: 16,
          sentAtMs: 990,
        },
        {
          input: createInputMessage(3, {
            up: false,
            down: false,
            left: false,
            right: true,
            attack: false,
          }),
          dtMs: 16,
          sentAtMs: -1000,
        },
      ],
      PLAYER_SPEED,
      1000
    );

    expect(result.filteredPending.map((entry) => entry.input.seq)).toEqual([2]);
    expect(result.x).toBeCloseTo(PLAYER_SPEED * (16 / 1000));
    expect(result.y).toBe(0);
  });

  it('replays local attack slowdown with the shared multiplier', () => {
    const result = getPredictedPosition(
      createPlayer({ x: 0, y: 0 }),
      [
        {
          input: createInputMessage(0, {
            up: false,
            down: false,
            left: false,
            right: true,
            attack: true,
          }),
          dtMs: 16,
          sentAtMs: 990,
          speedMultiplier: PLAYER_ATTACK_SPEED_PENALTY,
        },
      ],
      PLAYER_SPEED,
      1000
    );

    expect(result.x).toBeCloseTo(PLAYER_SPEED * PLAYER_ATTACK_SPEED_PENALTY * (16 / 1000));
    expect(result.y).toBe(0);
  });
});

describe('reconcilePredictedPosition', () => {
  it('snaps to the predicted position when the error is too large', () => {
    const result = reconcilePredictedPosition(
      1000,
      createPlayer({ x: 0, y: 0 }),
      [
        {
          input: createInputMessage(0, {
            up: false,
            down: false,
            left: false,
            right: true,
            attack: false,
          }),
          dtMs: 50,
          sentAtMs: 990,
        },
      ],
      { x: -200, y: 0 },
      PLAYER_SPEED,
      { snapDistance: 10 }
    );

    expect(result.x).toBeCloseTo(PLAYER_SPEED * (50 / 1000));
    expect(result.y).toBe(0);
    expect(result.resetAccumulator).toBe(false);
  });

  it('keeps tiny reconciliation errors in the current target deadzone', () => {
    const result = reconcilePredictedPosition(
      1000,
      createPlayer({ x: 0, y: 0 }),
      [],
      { x: 0.25, y: -0.25 },
      PLAYER_SPEED,
      { deadzoneDistance: 1 }
    );

    expect(result.x).toBe(0.25);
    expect(result.y).toBe(-0.25);
    expect(result.resetAccumulator).toBe(false);
  });

  it('resets prediction state immediately when the server player is dead', () => {
    const result = reconcilePredictedPosition(
      1000,
      createPlayer({ x: 40, y: 60, state: 'dead' }),
      [
        {
          input: createInputMessage(0, {
            up: false,
            down: false,
            left: false,
            right: true,
            attack: false,
          }),
          dtMs: 16,
          sentAtMs: 990,
        },
      ],
      { x: 100, y: 120 },
      PLAYER_SPEED
    );

    expect(result).toEqual({
      x: 40,
      y: 60,
      filteredPending: [],
      resetAccumulator: true,
    });
  });
});
