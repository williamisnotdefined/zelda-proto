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
const PACMAN_HEAL_AMOUNT = 20;

type PlayerRadiusQuery = (
  x: number,
  y: number,
  radius: number,
  callback: (player: Player) => void
) => void;

export class DropSystem {
  update(
    players: Map<string, Player>,
    blobs: Iterable<Blob>,
    drops: Map<string, Drop>,
    forEachPlayerInRadius: PlayerRadiusQuery
  ): void {
    this.handleDropPickup(players, drops, forEachPlayerInRadius);
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

  private handleDropPickup(
    players: Map<string, Player>,
    drops: Map<string, Drop>,
    forEachPlayerInRadius: PlayerRadiusQuery
  ): void {
    for (const [dropId, drop] of drops) {
      let pickedUp = false;

      forEachPlayerInRadius(drop.x, drop.y, PICKUP_RADIUS, (player) => {
        if (pickedUp) return;
        if (player.state === 'dead') return;
        if (!players.has(player.id)) return;

        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        if (dx * dx + dy * dy < PICKUP_RADIUS_SQ) {
          const healAmount =
            drop.kind === DROP_KINDS.HEART_PACMAN
              ? PACMAN_HEAL_AMOUNT
              : drop.kind === DROP_KINDS.HEART_LARGE
                ? LARGE_HEAL_AMOUNT
                : SMALL_HEAL_AMOUNT;
          player.hp = Math.min(player.hp + healAmount, player.maxHp);
          drops.delete(dropId);
          pickedUp = true;
        }
      });
    }
  }
}
