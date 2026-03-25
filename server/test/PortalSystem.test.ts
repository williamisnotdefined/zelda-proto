import { describe, expect, it } from 'vitest';
import { BOSS_KINDS, INSTANCE_IDS, PORTAL_KINDS } from '@gelehka/shared';
import { DragonLord } from '../src/entities/DragonLord';
import { Player } from '../src/entities/Player';
import { PortalSystem } from '../src/game/systems/PortalSystem';
import type { Portal } from '../src/game/World';

function forEachPlayerInRadius(players: Map<string, Player>) {
  return (_x: number, _y: number, _radius: number, callback: (player: Player) => void): void => {
    for (const player of players.values()) {
      callback(player);
    }
  };
}

describe('PortalSystem', () => {
  it('spawns boss-death portals once and removes them when the source boss disappears', () => {
    const system = new PortalSystem();
    const players = new Map<string, Player>();
    const portals = new Map<string, Portal>();
    const boss = new DragonLord('boss-1', 320, 240);
    boss.takeDamage(boss.hp);

    const bosses = new Map([[boss.id, boss]]);
    const onBossDeathPortal = {
      kind: PORTAL_KINDS.PHASE2_TO_PHASE3,
      sourceBossKinds: [BOSS_KINDS.DRAGON_LORD] as const,
      toInstanceId: INSTANCE_IDS.PHASE3,
      targetX: 640,
      targetY: 480,
      activationDelayMs: 500,
      durationMs: 30000,
    };

    system.update(
      1000,
      players,
      portals,
      bosses,
      forEachPlayerInRadius(players),
      onBossDeathPortal
    );
    expect(portals.size).toBe(1);

    const spawnedPortal = Array.from(portals.values())[0];
    expect(spawnedPortal).toMatchObject({
      x: boss.x,
      y: boss.y,
      kind: PORTAL_KINDS.PHASE2_TO_PHASE3,
      sourceBossId: boss.id,
      toInstanceId: INSTANCE_IDS.PHASE3,
      activeAtMs: 1500,
    });

    bosses.clear();
    system.update(
      1001,
      players,
      portals,
      bosses,
      forEachPlayerInRadius(players),
      onBossDeathPortal
    );
    expect(portals.size).toBe(0);
  });

  it('respects activation delays and portal expiry', () => {
    const system = new PortalSystem();
    const player = new Player('player-1', 100, 200, 'Link');
    const players = new Map([[player.id, player]]);
    const portals = new Map<string, Portal>();

    system.spawnPortal(
      portals,
      {
        kind: PORTAL_KINDS.PHASE2_TO_PHASE1,
        x: 100,
        y: 200,
        toInstanceId: INSTANCE_IDS.PHASE1,
        targetX: 10,
        targetY: 20,
        activationDelayMs: 100,
        durationMs: 150,
      },
      1000
    );

    system.update(1099, players, portals, new Map(), forEachPlayerInRadius(players));
    expect(system.consumeTransferRequests()).toEqual([]);

    system.update(1100, players, portals, new Map(), forEachPlayerInRadius(players));
    expect(system.consumeTransferRequests()).toEqual([
      {
        playerId: player.id,
        toInstanceId: INSTANCE_IDS.PHASE1,
        targetX: 10,
        targetY: 20,
      },
    ]);

    system.update(1151, players, portals, new Map(), forEachPlayerInRadius(players));
    expect(portals.size).toBe(0);
  });

  it('transfers only on enter and waits for cooldown to clear before retriggering', () => {
    const system = new PortalSystem();
    const player = new Player('player-1', 100, 200, 'Link');
    const players = new Map([[player.id, player]]);
    const portals = new Map<string, Portal>();

    system.spawnPortal(
      portals,
      {
        kind: PORTAL_KINDS.PHASE3_TO_PHASE2,
        x: 100,
        y: 200,
        toInstanceId: INSTANCE_IDS.PHASE2,
        targetX: 300,
        targetY: 400,
      },
      1000
    );

    system.update(1000, players, portals, new Map(), forEachPlayerInRadius(players));
    expect(system.consumeTransferRequests()).toHaveLength(1);

    system.update(1001, players, portals, new Map(), forEachPlayerInRadius(players));
    expect(system.consumeTransferRequests()).toEqual([]);

    player.x = 500;
    player.y = 500;
    system.update(1002, players, portals, new Map(), forEachPlayerInRadius(players));
    expect(system.consumeTransferRequests()).toEqual([]);

    player.x = 100;
    player.y = 200;
    system.update(1003, players, portals, new Map(), forEachPlayerInRadius(players));
    expect(system.consumeTransferRequests()).toEqual([]);

    player.phaseTransferCooldownMs = 0;
    player.x = 500;
    player.y = 500;
    system.update(1004, players, portals, new Map(), forEachPlayerInRadius(players));
    player.x = 100;
    player.y = 200;

    system.update(1005, players, portals, new Map(), forEachPlayerInRadius(players));
    expect(system.consumeTransferRequests()).toEqual([
      {
        playerId: player.id,
        toInstanceId: INSTANCE_IDS.PHASE2,
        targetX: 300,
        targetY: 400,
      },
    ]);
  });

  it('ignores dead players when resolving portal overlaps', () => {
    const system = new PortalSystem();
    const player = new Player('player-1', 100, 200, 'Link');
    player.takeDamage(player.hp);
    const players = new Map([[player.id, player]]);
    const portals = new Map<string, Portal>();

    system.spawnPortal(
      portals,
      {
        kind: PORTAL_KINDS.PHASE4_TO_PHASE3,
        x: 100,
        y: 200,
        toInstanceId: INSTANCE_IDS.PHASE3,
        targetX: 50,
        targetY: 60,
      },
      1000
    );

    system.update(1000, players, portals, new Map(), forEachPlayerInRadius(players));
    expect(system.consumeTransferRequests()).toEqual([]);
  });
});
