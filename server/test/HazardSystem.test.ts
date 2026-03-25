import { describe, expect, it } from 'vitest';
import { HAZARD_KINDS } from '@gelehka/shared';
import { BLOB_DAMAGE } from '../src/entities/Blob';
import { Player, SAFE_ZONE_DURATION } from '../src/entities/Player';
import { HazardSystem } from '../src/game/systems/HazardSystem';
import type { Hazard } from '../src/game/World';

const FAR_SAFE_ZONE = { x: 5000, y: 5000, radius: 32 };

function forEachPlayerInRadius(players: Map<string, Player>) {
  return (_x: number, _y: number, _radius: number, callback: (player: Player) => void): void => {
    for (const player of players.values()) {
      callback(player);
    }
  };
}

function createHazard(overrides: Partial<Hazard> = {}): Hazard {
  return {
    id: 'hazard-1',
    x: 0,
    y: 0,
    kind: HAZARD_KINDS.FIRE_FIELD,
    ttlMs: 1800,
    damage: BLOB_DAMAGE,
    burningTicks: 3,
    hitPlayerIds: new Set<string>(),
    ...overrides,
  };
}

describe('HazardSystem', () => {
  it('spawns fire-field lines on the frozen segment cadence', () => {
    const system = new HazardSystem();
    const hazards = new Map<string, Hazard>();

    system.spawnFireFieldLine(0, 0, 1, 0, 1000);

    system.update(0, 1000, new Map(), hazards, FAR_SAFE_ZONE, forEachPlayerInRadius(new Map()));
    expect(hazards.size).toBe(1);
    expect(Array.from(hazards.values())[0]).toMatchObject({
      x: 36,
      y: 0,
      kind: HAZARD_KINDS.FIRE_FIELD,
    });

    system.update(0, 1039, new Map(), hazards, FAR_SAFE_ZONE, forEachPlayerInRadius(new Map()));
    expect(hazards.size).toBe(1);

    system.update(0, 1040, new Map(), hazards, FAR_SAFE_ZONE, forEachPlayerInRadius(new Map()));
    expect(hazards.size).toBe(2);

    system.update(0, 1240, new Map(), hazards, FAR_SAFE_ZONE, forEachPlayerInRadius(new Map()));
    expect(hazards.size).toBe(7);
  });

  it('cleans up expired hazards before the next damage pass', () => {
    const system = new HazardSystem();
    const hazards = new Map<string, Hazard>([['hazard-1', createHazard({ ttlMs: 10 })]]);

    system.update(11, 1000, new Map(), hazards, FAR_SAFE_ZONE, forEachPlayerInRadius(new Map()));

    expect(hazards.size).toBe(0);
  });

  it('does not damage protected players inside the safe zone', () => {
    const system = new HazardSystem();
    const player = new Player('player-1', 0, 0, 'Link');
    player.safeZoneTimer = SAFE_ZONE_DURATION;
    const players = new Map([[player.id, player]]);
    const hazards = new Map<string, Hazard>([['hazard-1', createHazard()]]);

    system.update(
      0,
      1000,
      players,
      hazards,
      { x: 0, y: 0, radius: 64 },
      forEachPlayerInRadius(players)
    );

    expect(player.hp).toBe(player.maxHp);
    expect(player.burningTicksRemaining).toBe(0);
  });

  it('deduplicates purple field hits so overlapping clusters damage once per tick', () => {
    const system = new HazardSystem();
    const player = new Player('player-1', 100, 100, 'Link');
    player.safeZoneTimer = 0;
    const players = new Map([[player.id, player]]);
    const hazards = new Map<string, Hazard>();

    system.spawnPurpleField(hazards, 100, 100);
    system.update(0, 1000, players, hazards, FAR_SAFE_ZONE, forEachPlayerInRadius(players));

    expect(player.hp).toBe(player.maxHp - BLOB_DAMAGE);
    expect(player.purpleBurningTicksRemaining).toBeGreaterThan(0);
  });

  it('applies hazard-specific status effects', () => {
    const system = new HazardSystem();
    const player = new Player('player-1', 0, 0, 'Link');
    player.safeZoneTimer = 0;
    const players = new Map([[player.id, player]]);
    const hazards = new Map<string, Hazard>([
      [
        'hazard-1',
        createHazard({
          kind: HAZARD_KINDS.BLUE_FLAME,
          burningTicks: 3,
        }),
      ],
    ]);

    system.update(0, 1000, players, hazards, FAR_SAFE_ZONE, forEachPlayerInRadius(players));

    expect(player.hp).toBe(player.maxHp - BLOB_DAMAGE);
    expect(player.blueBurningTicksRemaining).toBe(3);
  });
});
