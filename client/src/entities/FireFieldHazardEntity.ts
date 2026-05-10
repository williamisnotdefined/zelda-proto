import { hazardDefinitions } from '@/shared/definitions';
import { HAZARD_KINDS } from '@/shared';
import Phaser from 'phaser';
import { FieldHazardEntity } from './FieldHazardEntity';

const FIRE_FIELD_HIT_ZONE_COLOR = 0xff3b30;
const FIRE_FIELD_ALPHA = 0.62;

export class FireFieldHazardEntity extends FieldHazardEntity {
  constructor(scene: Phaser.Scene, x: number, y: number, tint?: number) {
    super(scene, x, y, {
      textureKey: 'fire_field',
      animationKey: 'fire_field_loop',
      alpha: FIRE_FIELD_ALPHA,
      hitRadius: hazardDefinitions[HAZARD_KINDS.FIRE_FIELD].hitRadius,
      hitZoneColor: FIRE_FIELD_HIT_ZONE_COLOR,
      tint,
    });
  }
}
