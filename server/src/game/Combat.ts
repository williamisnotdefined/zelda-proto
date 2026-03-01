import {
  WORLD_SPAWN_SAFE_ZONE_RADIUS,
  WORLD_SPAWN_X,
  WORLD_SPAWN_Y,
} from '@gelehka/shared/constants';
import { ENEMY_KINDS } from '@gelehka/shared';
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
import { DragonLord, DRAGON_LORD_HEIGHT, DRAGON_LORD_WIDTH } from '../entities/DragonLord.js';
import { SLIME_CONTACT_HEIGHT, SLIME_CONTACT_WIDTH } from '../entities/Slime.js';

type BossLike = BossGelehk | DragonLord;
const DRAGON_CONTACT_SCALE = 1;

export function resolvePlayerAttacks(
  players: Map<string, Player>,
  blobs: Map<string, Blob>,
  bosses: Map<string, BossLike>
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
          player.recordMonsterKillInCurrentAttack();
        }
      }
    }

    for (const boss of bosses.values()) {
      if (boss.state === 'dead') continue;
      if (player.attackHitEnemyIds.has(boss.id)) continue;
      const bossW = boss instanceof DragonLord ? DRAGON_LORD_WIDTH : BOSS_WIDTH;
      const bossH = boss instanceof DragonLord ? DRAGON_LORD_HEIGHT : BOSS_HEIGHT;
      const bossBox = entityAABB(boss.x, boss.y, bossW, bossH);
      if (aabbOverlap(hitbox, bossBox)) {
        boss.takeDamage(PLAYER_DAMAGE);
        player.attackHitEnemyIds.add(boss.id);
        if (boss.hp <= 0) {
          player.monsterKills++;
          player.recordMonsterKillInCurrentAttack();
        }
      }
    }
  }
}

export function resolvePlayerVsPlayer(players: Map<string, Player>): void {
  resolvePlayerVsPlayerWithSafeZone(players, {
    x: WORLD_SPAWN_X,
    y: WORLD_SPAWN_Y,
    radius: WORLD_SPAWN_SAFE_ZONE_RADIUS,
  });
}

export function resolvePlayerVsPlayerWithSafeZone(
  players: Map<string, Player>,
  safeZone: { x: number; y: number; radius: number }
): void {
  for (const attacker of players.values()) {
    const hitbox = attacker.getAttackHitbox();
    if (!hitbox) continue;

    for (const target of players.values()) {
      if (target.id === attacker.id) continue;
      if (target.state === 'dead') continue;
      if (attacker.attackHitIds.has(target.id)) continue;

      if (
        attacker.isProtected(safeZone.x, safeZone.y, safeZone.radius) ||
        target.isProtected(safeZone.x, safeZone.y, safeZone.radius)
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
  resolveEnemyContactDamageWithSafeZone(blobs, players, {
    x: WORLD_SPAWN_X,
    y: WORLD_SPAWN_Y,
    radius: WORLD_SPAWN_SAFE_ZONE_RADIUS,
  });
}

export function resolveEnemyContactDamageWithSafeZone(
  blobs: Map<string, Blob>,
  players: Map<string, Player>,
  safeZone: { x: number; y: number; radius: number }
): void {
  for (const blob of blobs.values()) {
    if (blob.state === 'dead') continue;
    if (blob.damageCooldown > 0) continue;

    const isSlime = blob.kind === ENEMY_KINDS.SLIME;
    const contactWidth = isSlime ? SLIME_CONTACT_WIDTH : BLOB_CONTACT_WIDTH;
    const contactHeight = isSlime ? SLIME_CONTACT_HEIGHT : BLOB_CONTACT_HEIGHT;
    const blobBox = entityAABB(blob.x, blob.y, contactWidth, contactHeight);

    for (const player of players.values()) {
      if (player.state === 'dead') continue;

      if (player.isProtected(safeZone.x, safeZone.y, safeZone.radius)) {
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

export function resolveBossContactDamage(
  bosses: Map<string, BossLike>,
  players: Map<string, Player>
): void {
  resolveBossContactDamageWithSafeZone(bosses, players, {
    x: WORLD_SPAWN_X,
    y: WORLD_SPAWN_Y,
    radius: WORLD_SPAWN_SAFE_ZONE_RADIUS,
  });
}

export function resolveBossContactDamageWithSafeZone(
  bosses: Map<string, BossLike>,
  players: Map<string, Player>,
  safeZone: { x: number; y: number; radius: number }
): void {
  for (const boss of bosses.values()) {
    if (!(boss instanceof DragonLord)) continue;
    if (boss.state === 'dead') continue;

    const bossBox = entityAABB(
      boss.x,
      boss.y,
      DRAGON_LORD_WIDTH * DRAGON_CONTACT_SCALE,
      DRAGON_LORD_HEIGHT * DRAGON_CONTACT_SCALE
    );
    for (const player of players.values()) {
      if (player.state === 'dead') continue;

      if (player.isProtected(safeZone.x, safeZone.y, safeZone.radius)) {
        continue;
      }

      const playerBox = entityAABB(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      if (aabbOverlap(bossBox, playerBox)) {
        player.takeDamage(boss.damage);
      }
    }
  }
}
