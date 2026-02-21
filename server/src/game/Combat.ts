import { Player, PLAYER_DAMAGE, PLAYER_WIDTH, PLAYER_HEIGHT } from './Player.js';
import { Slime, SLIME_WIDTH, SLIME_HEIGHT } from './Slime.js';
import { BossGelehk, BOSS_WIDTH, BOSS_HEIGHT } from './BossGelehk.js';
import { aabbOverlap, entityAABB } from './Physics.js';

export function resolvePlayerAttacks(
  players: Map<string, Player>,
  slimes: Map<string, Slime>,
  boss: BossGelehk | null
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

    if (boss && boss.state !== 'dead') {
      const bossBox = entityAABB(boss.x, boss.y, BOSS_WIDTH, BOSS_HEIGHT);
      if (aabbOverlap(hitbox, bossBox)) {
        boss.takeDamage(PLAYER_DAMAGE);
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
      const playerBox = entityAABB(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      if (aabbOverlap(slimeBox, playerBox)) {
        player.takeDamage(slime.damage);
        slime.damageCooldown = 1000;
        break;
      }
    }
  }
}
