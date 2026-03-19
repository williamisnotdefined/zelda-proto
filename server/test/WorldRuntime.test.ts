import { describe, expect, it } from 'vitest';
import { ENEMY_KINDS } from '@gelehka/shared';
import { InstanceManager } from '../src/game/InstanceManager';

describe('World runtime facade', () => {
  it('exposes generic enemy stores while preserving legacy accessors', () => {
    const instances = new InstanceManager();

    expect(instances.phase1World.getEnemyStore(ENEMY_KINDS.BLOB)).toBe(instances.phase1World.blobs);
    expect(instances.phase2World.getEnemyStore(ENEMY_KINDS.SLIME)).toBe(
      instances.phase2World.slimes
    );
    expect(instances.phase3World.getEnemyStore(ENEMY_KINDS.HAND)).toBe(instances.phase3World.hands);
    expect(instances.phase4World.getEnemyStore(ENEMY_KINDS.PACMAN_GHOST)).toBe(
      instances.phase4World.pacmanGhosts
    );

    expect(Array.from(instances.phase2World.getAllEnemies()).length).toBeGreaterThan(0);
    expect(Array.from(instances.phase4World.getAllEnemies()).length).toBeGreaterThan(0);
  });

  it('uses actor ECS sync to keep alive enemy queries and radius indexes updated', () => {
    const instances = new InstanceManager();
    const world = instances.phase2World;
    world.update(0);
    const enemy = world.slimes.values().next().value;

    expect(enemy).toBeDefined();
    if (!enemy) {
      throw new Error('Expected a seeded phase2 enemy');
    }

    const initialNearby = world.queryEnemiesInRadius(enemy.x, enemy.y, 1);
    expect(initialNearby.some((candidate) => candidate.id === enemy.id)).toBe(true);
    expect(world.getAliveEnemies().some((candidate) => candidate.id === enemy.id)).toBe(true);

    enemy.takeDamage(enemy.hp);
    world.update(0);

    const afterDeathNearby = world.queryEnemiesInRadius(enemy.x, enemy.y, 1);
    expect(afterDeathNearby.some((candidate) => candidate.id === enemy.id)).toBe(false);
    expect(world.getAliveEnemies().some((candidate) => candidate.id === enemy.id)).toBe(false);
  });

  it('keeps dead bosses queryable for snapshot-style radius lookups', () => {
    const instances = new InstanceManager();
    const world = instances.phase2World;
    world.update(0);
    const boss = world.bosses.values().next().value;

    expect(boss).toBeDefined();
    if (!boss) {
      throw new Error('Expected a seeded phase2 boss');
    }

    boss.takeDamage(boss.hp);
    world.update(0);

    expect(world.getAliveBosses().some((candidate) => candidate.id === boss.id)).toBe(false);
    expect(
      world.queryBossesInRadius(boss.x, boss.y, 1).some((candidate) => candidate.id === boss.id)
    ).toBe(true);
  });
});
