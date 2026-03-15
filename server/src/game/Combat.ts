import {
  WORLD_SPAWN_SAFE_ZONE_RADIUS,
  WORLD_SPAWN_X,
  WORLD_SPAWN_Y,
} from '@gelehka/shared/constants';
import { BOSS_HEIGHT, BOSS_WIDTH, BossGelehk } from '../entities/BossGelehk.js';
import { aabbOverlap, circleAabbOverlap, entityAABB, entityCircle } from './Physics.js';
import {
  Player,
  PLAYER_DAMAGE,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PVP_DAMAGE,
} from '../entities/Player.js';
import {
  Blob,
  BLOB_CONTACT_RADIUS,
  BLOB_DAMAGE_COOLDOWN,
  BLOB_HEIGHT,
  BLOB_WIDTH,
} from '../entities/Blob.js';
import {
  DragonLord,
  DRAGON_LORD_CONTACT_RADIUS,
  DRAGON_LORD_HEIGHT,
  DRAGON_LORD_WIDTH,
} from '../entities/DragonLord.js';
import { Phase3Boss } from '../entities/Phase3Boss.js';

type BossLike = BossGelehk | DragonLord | Phase3Boss;
type EnemyRadiusQuery = (
  x: number,
  y: number,
  radius: number,
  callback: (enemy: Blob) => void
) => void;
type BossRadiusQuery = (
  x: number,
  y: number,
  radius: number,
  callback: (boss: BossLike) => void
) => void;
type PlayerRadiusQuery = (
  x: number,
  y: number,
  radius: number,
  callback: (player: Player) => void
) => void;

const PLAYER_HALF_DIAGONAL = Math.hypot(PLAYER_WIDTH / 2, PLAYER_HEIGHT / 2);
const BLOB_HALF_DIAGONAL = Math.hypot(BLOB_WIDTH / 2, BLOB_HEIGHT / 2);
const BOSS_HALF_DIAGONAL = Math.hypot(BOSS_WIDTH / 2, BOSS_HEIGHT / 2);
const DRAGON_LORD_HALF_DIAGONAL = Math.hypot(DRAGON_LORD_WIDTH / 2, DRAGON_LORD_HEIGHT / 2);
const MAX_BOSS_HALF_DIAGONAL = Math.max(BOSS_HALF_DIAGONAL, DRAGON_LORD_HALF_DIAGONAL);
const DRAGON_CONTACT_QUERY_RADIUS = DRAGON_LORD_CONTACT_RADIUS + PLAYER_HALF_DIAGONAL;

export function resolvePlayerAttacks(
  players: Map<string, Player>,
  queryEnemiesInRadius: EnemyRadiusQuery,
  queryBossesInRadius: BossRadiusQuery
): void {
  for (const player of players.values()) {
    const hitbox = player.getAttackHitbox();
    if (!hitbox) continue;

    const hitboxCenterX = hitbox.x + hitbox.w / 2;
    const hitboxCenterY = hitbox.y + hitbox.h / 2;
    const hitboxHalfDiagonal = Math.hypot(hitbox.w / 2, hitbox.h / 2);
    const enemyQueryRadius = hitboxHalfDiagonal + BLOB_HALF_DIAGONAL;
    const bossQueryRadius = hitboxHalfDiagonal + MAX_BOSS_HALF_DIAGONAL;

    queryEnemiesInRadius(hitboxCenterX, hitboxCenterY, enemyQueryRadius, (blob) => {
      if (blob.state === 'dead') return;
      // One hit per enemy per swing
      if (player.attackHitEnemyIds.has(blob.id)) return;
      const blobBox = entityAABB(blob.x, blob.y, BLOB_WIDTH, BLOB_HEIGHT);
      if (aabbOverlap(hitbox, blobBox)) {
        blob.takeDamage(PLAYER_DAMAGE);
        player.attackHitEnemyIds.add(blob.id);
        if (blob.hp <= 0) {
          player.monsterKills++;
          player.recordMonsterKillInCurrentAttack();
        }
      }
    });

    queryBossesInRadius(hitboxCenterX, hitboxCenterY, bossQueryRadius, (boss) => {
      if (boss.state === 'dead') return;
      if (player.attackHitEnemyIds.has(boss.id)) return;
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
    });
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
  blobs: Iterable<Blob>,
  players: Map<string, Player>,
  forEachPlayerInRadius: PlayerRadiusQuery
): void {
  resolveEnemyContactDamageWithSafeZone(
    blobs,
    players,
    {
      x: WORLD_SPAWN_X,
      y: WORLD_SPAWN_Y,
      radius: WORLD_SPAWN_SAFE_ZONE_RADIUS,
    },
    forEachPlayerInRadius
  );
}

export function resolveEnemyContactDamageWithSafeZone(
  blobs: Iterable<Blob>,
  players: Map<string, Player>,
  safeZone: { x: number; y: number; radius: number },
  forEachPlayerInRadius: PlayerRadiusQuery
): void {
  for (const blob of blobs) {
    if (blob.state === 'dead') continue;
    if (blob.damageCooldown > 0) continue;

    const blobCircle = entityCircle(blob.x, blob.y, blob.contactRadius ?? BLOB_CONTACT_RADIUS);
    const contactQueryRadius = blobCircle.r + PLAYER_HALF_DIAGONAL;
    let dealtDamage = false;

    forEachPlayerInRadius(blob.x, blob.y, contactQueryRadius, (player) => {
      if (dealtDamage) return;
      if (!players.has(player.id)) return;
      if (player.state === 'dead') return;
      if (player.isProtected(safeZone.x, safeZone.y, safeZone.radius)) {
        return;
      }

      const playerBox = entityAABB(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      if (circleAabbOverlap(blobCircle, playerBox)) {
        player.takeDamage(blob.damage);
        blob.damageCooldown = BLOB_DAMAGE_COOLDOWN;
        dealtDamage = true;
      }
    });
  }
}

export function resolveBossContactDamage(
  bosses: Map<string, BossLike>,
  players: Map<string, Player>,
  forEachPlayerInRadius: PlayerRadiusQuery
): void {
  resolveBossContactDamageWithSafeZone(
    bosses,
    players,
    {
      x: WORLD_SPAWN_X,
      y: WORLD_SPAWN_Y,
      radius: WORLD_SPAWN_SAFE_ZONE_RADIUS,
    },
    forEachPlayerInRadius
  );
}

export function resolveBossContactDamageWithSafeZone(
  bosses: Map<string, BossLike>,
  players: Map<string, Player>,
  safeZone: { x: number; y: number; radius: number },
  forEachPlayerInRadius: PlayerRadiusQuery
): void {
  for (const boss of bosses.values()) {
    if (!(boss instanceof DragonLord)) continue;
    if (boss.state === 'dead') continue;

    const bossCircle = entityCircle(boss.x, boss.y, DRAGON_LORD_CONTACT_RADIUS);
    forEachPlayerInRadius(boss.x, boss.y, DRAGON_CONTACT_QUERY_RADIUS, (player) => {
      if (!players.has(player.id)) return;
      if (player.state === 'dead') return;

      if (player.isProtected(safeZone.x, safeZone.y, safeZone.radius)) {
        return;
      }

      if (!boss.canDealContactDamageTo(player.id)) {
        return;
      }

      const playerBox = entityAABB(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      if (circleAabbOverlap(bossCircle, playerBox)) {
        player.takeDamage(boss.damage);
        boss.markContactDamageDealt(player.id);
      }
    });
  }
}
