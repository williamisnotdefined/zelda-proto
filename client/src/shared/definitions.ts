import {
  BOSS_KINDS,
  DROP_KINDS,
  ENEMY_KINDS,
  HAZARD_KINDS,
  PLAYER_STATUS_EFFECTS,
  PORTAL_KINDS,
} from './types.js';
import type {
  BossKind,
  BossPhase,
  DropKind,
  EnemyKind,
  HazardKind,
  PlayerStatusEffect,
  PortalKind,
} from './types.js';

export interface EnemyDefinition {
  kind: EnemyKind;
  family: string;
}

export interface BossDefinition {
  kind: BossKind;
  label: string;
  family: string;
  defaultPhase: BossPhase;
}

export interface DropDefinition {
  kind: DropKind;
  healAmount: number;
}

export interface PortalDefinition {
  kind: PortalKind;
  group: 'advance' | 'return';
}

export interface HazardDefinition {
  kind: HazardKind;
  ttlMs: number;
  hitRadius: number;
  burningTicks: number;
  idPrefix: string;
  statusEffect?: PlayerStatusEffect;
}

export const enemyDefinitions: Record<EnemyKind, EnemyDefinition> = {
  [ENEMY_KINDS.BLOB]: {
    kind: ENEMY_KINDS.BLOB,
    family: 'blob',
  },
  [ENEMY_KINDS.SLIME]: {
    kind: ENEMY_KINDS.SLIME,
    family: 'slime',
  },
  [ENEMY_KINDS.HAND]: {
    kind: ENEMY_KINDS.HAND,
    family: 'hand',
  },
  [ENEMY_KINDS.PACMAN_GHOST]: {
    kind: ENEMY_KINDS.PACMAN_GHOST,
    family: 'pacman_ghost',
  },
};

export const bossDefinitions: Record<BossKind, BossDefinition> = {
  [BOSS_KINDS.GELEHK]: {
    kind: BOSS_KINDS.GELEHK,
    label: 'Gelehk',
    family: 'gelehk',
    defaultPhase: 1,
  },
  [BOSS_KINDS.DRAGON_LORD]: {
    kind: BOSS_KINDS.DRAGON_LORD,
    label: 'Dragon Lord',
    family: 'dragon',
    defaultPhase: 1,
  },
  [BOSS_KINDS.SILVERBACK_WAINER]: {
    kind: BOSS_KINDS.SILVERBACK_WAINER,
    label: 'Silverback Wainer',
    family: 'phase3',
    defaultPhase: 3,
  },
  [BOSS_KINDS.SLIM_MAIOLI]: {
    kind: BOSS_KINDS.SLIM_MAIOLI,
    label: 'Slim Maioli',
    family: 'phase3',
    defaultPhase: 3,
  },
  [BOSS_KINDS.FRANKLY_STEIN]: {
    kind: BOSS_KINDS.FRANKLY_STEIN,
    label: 'Frankly Stein',
    family: 'phase3',
    defaultPhase: 3,
  },
  [BOSS_KINDS.VANESSA_THE_RUTHLESS]: {
    kind: BOSS_KINDS.VANESSA_THE_RUTHLESS,
    label: 'Vanessa the Ruthless',
    family: 'phase4',
    defaultPhase: 4,
  },
};

export const dropDefinitions: Record<DropKind, DropDefinition> = {
  [DROP_KINDS.HEART_SMALL]: {
    kind: DROP_KINDS.HEART_SMALL,
    healAmount: 5,
  },
  [DROP_KINDS.HEART_LARGE]: {
    kind: DROP_KINDS.HEART_LARGE,
    healAmount: 10,
  },
  [DROP_KINDS.HEART_PACMAN]: {
    kind: DROP_KINDS.HEART_PACMAN,
    healAmount: 20,
  },
};

export const portalDefinitions: Record<PortalKind, PortalDefinition> = {
  [PORTAL_KINDS.PHASE1_TO_PHASE2]: {
    kind: PORTAL_KINDS.PHASE1_TO_PHASE2,
    group: 'advance',
  },
  [PORTAL_KINDS.PHASE2_TO_PHASE1]: {
    kind: PORTAL_KINDS.PHASE2_TO_PHASE1,
    group: 'return',
  },
  [PORTAL_KINDS.PHASE2_TO_PHASE3]: {
    kind: PORTAL_KINDS.PHASE2_TO_PHASE3,
    group: 'advance',
  },
  [PORTAL_KINDS.PHASE3_TO_PHASE2]: {
    kind: PORTAL_KINDS.PHASE3_TO_PHASE2,
    group: 'return',
  },
  [PORTAL_KINDS.PHASE3_TO_PHASE4]: {
    kind: PORTAL_KINDS.PHASE3_TO_PHASE4,
    group: 'advance',
  },
  [PORTAL_KINDS.PHASE4_TO_PHASE3]: {
    kind: PORTAL_KINDS.PHASE4_TO_PHASE3,
    group: 'return',
  },
};

export const hazardDefinitions: Record<HazardKind, HazardDefinition> = {
  [HAZARD_KINDS.FIRE_FIELD]: {
    kind: HAZARD_KINDS.FIRE_FIELD,
    ttlMs: 1800,
    hitRadius: 18,
    burningTicks: 3,
    idPrefix: 'hazard_fire',
    statusEffect: PLAYER_STATUS_EFFECTS.BURNING,
  },
  [HAZARD_KINDS.PURPLE_FIELD]: {
    kind: HAZARD_KINDS.PURPLE_FIELD,
    ttlMs: 3000,
    hitRadius: 18,
    burningTicks: 3,
    idPrefix: 'hazard_purple',
    statusEffect: PLAYER_STATUS_EFFECTS.PURPLE_BURNING,
  },
  [HAZARD_KINDS.BLUE_FLAME]: {
    kind: HAZARD_KINDS.BLUE_FLAME,
    ttlMs: 1800,
    hitRadius: 18,
    burningTicks: 3,
    idPrefix: 'hazard_blue',
    statusEffect: PLAYER_STATUS_EFFECTS.BLUE_BURNING,
  },
  [HAZARD_KINDS.FIREBALL]: {
    kind: HAZARD_KINDS.FIREBALL,
    ttlMs: 400,
    hitRadius: 18,
    burningTicks: 0,
    idPrefix: 'hazard_fireball',
  },
};
