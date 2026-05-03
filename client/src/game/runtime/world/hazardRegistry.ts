import type { HazardKind, HazardSnapshot } from '@/shared';
import { HAZARD_KINDS } from '@/shared';
import type Phaser from 'phaser';
import { BlueFlameHazardEntity } from '../../../entities/BlueFlameHazardEntity';
import { FireFieldHazardEntity } from '../../../entities/FireFieldHazardEntity';
import { FireballHazardEntity } from '../../../entities/FireballHazardEntity';
import { PurpleFieldHazardEntity } from '../../../entities/PurpleFieldHazardEntity';

type HazardEntity =
  | FireFieldHazardEntity
  | PurpleFieldHazardEntity
  | BlueFlameHazardEntity
  | FireballHazardEntity;

export const hazardRegistry: Record<
  HazardKind,
  { create: (scene: Phaser.Scene, snapshot: HazardSnapshot) => HazardEntity }
> = {
  [HAZARD_KINDS.FIRE_FIELD]: {
    create: (scene, snapshot) =>
      new FireFieldHazardEntity(scene, snapshot.x, snapshot.y, snapshot.tint),
  },
  [HAZARD_KINDS.PURPLE_FIELD]: {
    create: (scene, snapshot) => new PurpleFieldHazardEntity(scene, snapshot.x, snapshot.y),
  },
  [HAZARD_KINDS.BLUE_FLAME]: {
    create: (scene, snapshot) => new BlueFlameHazardEntity(scene, snapshot.x, snapshot.y),
  },
  [HAZARD_KINDS.FIREBALL]: {
    create: (scene, snapshot) =>
      new FireballHazardEntity(scene, snapshot.x, snapshot.y, snapshot.direction ?? 'right'),
  },
};
