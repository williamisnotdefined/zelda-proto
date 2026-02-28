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
  Blob,
  BLOB_CONTACT_HEIGHT,
  BLOB_CONTACT_WIDTH,
  BLOB_DAMAGE_COOLDOWN,
  BLOB_HEIGHT,
  BLOB_WIDTH,
} from '../entities/Blob.js';

export function resolvePlayerAttacks(
  players: Map<string, Player>,
  blobs: Map<string, Blob>,
  bosses: Map<string, BossGelehk>
): void {
  for (const player of players.values()) {
    const hitbox = player.getAttackHitbox();
    if (!hitbox) continue;

    for (const blob of blobs.values()) {
      if (blob.state === 'dead') continue;
      // One hit per enemy per swing
      if (player.attackHitEnemyIds.has(blob.id)) continue;
      const blobBox = entityAABB(blob.x, blob.y, BLOB_WIDTH, BLOB_HEIGHT);
      if (aabbOverlap(hitbox, blobBox)) {
        blob.takeDamage(PLAYER_DAMAGE);
        player.attackHitEnemyIds.add(blob.id);
        if (blob.hp <= 0) {
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
  blobs: Map<string, Blob>,
  players: Map<string, Player>
): void {
  for (const blob of blobs.values()) {
    if (blob.state === 'dead') continue;
    if (blob.damageCooldown > 0) continue;

    const blobBox = entityAABB(blob.x, blob.y, BLOB_CONTACT_WIDTH, BLOB_CONTACT_HEIGHT);

    for (const player of players.values()) {
      if (player.state === 'dead') continue;

      if (player.isProtected(WORLD_SPAWN_X, WORLD_SPAWN_Y, WORLD_SPAWN_SAFE_ZONE_RADIUS)) {
        continue;
      }

      const playerBox = entityAABB(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      if (aabbOverlap(blobBox, playerBox)) {
        player.takeDamage(blob.damage);
        blob.damageCooldown = BLOB_DAMAGE_COOLDOWN;
        break;
      }
    }
  }
}
