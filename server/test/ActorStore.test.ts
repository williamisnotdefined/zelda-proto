import { describe, expect, it } from 'vitest';
import { ENEMY_KINDS } from '@gelehka/shared';
import { Blob } from '../src/entities/Blob';
import { DragonLord } from '../src/entities/DragonLord';
import { Player } from '../src/entities/Player';
import { ActorStore } from '../src/game/stores/ActorStore';

describe('ActorStore', () => {
  it('syncs actor role, alive state, and positions into ECS', () => {
    const store = new ActorStore();
    const player = new Player('player-1', 10, 20, 'Link');
    const enemy = new Blob('enemy-1', 30, 40);
    const boss = new DragonLord('boss-1', 50, 60);

    store.players.set(player.id, player);
    store.getEnemyStore(ENEMY_KINDS.BLOB).set(enemy.id, enemy);
    store.bosses.set(boss.id, boss);

    expect(store.getPlayers()).toEqual([player]);
    expect(store.getAlivePlayers()).toEqual([player]);
    expect(store.getAliveEnemies()).toEqual([enemy]);
    expect(store.getAliveBosses()).toEqual([boss]);

    player.x = 15;
    player.y = 25;
    enemy.state = 'dead';
    boss.state = 'dead';
    store.syncAllActors();

    const playerEntityId = store.players.getEntityId(player.id);
    expect(playerEntityId).toBeDefined();
    expect(store.ecsWorld.getComponent(playerEntityId!, 'position')).toEqual({ x: 15, y: 25 });
    expect(store.getAliveEnemies()).toHaveLength(0);
    expect(store.getAliveBosses()).toHaveLength(0);
  });

  it('answers actor radius queries from the ECS spatial index', () => {
    const store = new ActorStore();
    const livePlayer = new Player('player-live', 10, 10, 'Link');
    const deadPlayer = new Player('player-dead', 14, 10, 'Zelda');
    const liveEnemy = new Blob('enemy-live', 30, 10);
    const deadEnemy = new Blob('enemy-dead', 34, 10);
    const liveBoss = new DragonLord('boss-live', 50, 10);
    const deadBoss = new DragonLord('boss-dead', 54, 10);

    deadPlayer.takeDamage(deadPlayer.hp);
    deadEnemy.takeDamage(deadEnemy.hp);
    deadBoss.takeDamage(deadBoss.hp);

    store.players.set(livePlayer.id, livePlayer);
    store.players.set(deadPlayer.id, deadPlayer);
    store.getEnemyStore(ENEMY_KINDS.BLOB).set(liveEnemy.id, liveEnemy);
    store.getEnemyStore(ENEMY_KINDS.BLOB).set(deadEnemy.id, deadEnemy);
    store.bosses.set(liveBoss.id, liveBoss);
    store.bosses.set(deadBoss.id, deadBoss);
    store.syncAllActors({ x: 1000, y: 1000, radius: 32 });

    expect(
      store
        .queryPlayersInRadius(12, 10, 5)
        .map((player) => player.id)
        .sort()
    ).toEqual([deadPlayer.id, livePlayer.id]);
    expect(store.findNearestPlayerInRadius(12, 10, 10)?.id).toBe(deadPlayer.id);
    expect(store.queryEnemiesInRadius(32, 10, 5).map((enemy) => enemy.id)).toEqual([liveEnemy.id]);
    expect(store.queryBossesInRadius(52, 10, 5).map((boss) => boss.id)).toEqual([liveBoss.id]);
    expect(
      store
        .queryBossesInRadius(52, 10, 5, { includeDead: true })
        .map((boss) => boss.id)
        .sort()
    ).toEqual([deadBoss.id, liveBoss.id]);
  });
});
