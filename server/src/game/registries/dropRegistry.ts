import type { DropDefinition } from '@gelehka/shared/definitions';
import { dropDefinitions } from '@gelehka/shared/definitions';
import type { DropKind } from '@gelehka/shared';
import { Player } from '../../entities/Player.js';

export interface DropRuntimeDefinition extends DropDefinition {
  apply(player: Player): void;
}

export const dropRegistry: Record<DropKind, DropRuntimeDefinition> = {
  heart_small: {
    ...dropDefinitions.heart_small,
    apply: (player) => {
      player.hp = Math.min(player.hp + dropDefinitions.heart_small.healAmount, player.maxHp);
    },
  },
  heart_large: {
    ...dropDefinitions.heart_large,
    apply: (player) => {
      player.hp = Math.min(player.hp + dropDefinitions.heart_large.healAmount, player.maxHp);
    },
  },
  heart_pacman: {
    ...dropDefinitions.heart_pacman,
    apply: (player) => {
      player.hp = Math.min(player.hp + dropDefinitions.heart_pacman.healAmount, player.maxHp);
    },
  },
};

export function getDropRuntimeDefinition(kind: DropKind): DropRuntimeDefinition {
  return dropRegistry[kind];
}
