import { afterEach, describe, expect, it } from 'vitest';
import { INSTANCE_IDS } from '@gelehka/shared';
import { WORLD_SPAWN_X, WORLD_SPAWN_Y } from '@gelehka/shared/constants';
import { InstanceManager } from '../src/game/InstanceManager';

const originalDevStartPhase = process.env.DEV_START_PHASE;

afterEach(() => {
  if (originalDevStartPhase === undefined) {
    delete process.env.DEV_START_PHASE;
    return;
  }

  process.env.DEV_START_PHASE = originalDevStartPhase;
});

describe('InstanceManager', () => {
  it('transfers the same player object between instances', () => {
    process.env.DEV_START_PHASE = INSTANCE_IDS.PHASE2;

    const instances = new InstanceManager();
    const player = instances.addPlayer('player-1', 'Link');
    player.x = WORLD_SPAWN_X;
    player.y = WORLD_SPAWN_Y;

    instances.update(0);

    expect(instances.getInstanceForPlayer(player.id)).toBe(INSTANCE_IDS.PHASE1);
    expect(instances.phase2World.players.has(player.id)).toBe(false);
    expect(instances.phase1World.players.get(player.id)).toBe(player);
    expect(instances.getPlayerById(player.id)).toBe(player);
  });
});
