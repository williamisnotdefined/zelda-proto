import {
  WORLD_SPAWN_SAFE_ZONE_RADIUS,
  WORLD_SPAWN_X,
  WORLD_SPAWN_Y,
} from '@gelehka/shared/constants';
import { BOSS_HEIGHT, BOSS_WIDTH, BossGelehk } from '../entities/BossGelehk.js';
import { aabbOverlap, entityAABB } from './Physics.js';
import {
  Player,
  PLAYER_DAMAGE,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PVP_DAMAGE,
} from '../entities/Player.js';
import {
  Slime,
  SLIME_CONTACT_HEIGHT,
  SLIME_CONTACT_WIDTH,
  SLIME_DAMAGE_COOLDOWN,
  SLIME_HEIGHT,
  SLIME_WIDTH,
} from '../entities/Slime.js';

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
      // One hit per enemy per swing
      if (player.attackHitEnemyIds.has(slime.id)) continue;
      const slimeBox = entityAABB(slime.x, slime.y, SLIME_WIDTH, SLIME_HEIGHT);
      if (aabbOverlap(hitbox, slimeBox)) {
        slime.takeDamage(PLAYER_DAMAGE);
        player.attackHitEnemyIds.add(slime.id);
        if (slime.hp <= 0) {
          player.monsterKills++;
        }
      }
    }

    for (const boss of bosses.values()) {
      if (boss.state === 'dead') continue;
      if (player.attackHitEnemyIds.has(boss.id)) continue;
      const bossBox = entityAABB(boss.x, boss.y, BOSS_WIDTH, BOSS_HEIGHT);
      if (aabbOverlap(hitbox, bossBox)) {
        boss.takeDamage(PLAYER_DAMAGE);
        player.attackHitEnemyIds.add(boss.id);
        if (boss.hp <= 0) {
          player.monsterKills++;
        }
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

      if (
        attacker.isProtected(WORLD_SPAWN_X, WORLD_SPAWN_Y, WORLD_SPAWN_SAFE_ZONE_RADIUS) ||
        target.isProtected(WORLD_SPAWN_X, WORLD_SPAWN_Y, WORLD_SPAWN_SAFE_ZONE_RADIUS)
      ) {
        continue;
      }

      const targetBox = entityAABB(target.x, target.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      if (aabbOverlap(hitbox, targetBox)) {
        target.takeDamage(PVP_DAMAGE);
        attacker.attackHitIds.add(target.id);
        if (target.hp <= 0) {
          attacker.playerKills++;
        }
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

    const slimeBox = entityAABB(slime.x, slime.y, SLIME_CONTACT_WIDTH, SLIME_CONTACT_HEIGHT);

    for (const player of players.values()) {
      if (player.state === 'dead') continue;

      if (player.isProtected(WORLD_SPAWN_X, WORLD_SPAWN_Y, WORLD_SPAWN_SAFE_ZONE_RADIUS)) {
        continue;
      }

      const playerBox = entityAABB(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      if (aabbOverlap(slimeBox, playerBox)) {
        player.takeDamage(slime.damage);
        slime.damageCooldown = SLIME_DAMAGE_COOLDOWN;
        break;
      }
    }
  }
}
