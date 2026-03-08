import type { BossKind } from '@gelehka/shared';
import { BOSS_KINDS, HAZARD_KINDS } from '@gelehka/shared';
import type { HazardKind } from '@gelehka/shared';
import { DRAGON_LORD_DAMAGE, DRAGON_LORD_MAX_HP, DragonLord } from './DragonLord.js';

export const PHASE3_BOSS_KINDS = [
  BOSS_KINDS.SILVERBACK_WAINER,
  BOSS_KINDS.SLIM_MAIOLI,
  BOSS_KINDS.FRANKLY_STEIN,
] as const;

export type Phase3BossKind = (typeof PHASE3_BOSS_KINDS)[number];

// TODO: split per-boss HP when final balancing is defined.
export const PHASE3_BOSS_MAX_HP = DRAGON_LORD_MAX_HP;
export const PHASE3_BOSS_SPEED = 70;

function resolveFlameKind(kind: Phase3BossKind): HazardKind {
  if (kind === BOSS_KINDS.SILVERBACK_WAINER) {
    return HAZARD_KINDS.FIRE_FIELD;
  }
  if (kind === BOSS_KINDS.SLIM_MAIOLI) {
    return HAZARD_KINDS.PURPLE_FIELD;
  }
  return HAZARD_KINDS.BLUE_FLAME;
}

export class Phase3Boss extends DragonLord {
  readonly flameKind: HazardKind;

  constructor(id: string, x: number, y: number, kind: Phase3BossKind) {
    super(id, x, y);
    this.kind = kind as BossKind;
    this.maxHp = PHASE3_BOSS_MAX_HP;
    this.hp = PHASE3_BOSS_MAX_HP;
    this.speed = PHASE3_BOSS_SPEED;
    this.damage = DRAGON_LORD_DAMAGE + 10;
    this.flameKind = resolveFlameKind(kind);
  }
}
