import { nanoid } from 'nanoid';
import { Player } from '../../entities/Player.js';
import { Blob } from '../../entities/Blob.js';
import type { Drop } from '../World.js';
import { getDropRuntimeDefinition } from '../registries/dropRegistry.js';

const DROP_CHANCE = 0.5;
const PICKUP_RADIUS = 24;
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
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
          getDropRuntimeDefinition(drop.kind).apply(player);
          drops.delete(dropId);
          pickedUp = true;
        }
      });
    }
  }
}
