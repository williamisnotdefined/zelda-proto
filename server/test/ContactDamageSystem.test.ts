import { describe, expect, it } from 'vitest';
import { ENEMY_KINDS } from '@gelehka/shared';
import { BLOB_DAMAGE_COOLDOWN, Blob } from '../src/entities/Blob';
import { DragonLord } from '../src/entities/DragonLord';
import { Player } from '../src/entities/Player';
import { ContactDamageSystem } from '../src/game/combat/ContactDamageSystem';
import { DamageApplicationSystem } from '../src/game/combat/DamageApplicationSystem';
import { ActorStore } from '../src/game/stores/ActorStore';

const FAR_SAFE_ZONE = { x: 1000, y: 1000, radius: 32 };

describe('ContactDamageSystem', () => {
  it('queues and applies enemy contact damage through combat components', () => {
    const store = new ActorStore();
    const contactDamageSystem = new ContactDamageSystem();
    const damageApplicationSystem = new DamageApplicationSystem();
    const player = new Player('player-1', 10, 10, 'Link');
    const enemy = new Blob('enemy-1', 10, 10);

    store.players.set(player.id, player);
    store.getEnemyStore(ENEMY_KINDS.BLOB).set(enemy.id, enemy);
    store.syncAllActors(FAR_SAFE_ZONE);

    contactDamageSystem.update(store);
    expect(store.getPlayersWithPendingDamage()).toEqual([player]);

    damageApplicationSystem.update(store);
    expect(player.hp).toBe(player.maxHp - enemy.damage);
    expect(enemy.damageCooldown).toBe(BLOB_DAMAGE_COOLDOWN);

    store.syncAllActors(FAR_SAFE_ZONE);
    contactDamageSystem.update(store);
    damageApplicationSystem.update(store);
    expect(player.hp).toBe(player.maxHp - enemy.damage);
  });

  it('respects safe zone protection and boss per-player contact cooldowns', () => {
    const store = new ActorStore();
    const contactDamageSystem = new ContactDamageSystem();
    const damageApplicationSystem = new DamageApplicationSystem();
    const player = new Player('player-1', 20, 20, 'Zelda');
    const boss = new DragonLord('boss-1', 20, 20);
    const safeZone = { x: 20, y: 20, radius: 64 };

    store.players.set(player.id, player);
    store.bosses.set(boss.id, boss);
    store.syncAllActors(safeZone);

    contactDamageSystem.update(store);
    damageApplicationSystem.update(store);
    expect(player.hp).toBe(player.maxHp);

    player.safeZoneTimer = 0;
    store.syncAllActors(safeZone);
    contactDamageSystem.update(store);
    damageApplicationSystem.update(store);
    expect(player.hp).toBe(player.maxHp - boss.damage);

    store.syncAllActors(safeZone);
    contactDamageSystem.update(store);
    damageApplicationSystem.update(store);
    expect(player.hp).toBe(player.maxHp - boss.damage);
  });
});
