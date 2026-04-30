import { describe, expect, it, vi } from 'vitest';
import {
  INSTANCE_IDS,
  ENEMY_KINDS,
  HAZARD_KINDS,
  PORTAL_KINDS,
  PROTOCOL_VERSION,
} from '@gelehka/shared';
import { Blob } from '../src/entities/Blob';
import { World } from '../src/game/World';
import type { BossActorEntity } from '../src/game/World';
import { SpawnSystem } from '../src/game/systems/SpawnSystem';
import { BossRegionSystem } from '../src/game/systems/BossRegionSystem';

function createTestWorld(): World {
  return new World({
    instanceId: INSTANCE_IDS.PHASE1,
    spawnX: 0,
    spawnY: 0,
    primaryEnemyKind: ENEMY_KINDS.BLOB,
    spawnSystem: new SpawnSystem({
      enemiesPerChunk: 0,
      activeRange: 0,
      despawnTimeMs: Number.MAX_SAFE_INTEGER,
    }),
    bossRegionSystem: new BossRegionSystem<BossActorEntity>({
      enableRegionSpawns: false,
      regionSize: 1,
      activeRange: 1,
      despawnTimeMs: 1,
      keyPrefix: 'test_boss_region',
      bossPrefix: 'test_boss',
      createBoss: (() => {
        throw new Error('Unexpected boss spawn in test world');
      }) as (id: string, x: number, y: number) => BossActorEntity,
      updateBoss: () => {
        return;
      },
    }),
  });
}

describe('World.update ordering', () => {
  it('moves the player before resolving portal overlaps in the same tick', () => {
    const world = createTestWorld();
    const player = world.addPlayer('player-1', 'Link', 0, 0);
    player.safeZoneTimer = 0;

    world.spawnPortal({
      kind: PORTAL_KINDS.PHASE1_TO_PHASE2,
      x: 30,
      y: 0,
      toInstanceId: INSTANCE_IDS.PHASE2,
      targetX: 500,
      targetY: 600,
    });
    world.handleInput(player.id, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'input',
      seq: 1,
      up: false,
      down: false,
      left: false,
      right: true,
      attack: false,
      wave: false,
    });

    world.update(200);

    expect(world.consumeTransferRequests()).toEqual([
      {
        playerId: player.id,
        toInstanceId: INSTANCE_IDS.PHASE2,
        targetX: 500,
        targetY: 600,
      },
    ]);
  });

  it('moves the player before resolving hazard damage in the same tick', () => {
    const world = createTestWorld();
    const player = world.addPlayer('player-1', 'Link', 0, 0);
    player.safeZoneTimer = 0;
    world.hazards.set('hazard-1', {
      id: 'hazard-1',
      x: 7.5,
      y: 0,
      kind: HAZARD_KINDS.FIRE_FIELD,
      ttlMs: 1800,
      damage: 5,
      burningTicks: 3,
      hitPlayerIds: new Set<string>(),
    });
    world.handleInput(player.id, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'input',
      seq: 1,
      up: false,
      down: false,
      left: false,
      right: true,
      attack: false,
      wave: false,
    });

    world.update(200);

    expect(player.hp).toBe(player.maxHp - 5);
    expect(player.burningTicksRemaining).toBe(3);
  });

  it('lets drops be created before minion cleanup removes dead enemies on the next tick', () => {
    const world = createTestWorld();
    const minion = new Blob('minion-1', 100, 100, 'minion');
    minion.respawnEnabled = false;
    minion.state = 'dead';
    minion.hasDropped = false;

    world.getEnemyStore(ENEMY_KINDS.BLOB).set(minion.id, minion);
    world.add(minion);

    vi.spyOn(Math, 'random').mockReturnValue(0);

    world.update(0);
    expect(world.getEnemyStore(ENEMY_KINDS.BLOB).has(minion.id)).toBe(true);
    expect(minion.hasDropped).toBe(true);
    expect(world.drops.size).toBe(1);

    world.update(0);
    expect(world.getEnemyStore(ENEMY_KINDS.BLOB).has(minion.id)).toBe(false);

    vi.restoreAllMocks();
  });
});
