import type { HazardKind, HazardSnapshot } from '@gelehka/shared';
import { HAZARD_KINDS } from '@gelehka/shared';
import Phaser from 'phaser';
import { BlueFlameHazardEntity } from '../../../entities/BlueFlameHazardEntity';
import { FireFieldHazardEntity } from '../../../entities/FireFieldHazardEntity';
import { PurpleFieldHazardEntity } from '../../../entities/PurpleFieldHazardEntity';

type HazardEntity = FireFieldHazardEntity | PurpleFieldHazardEntity | BlueFlameHazardEntity;

export const hazardRegistry: Record<
  HazardKind,
  { create: (scene: Phaser.Scene, snapshot: HazardSnapshot) => HazardEntity }
> = {
  [HAZARD_KINDS.FIRE_FIELD]: {
    create: (scene, snapshot) => new FireFieldHazardEntity(scene, snapshot.x, snapshot.y),
  },
  [HAZARD_KINDS.PURPLE_FIELD]: {
    create: (scene, snapshot) => new PurpleFieldHazardEntity(scene, snapshot.x, snapshot.y),
  },
  [HAZARD_KINDS.BLUE_FLAME]: {
    create: (scene, snapshot) => new BlueFlameHazardEntity(scene, snapshot.x, snapshot.y),
  },
};
