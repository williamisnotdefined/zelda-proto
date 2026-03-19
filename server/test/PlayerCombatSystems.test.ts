import { describe, expect, it } from 'vitest';
import { ENEMY_KINDS } from '@gelehka/shared';
import { PLAYER_HEIGHT, PLAYER_WIDTH } from '../src/entities/Player';
import { Blob } from '../src/entities/Blob';
import { DragonLord } from '../src/entities/DragonLord';
import { Player } from '../src/entities/Player';
import { DamageApplicationSystem } from '../src/game/combat/DamageApplicationSystem';
import { DamageResolutionSystem } from '../src/game/combat/DamageResolutionSystem';
import { PlayerAttackIntentSystem } from '../src/game/combat/PlayerAttackIntentSystem';
import { PlayerPvpIntentSystem } from '../src/game/combat/PlayerPvpIntentSystem';
import { aabbOverlap, entityAABB } from '../src/game/Physics';
import { ActorStore } from '../src/game/stores/ActorStore';

const FAR_SAFE_ZONE = { x: 1000, y: 1000, radius: 32 };

describe('Player combat systems', () => {
  it('resolves player attack intents against enemies and bosses with kill credit once per swing', () => {
    const store = new ActorStore();
    const attackIntentSystem = new PlayerAttackIntentSystem();
    const damageResolutionSystem = new DamageResolutionSystem();
    const damageApplicationSystem = new DamageApplicationSystem();
    const player = new Player('player-1', 0, 0, 'Link');
    const enemy = new Blob('enemy-1', 0, 0);
    const boss = new DragonLord('boss-1', 0, 0);

    player.state = 'attacking';
    player.direction = 'right';

    const hitbox = player.getAttackHitbox();
    if (!hitbox) {
      throw new Error('Expected player attack hitbox');
    }

    enemy.x = hitbox.x + hitbox.w / 2;
    enemy.y = hitbox.y + hitbox.h / 2;
    enemy.hp = 1;
    boss.x = hitbox.x + hitbox.w / 2;
    boss.y = hitbox.y + hitbox.h / 2;
    boss.hp = 1;

    store.players.set(player.id, player);
    store.getEnemyStore(ENEMY_KINDS.BLOB).set(enemy.id, enemy);
    store.bosses.set(boss.id, boss);
    store.syncAllActors(FAR_SAFE_ZONE);

    attackIntentSystem.update(store);
    damageResolutionSystem.update(store);
    damageApplicationSystem.update(store);

    expect(enemy.state).toBe('dead');
    expect(boss.state).toBe('dead');
    expect(player.monsterKills).toBe(2);
    expect(player.attackMonsterKills).toBe(2);

    attackIntentSystem.update(store);
    damageResolutionSystem.update(store);
    damageApplicationSystem.update(store);
    expect(player.monsterKills).toBe(2);
  });

  it('preserves pvp attacker order and safe zone blocking', () => {
    const store = new ActorStore();
    const pvpIntentSystem = new PlayerPvpIntentSystem();
    const damageResolutionSystem = new DamageResolutionSystem();
    const damageApplicationSystem = new DamageApplicationSystem();
    const attacker = new Player('player-a', 0, 0, 'A');
    const middle = new Player('player-b', 0, 0, 'B');
    const target = new Player('player-c', 0, 0, 'C');

    attacker.state = 'attacking';
    attacker.direction = 'down';
    middle.state = 'attacking';
    middle.direction = 'right';
    middle.hp = 1;

    const attackerHitbox = attacker.getAttackHitbox();
    if (!attackerHitbox) {
      throw new Error('Expected attacker hitbox');
    }
    middle.x = attackerHitbox.x + attackerHitbox.w / 2;
    middle.y = attackerHitbox.y + attackerHitbox.h / 2;

    const middleHitbox = middle.getAttackHitbox();
    if (!middleHitbox) {
      throw new Error('Expected middle player hitbox');
    }

    const attackerHitboxAgainstTarget = attacker.getAttackHitbox();
    if (!attackerHitboxAgainstTarget) {
      throw new Error('Expected attacker hitbox after positioning');
    }

    let foundTargetPosition = false;
    for (
      let offsetX = -PLAYER_WIDTH;
      offsetX <= PLAYER_WIDTH && !foundTargetPosition;
      offsetX += 12
    ) {
      for (
        let offsetY = -PLAYER_HEIGHT;
        offsetY <= PLAYER_HEIGHT && !foundTargetPosition;
        offsetY += 12
      ) {
        const candidateX = middleHitbox.x + middleHitbox.w / 2 + offsetX;
        const candidateY = middleHitbox.y + middleHitbox.h / 2 + offsetY;
        const candidateBox = entityAABB(candidateX, candidateY, PLAYER_WIDTH, PLAYER_HEIGHT);
        if (
          aabbOverlap(middleHitbox, candidateBox) &&
          !aabbOverlap(attackerHitboxAgainstTarget, candidateBox)
        ) {
          target.x = candidateX;
          target.y = candidateY;
          foundTargetPosition = true;
        }
      }
    }

    expect(foundTargetPosition).toBe(true);

    store.players.set(attacker.id, attacker);
    store.players.set(middle.id, middle);
    store.players.set(target.id, target);
    store.syncAllActors(FAR_SAFE_ZONE);

    pvpIntentSystem.update(store, FAR_SAFE_ZONE);
    damageResolutionSystem.update(store);
    damageApplicationSystem.update(store);

    expect(middle.state).toBe('dead');
    expect(attacker.playerKills).toBe(1);
    expect(target.hp).toBe(target.maxHp);

    const safeZoneStore = new ActorStore();
    const safeAttacker = new Player('safe-a', 10, 10, 'SafeA');
    const safeTarget = new Player('safe-b', 10, 10, 'SafeB');
    safeAttacker.state = 'attacking';
    safeAttacker.direction = 'right';
    const safeHitbox = safeAttacker.getAttackHitbox();
    if (!safeHitbox) {
      throw new Error('Expected safe attacker hitbox');
    }
    safeTarget.x = safeHitbox.x + safeHitbox.w / 2;
    safeTarget.y = safeHitbox.y + safeHitbox.h / 2;
    const safeZone = { x: 10, y: 10, radius: 64 };

    safeZoneStore.players.set(safeAttacker.id, safeAttacker);
    safeZoneStore.players.set(safeTarget.id, safeTarget);
    safeZoneStore.syncAllActors(safeZone);

    pvpIntentSystem.update(safeZoneStore, safeZone);
    damageResolutionSystem.update(safeZoneStore);
    damageApplicationSystem.update(safeZoneStore);
    expect(safeTarget.hp).toBe(safeTarget.maxHp);
  });
});
