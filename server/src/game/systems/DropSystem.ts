import { nanoid } from 'nanoid';
import { Player } from '../../entities/Player.js';
import { Slime } from '../../entities/Slime.js';
import type { Drop } from '../World.js';

export class DropSystem {
  update(players: Map<string, Player>, slimes: Map<string, Slime>, drops: Map<string, Drop>): void {
    this.handleDropPickup(players, drops);
    this.handleEnemyDrops(slimes, drops);
  }

  private handleEnemyDrops(slimes: Map<string, Slime>, drops: Map<string, Drop>): void {
    const DROP_CHANCE = 0.5;
    for (const slime of slimes.values()) {
      if (slime.state === 'dead' && !slime.hasDropped) {
        slime.hasDropped = true;
        if (Math.random() < DROP_CHANCE) {
          const dropId = `drop_${nanoid(8)}`;
          drops.set(dropId, {
            id: dropId,
            x: slime.x,
            y: slime.y,
            kind: 'heal',
          });
        }
      }
    }
  }

  private handleDropPickup(players: Map<string, Player>, drops: Map<string, Drop>): void {
    const PICKUP_RADIUS = 24;
    const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
    const HEAL_AMOUNT = 5;

    for (const [dropId, drop] of drops) {
      for (const player of players.values()) {
        if (player.state === 'dead') continue;
        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        if (dx * dx + dy * dy < PICKUP_RADIUS_SQ) {
          if (drop.kind === 'heal') {
            player.hp = Math.min(player.hp + HEAL_AMOUNT, player.maxHp);
          }
          drops.delete(dropId);
          break;
        }
      }
    }
  }
}
