import type { HazardDefinition } from '@gelehka/shared/definitions';
import { hazardDefinitions } from '@gelehka/shared/definitions';
import type { HazardKind } from '@gelehka/shared';
import { Player } from '../../entities/Player.js';

export interface HazardRuntimeDefinition extends HazardDefinition {
  apply(player: Player): void;
}

export const hazardRegistry: Record<HazardKind, HazardRuntimeDefinition> = {
  fire_field: {
    ...hazardDefinitions.fire_field,
    apply: (player) => {
      player.applyBurning(hazardDefinitions.fire_field.burningTicks);
    },
  },
  purple_field: {
    ...hazardDefinitions.purple_field,
    apply: (player) => {
      player.applyPurpleBurning(hazardDefinitions.purple_field.burningTicks);
    },
  },
  blue_flame: {
    ...hazardDefinitions.blue_flame,
    apply: (player) => {
      player.applyBlueBurning(hazardDefinitions.blue_flame.burningTicks);
    },
  },
};

export function getHazardRuntimeDefinition(kind: HazardKind): HazardRuntimeDefinition {
  return hazardRegistry[kind];
}
