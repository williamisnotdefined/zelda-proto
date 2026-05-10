import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Keyboard: {
        KeyCodes: {
          A: 65,
          D: 68,
          E: 69,
          F: 70,
          G: 71,
          Q: 81,
          R: 82,
          S: 83,
          T: 84,
          W: 87,
        },
      },
    },
  },
}));

import { PLAYER_SPIKED_BALLS_COOLDOWN, PLAYER_WAVE_COOLDOWN } from '@/game-core';
import type { PlayerEntity } from '../../entities/Player';
import type { GameConnection } from '../../network/gameConnection';
import { LocalInputController } from './LocalInputController';

const KEY_Q = 81;
const KEY_G = 71;

type FakeKey = { isDown: boolean };

function createController({
  canSendResult = true,
  sendResult = true,
}: {
  canSendResult?: boolean;
  sendResult?: boolean;
} = {}) {
  const cursors = {
    up: { isDown: false },
    down: { isDown: false },
    left: { isDown: false },
    right: { isDown: false },
  };
  const keys = new Map<number, FakeKey>();
  const cooldownSetters = {
    setWaveCooldownEndsAt: vi.fn(),
    setNumbCooldownEndsAt: vi.fn(),
    setPullCooldownEndsAt: vi.fn(),
    setVenomCooldownEndsAt: vi.fn(),
    setConfusionCooldownEndsAt: vi.fn(),
    setDashCooldownEndsAt: vi.fn(),
    setGrenadeCooldownEndsAt: vi.fn(),
    setMolotovCooldownEndsAt: vi.fn(),
    setLandmineCooldownEndsAt: vi.fn(),
    setShurikenCooldownEndsAt: vi.fn(),
    setSpikedBallsCooldownEndsAt: vi.fn(),
  };
  const connection = {
    canSend: vi.fn(() => canSendResult),
    send: vi.fn(() => sendResult),
  } as unknown as GameConnection;
  const scene = {
    input: {
      keyboard: {
        createCursorKeys: () => cursors,
        addKey: (keyCode: number) => {
          const key = { isDown: false };
          keys.set(keyCode, key);
          return key;
        },
      },
    },
    time: {
      now: 123,
    },
  };

  const controller = new LocalInputController(
    scene as never,
    connection,
    cooldownSetters.setWaveCooldownEndsAt,
    cooldownSetters.setNumbCooldownEndsAt,
    cooldownSetters.setPullCooldownEndsAt,
    cooldownSetters.setVenomCooldownEndsAt,
    cooldownSetters.setConfusionCooldownEndsAt,
    cooldownSetters.setDashCooldownEndsAt,
    cooldownSetters.setGrenadeCooldownEndsAt,
    cooldownSetters.setMolotovCooldownEndsAt,
    cooldownSetters.setLandmineCooldownEndsAt,
    cooldownSetters.setShurikenCooldownEndsAt,
    cooldownSetters.setSpikedBallsCooldownEndsAt
  );

  return {
    controller,
    cursors,
    keys,
    connection,
    cooldownSetters,
  };
}

function createLocalEntity(): PlayerEntity {
  return {
    serverState: 'idle',
    serverDirection: 'right',
    targetX: 10,
    targetY: 20,
  } as PlayerEntity;
}

describe('LocalInputController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not start ability cooldowns while UI input is blocked', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const { controller, keys, cooldownSetters } = createController();
    const localEntity = createLocalEntity();

    keys.get(KEY_Q)!.isDown = true;
    controller.update(16, localEntity, true, null);

    expect(cooldownSetters.setWaveCooldownEndsAt).not.toHaveBeenCalled();
  });

  it('does not predict or consume cooldown when sending fails', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const { controller, cursors, keys, connection, cooldownSetters } = createController({
      canSendResult: true,
      sendResult: false,
    });
    const localEntity = createLocalEntity();

    cursors.right.isDown = true;
    keys.get(KEY_Q)!.isDown = true;
    controller.update(16, localEntity, false, null);

    expect(localEntity.targetX).toBe(10);
    expect(connection.send).toHaveBeenCalledTimes(1);
    expect(cooldownSetters.setWaveCooldownEndsAt).not.toHaveBeenCalled();
  });

  it('predicts and starts cooldown only after input is sent', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const { controller, cursors, keys, cooldownSetters } = createController();
    const localEntity = createLocalEntity();

    cursors.right.isDown = true;
    keys.get(KEY_Q)!.isDown = true;
    controller.update(16, localEntity, false, null);

    expect(localEntity.targetX).toBeGreaterThan(10);
    expect(cooldownSetters.setWaveCooldownEndsAt).toHaveBeenCalledWith(
      1_000 + PLAYER_WAVE_COOLDOWN
    );
  });

  it('clears the internal spiked balls cooldown on reset', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const { controller, keys, connection, cooldownSetters } = createController();
    const localEntity = createLocalEntity();

    keys.get(KEY_G)!.isDown = true;
    controller.update(16, localEntity, false, null);
    expect(cooldownSetters.setSpikedBallsCooldownEndsAt).toHaveBeenCalledWith(
      1_000 + PLAYER_SPIKED_BALLS_COOLDOWN
    );

    controller.reset();
    vi.mocked(connection.send).mockClear();
    cooldownSetters.setSpikedBallsCooldownEndsAt.mockClear();

    controller.update(16, localEntity, false, null);

    expect(connection.send).toHaveBeenCalledTimes(1);
    expect(connection.send).toHaveBeenCalledWith(expect.objectContaining({ spikedBalls: true }));
    expect(cooldownSetters.setSpikedBallsCooldownEndsAt).toHaveBeenCalledWith(
      1_000 + PLAYER_SPIKED_BALLS_COOLDOWN
    );
  });
});
