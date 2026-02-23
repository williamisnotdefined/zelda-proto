import { BOSS_HEIGHT, BOSS_WIDTH, BossGelehk } from './BossGelehk.js';
import { aabbOverlap, entityAABB, isInSafeZone } from './Physics.js';
import { Player, PLAYER_DAMAGE, PLAYER_HEIGHT, PLAYER_WIDTH, PVP_DAMAGE } from './Player.js';
import { Slime, SLIME_HEIGHT, SLIME_WIDTH } from './Slime.js';
import {
  isSafeZoneActive,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
  SPAWN_SAFE_ZONE_RADIUS,
} from './World.js';

export function resolvePlayerAttacks(
  players: Map<string, Player>,
  slimes: Map<string, Slime>,
  bosses: Map<string, BossGelehk>
): void {
  for (const player of players.values()) {
    const hitbox = player.getAttackHitbox();
    if (!hitbox) continue;

    for (const slime of slimes.values()) {
      if (slime.state === 'dead') continue;
      const slimeBox = entityAABB(slime.x, slime.y, SLIME_WIDTH, SLIME_HEIGHT);
      if (aabbOverlap(hitbox, slimeBox)) {
        slime.takeDamage(PLAYER_DAMAGE);
      }
    }

    for (const boss of bosses.values()) {
      if (boss.state === 'dead') continue;
      const bossBox = entityAABB(boss.x, boss.y, BOSS_WIDTH, BOSS_HEIGHT);
      if (aabbOverlap(hitbox, bossBox)) {
        boss.takeDamage(PLAYER_DAMAGE);
      }
    }
  }
}

export function resolvePlayerVsPlayer(players: Map<string, Player>): void {
  for (const attacker of players.values()) {
    const hitbox = attacker.getAttackHitbox();
    if (!hitbox) continue;

    for (const target of players.values()) {
      if (target.id === attacker.id) continue;
      if (target.state === 'dead') continue;
      if (attacker.attackHitIds.has(target.id)) continue;

      // Skip PvP damage if either player is in spawn safe zone AND safe zone is active
      if (
        isSafeZoneActive &&
        (isInSafeZone(
          attacker.x,
          attacker.y,
          PLAYER_SPAWN_X,
          PLAYER_SPAWN_Y,
          SPAWN_SAFE_ZONE_RADIUS
        ) ||
          isInSafeZone(target.x, target.y, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, SPAWN_SAFE_ZONE_RADIUS))
      ) {
        continue;
      }

      const targetBox = entityAABB(target.x, target.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      if (aabbOverlap(hitbox, targetBox)) {
        target.takeDamage(PVP_DAMAGE);
        attacker.attackHitIds.add(target.id);
      }
    }
  }
}

export function resolveEnemyContactDamage(
  slimes: Map<string, Slime>,
  players: Map<string, Player>
): void {
  for (const slime of slimes.values()) {
    if (slime.state === 'dead') continue;
    if (slime.damageCooldown > 0) continue;

    const slimeBox = entityAABB(slime.x, slime.y, SLIME_WIDTH, SLIME_HEIGHT);

    for (const player of players.values()) {
      if (player.state === 'dead') continue;

      // Skip damage if player is in spawn safe zone AND safe zone is active
      const isPlayerInSafeZone =
        isSafeZoneActive &&
        isInSafeZone(player.x, player.y, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, SPAWN_SAFE_ZONE_RADIUS);

      if (isPlayerInSafeZone) {
        continue;
      }

      const playerBox = entityAABB(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      if (aabbOverlap(slimeBox, playerBox)) {
        player.takeDamage(slime.damage);
        slime.damageCooldown = 1000;
        break;
      }
    }
  }
}
