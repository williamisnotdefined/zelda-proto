import { hazardDefinitions } from '@/shared/definitions';
import { HAZARD_KINDS } from '@/shared';
import Phaser from 'phaser';
import { FieldHazardEntity } from './FieldHazardEntity';

const PURPLE_FIELD_HIT_ZONE_COLOR = 0xc06bff;
const PURPLE_FIELD_ALPHA = 0.52;
const PURPLE_FIELD_SIZE_PX = 58;

export class PurpleFieldHazardEntity extends FieldHazardEntity {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, {
      textureKey: 'purple_field',
      animationKey: 'purple_field_loop',
      alpha: PURPLE_FIELD_ALPHA,
      hitRadius: hazardDefinitions[HAZARD_KINDS.PURPLE_FIELD].hitRadius,
      hitZoneColor: PURPLE_FIELD_HIT_ZONE_COLOR,
      sizePx: PURPLE_FIELD_SIZE_PX,
    });
  }
}
