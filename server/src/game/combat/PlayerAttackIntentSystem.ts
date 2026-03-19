import { PLAYER_DAMAGE } from '../../entities/Player.js';
import { BLOB_HEIGHT, BLOB_WIDTH } from '../../entities/Blob.js';
import { aabbOverlap, entityAABB } from '../Physics.js';
import {
  getBossRuntimeDefinition,
  MAX_BOSS_ATTACK_HALF_DIAGONAL,
} from '../registries/bossRegistry.js';
import { ActorStore } from '../stores/ActorStore.js';

const BLOB_HALF_DIAGONAL = Math.hypot(BLOB_WIDTH / 2, BLOB_HEIGHT / 2);

export class PlayerAttackIntentSystem {
  update(actorStore: ActorStore): void {
    for (const player of actorStore.players.values()) {
      const hitbox = player.getAttackHitbox();
      if (!hitbox) {
        continue;
      }

      const hitboxCenterX = hitbox.x + hitbox.w / 2;
      const hitboxCenterY = hitbox.y + hitbox.h / 2;
      const hitboxHalfDiagonal = Math.hypot(hitbox.w / 2, hitbox.h / 2);
      const enemyQueryRadius = hitboxHalfDiagonal + BLOB_HALF_DIAGONAL;
      const bossQueryRadius = hitboxHalfDiagonal + MAX_BOSS_ATTACK_HALF_DIAGONAL;

      actorStore.forEachEnemyInRadius(hitboxCenterX, hitboxCenterY, enemyQueryRadius, (enemy) => {
        if (player.attackHitEnemyIds.has(enemy.id)) {
          return;
        }

        const enemyBox = entityAABB(enemy.x, enemy.y, BLOB_WIDTH, BLOB_HEIGHT);
        if (!aabbOverlap(hitbox, enemyBox)) {
          return;
        }

        player.attackHitEnemyIds.add(enemy.id);
        actorStore.queuePlayerMeleeHitIntent(player.id, {
          amount: PLAYER_DAMAGE,
          sourceId: player.id,
          sourceRole: 'player',
          targetId: enemy.id,
          targetRole: 'enemy',
          reason: 'player_attack',
        });
      });

      actorStore.forEachBossInRadius(hitboxCenterX, hitboxCenterY, bossQueryRadius, (boss) => {
        if (player.attackHitEnemyIds.has(boss.id)) {
          return;
        }

        const { attackBounds } = getBossRuntimeDefinition(boss.kind);
        const bossBox = entityAABB(boss.x, boss.y, attackBounds.width, attackBounds.height);
        if (!aabbOverlap(hitbox, bossBox)) {
          return;
        }

        player.attackHitEnemyIds.add(boss.id);
        actorStore.queuePlayerMeleeHitIntent(player.id, {
          amount: PLAYER_DAMAGE,
          sourceId: player.id,
          sourceRole: 'player',
          targetId: boss.id,
          targetRole: 'boss',
          reason: 'player_attack',
        });
      });
    }
  }
}
