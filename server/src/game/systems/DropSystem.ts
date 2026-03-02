import { nanoid } from 'nanoid';
import { DROP_KINDS } from '@gelehka/shared';
import { Player } from '../../entities/Player.js';
import { Blob } from '../../entities/Blob.js';
import type { Drop } from '../World.js';

const DROP_CHANCE = 0.5;
const PICKUP_RADIUS = 24;
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
const SMALL_HEAL_AMOUNT = 5;
const LARGE_HEAL_AMOUNT = 10;

export class DropSystem {
  update(players: Map<string, Player>, blobs: Iterable<Blob>, drops: Map<string, Drop>): void {
    this.handleDropPickup(players, drops);
    this.handleEnemyDrops(blobs, drops);
  }

  private handleEnemyDrops(blobs: Iterable<Blob>, drops: Map<string, Drop>): void {
    for (const blob of blobs) {
      if (blob.state === 'dead' && !blob.hasDropped) {
        blob.hasDropped = true;
        if (Math.random() < DROP_CHANCE) {
          const dropId = `drop_${nanoid(8)}`;
          drops.set(dropId, {
            id: dropId,
            x: blob.x,
            y: blob.y,
            kind: blob.dropKind,
          });
        }
      }
    }
  }

  private handleDropPickup(players: Map<string, Player>, drops: Map<string, Drop>): void {
    for (const [dropId, drop] of drops) {
      for (const player of players.values()) {
        if (player.state === 'dead') continue;
        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        if (dx * dx + dy * dy < PICKUP_RADIUS_SQ) {
          const healAmount =
            drop.kind === DROP_KINDS.HEART_LARGE ? LARGE_HEAL_AMOUNT : SMALL_HEAL_AMOUNT;
          player.hp = Math.min(player.hp + healAmount, player.maxHp);
          drops.delete(dropId);
          break;
        }
      }
    }
  }
}
