import { BLOB_CONTACT_RADIUS, BLOB_DAMAGE_COOLDOWN } from '../../entities/Blob.js';
import { PLAYER_HEIGHT, PLAYER_WIDTH } from '../../entities/Player.js';
import { circleAabbOverlap, entityAABB, entityCircle } from '../Physics.js';
import { getBossRuntimeDefinition } from '../registries/bossRegistry.js';
import { ActorStore } from '../stores/ActorStore.js';

export class ContactDamageSystem {
  update(actorStore: ActorStore): void {
    this.resolveEnemyContactDamage(actorStore);
    this.resolveBossContactDamage(actorStore);
  }

  private resolveEnemyContactDamage(actorStore: ActorStore): void {
    for (const enemy of actorStore.getEnemyContactSources()) {
      if (enemy.state === 'dead' || enemy.damageCooldown > 0) {
        continue;
      }

      const contactRadius = enemy.contactRadius ?? BLOB_CONTACT_RADIUS;
      const enemyCircle = entityCircle(enemy.x, enemy.y, contactRadius);
      const contactQueryRadius = contactRadius + Math.hypot(PLAYER_WIDTH / 2, PLAYER_HEIGHT / 2);
      let dealtDamage = false;

      actorStore.forEachAlivePlayerInRadius(enemy.x, enemy.y, contactQueryRadius, (player) => {
        if (dealtDamage || actorStore.isPlayerSafeZoneProtected(player.id)) {
          return;
        }

        const playerBox = entityAABB(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
        if (circleAabbOverlap(enemyCircle, playerBox)) {
          actorStore.queuePendingDamage('player', player.id, {
            amount: enemy.damage,
            sourceId: enemy.id,
            sourceRole: 'enemy',
            targetId: player.id,
            targetRole: 'player',
            reason: 'contact',
          });
          enemy.damageCooldown = BLOB_DAMAGE_COOLDOWN;
          dealtDamage = true;
        }
      });
    }
  }

  private resolveBossContactDamage(actorStore: ActorStore): void {
    for (const boss of actorStore.getBossContactSources()) {
      if (boss.state === 'dead') {
        continue;
      }

      const definition = getBossRuntimeDefinition(boss.kind);
      const contactDamageRadius = definition.contactDamageRadius;
      const getContactDamageAmount = definition.getContactDamageAmount;
      const canDealContactDamage = definition.canDealContactDamage;
      const markContactDamageDealt = definition.markContactDamageDealt;

      if (
        !contactDamageRadius ||
        !getContactDamageAmount ||
        !canDealContactDamage ||
        !markContactDamageDealt
      ) {
        continue;
      }

      const bossCircle = entityCircle(boss.x, boss.y, contactDamageRadius);
      const contactQueryRadius =
        contactDamageRadius + Math.hypot(PLAYER_WIDTH / 2, PLAYER_HEIGHT / 2);
      actorStore.forEachAlivePlayerInRadius(boss.x, boss.y, contactQueryRadius, (player) => {
        if (actorStore.isPlayerSafeZoneProtected(player.id)) {
          return;
        }

        if (!canDealContactDamage(boss, player.id)) {
          return;
        }

        const playerBox = entityAABB(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
        if (circleAabbOverlap(bossCircle, playerBox)) {
          actorStore.queuePendingDamage('player', player.id, {
            amount: getContactDamageAmount(boss),
            sourceId: boss.id,
            sourceRole: 'boss',
            targetId: player.id,
            targetRole: 'player',
            reason: 'contact',
          });
          markContactDamageDealt(boss, player.id);
        }
      });
    }
  }
}
