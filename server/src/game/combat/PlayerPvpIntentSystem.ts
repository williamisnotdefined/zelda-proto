import { PLAYER_HEIGHT, PLAYER_WIDTH, PVP_DAMAGE } from '../../entities/Player.js';
import { aabbOverlap, entityAABB } from '../Physics.js';
import type { SafeZoneArea } from './components.js';
import { ActorStore } from '../stores/ActorStore.js';

const PLAYER_HALF_DIAGONAL = Math.hypot(PLAYER_WIDTH / 2, PLAYER_HEIGHT / 2);

export class PlayerPvpIntentSystem {
  update(actorStore: ActorStore, safeZone: SafeZoneArea): void {
    for (const attacker of actorStore.players.values()) {
      const hitbox = attacker.getAttackHitbox();
      if (!hitbox) {
        continue;
      }

      if (actorStore.isPlayerSafeZoneProtected(attacker.id)) {
        continue;
      }

      const hitboxCenterX = hitbox.x + hitbox.w / 2;
      const hitboxCenterY = hitbox.y + hitbox.h / 2;
      const hitboxHalfDiagonal = Math.hypot(hitbox.w / 2, hitbox.h / 2);
      const playerQueryRadius = hitboxHalfDiagonal + PLAYER_HALF_DIAGONAL;

      actorStore.forEachPlayerInRadius(
        hitboxCenterX,
        hitboxCenterY,
        playerQueryRadius,
        (target) => {
          if (target.id === attacker.id || target.state === 'dead') {
            return;
          }

          if (
            attacker.attackHitIds.has(target.id) ||
            actorStore.isPlayerSafeZoneProtected(target.id)
          ) {
            return;
          }

          if (
            attacker.isProtected(safeZone.x, safeZone.y, safeZone.radius) ||
            target.isProtected(safeZone.x, safeZone.y, safeZone.radius)
          ) {
            return;
          }

          const targetBox = entityAABB(target.x, target.y, PLAYER_WIDTH, PLAYER_HEIGHT);
          if (!aabbOverlap(hitbox, targetBox)) {
            return;
          }

          attacker.attackHitIds.add(target.id);
          actorStore.queuePlayerMeleeHitIntent(attacker.id, {
            amount: PVP_DAMAGE,
            sourceId: attacker.id,
            sourceRole: 'player',
            targetId: target.id,
            targetRole: 'player',
            reason: 'pvp',
          });
        }
      );
    }
  }
}
