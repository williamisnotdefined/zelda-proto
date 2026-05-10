import { hazardDefinitions } from '@/shared/definitions';
import { HAZARD_KINDS } from '@/shared';
import Phaser from 'phaser';
import { FieldHazardEntity } from './FieldHazardEntity';

const BLUE_FLAME_HIT_ZONE_COLOR = 0x58a6ff;
const BLUE_FLAME_ALPHA = 0.62;

export class BlueFlameHazardEntity extends FieldHazardEntity {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, {
      textureKey: 'blue_flame',
      alpha: BLUE_FLAME_ALPHA,
      hitRadius: hazardDefinitions[HAZARD_KINDS.BLUE_FLAME].hitRadius,
      hitZoneColor: BLUE_FLAME_HIT_ZONE_COLOR,
    });
  }
}
