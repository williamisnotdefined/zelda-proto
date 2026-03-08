import {
  BOSS_KINDS,
  DROP_KINDS,
  ENEMY_KINDS,
  INSTANCE_IDS,
  PORTAL_KINDS,
  type BossKind,
  type DropKind,
  type EnemyKind,
  type InstanceId,
  type PortalKind,
} from '@gelehka/shared';
import blobSpriteSheet from '../../../../client/public/assets/sprites/monsters/blob.png';
import decorTileSheet from '../../../../client/public/assets/sprites/tilesets/decor_16x16.png';
import dragonSpriteSheet from '../../../../client/public/assets/sprites/monsters/dragon_lord.png';
import franklySpriteSheet from '../../../../client/public/assets/sprites/monsters/frankly_stein.png';
import gelehkSpriteSheet from '../../../../client/public/assets/sprites/monsters/gelehk.png';
import handSpriteSheet from '../../../../client/public/assets/sprites/monsters/hand.png';
import heartLargeSprite from '../../../../client/public/assets/sprites/heart/heart_32x32.png';
import heartSmallSprite from '../../../../client/public/assets/sprites/heart/heart_16x16.png';
import plainsTileSheet from '../../../../client/public/assets/sprites/tilesets/plains.png';
import playerSpriteSheet from '../../../../client/public/assets/sprites/characters/player.png';
import silverbackSpriteSheet from '../../../../client/public/assets/sprites/monsters/silverback_wainer.png';
import slimMaioliSpriteSheet from '../../../../client/public/assets/sprites/monsters/slim_maioli.png';
import slimeSpriteSheet from '../../../../client/public/assets/sprites/monsters/Slime.png';

export interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export {
  playerSpriteSheet,
  blobSpriteSheet,
  slimeSpriteSheet,
  handSpriteSheet,
  heartSmallSprite,
  heartLargeSprite,
  plainsTileSheet,
  decorTileSheet,
  gelehkSpriteSheet,
  dragonSpriteSheet,
  silverbackSpriteSheet,
  slimMaioliSpriteSheet,
  franklySpriteSheet,
};

const INSTANCE_THEME: Record<InstanceId, { fallback: string; accent: string }> = {
  [INSTANCE_IDS.PHASE1]: { fallback: '#10221a', accent: '#4f7f57' },
  [INSTANCE_IDS.PHASE2]: { fallback: '#241e11', accent: '#8f7653' },
  [INSTANCE_IDS.PHASE3]: { fallback: '#0d1723', accent: '#5a7ea3' },
};

export function getEnemyAsset(kind: EnemyKind): { source: number; scale: number } {
  if (kind === ENEMY_KINDS.SLIME) {
    return { source: slimeSpriteSheet, scale: 1.1 };
  }
  if (kind === ENEMY_KINDS.HAND) {
    return { source: handSpriteSheet, scale: 1.05 };
  }
  return { source: blobSpriteSheet, scale: 1.25 };
}

export function getBossAsset(kind: BossKind): { source: number; scale: number; label: string } {
  switch (kind) {
    case BOSS_KINDS.DRAGON_LORD:
      return { source: dragonSpriteSheet, scale: 2.05, label: 'DRAGON LORD' };
    case BOSS_KINDS.SILVERBACK_WAINER:
      return { source: silverbackSpriteSheet, scale: 1.9, label: 'SILVERBACK' };
    case BOSS_KINDS.SLIM_MAIOLI:
      return { source: slimMaioliSpriteSheet, scale: 1.9, label: 'SLIM MAIOLI' };
    case BOSS_KINDS.FRANKLY_STEIN:
      return { source: franklySpriteSheet, scale: 1.9, label: 'FRANKLY STEIN' };
    default:
      return { source: gelehkSpriteSheet, scale: 2.4, label: 'GELEHK' };
  }
}

export function getDropAsset(kind: DropKind): { source: number; size: number } {
  if (kind === DROP_KINDS.HEART_LARGE) {
    return { source: heartLargeSprite, size: 26 };
  }
  return { source: heartSmallSprite, size: 18 };
}

export function getPortalPalette(kind: PortalKind): {
  outer: string;
  inner: string;
  radius: number;
} {
  if (kind === PORTAL_KINDS.PHASE1_TO_PHASE2 || kind === PORTAL_KINDS.PHASE2_TO_PHASE3) {
    return { outer: '#80d8ff', inner: '#d9fbff', radius: 24 };
  }
  return { outer: '#a389ff', inner: '#e8ddff', radius: 18 };
}

export function getHazardPalette(kind: string): { fill: string; stroke: string; radius: number } {
  if (kind === 'purple_field') {
    return { fill: '#8f5bff', stroke: '#d8c5ff', radius: 18 };
  }
  if (kind === 'blue_flame') {
    return { fill: '#3cb6ff', stroke: '#c9f0ff', radius: 18 };
  }
  return { fill: '#ff6a3d', stroke: '#ffd2b9', radius: 18 };
}

export function getInstanceTheme(instanceId: InstanceId | null): {
  fallback: string;
  accent: string;
} {
  if (!instanceId) {
    return INSTANCE_THEME[INSTANCE_IDS.PHASE1];
  }
  return INSTANCE_THEME[instanceId] ?? INSTANCE_THEME[INSTANCE_IDS.PHASE1];
}
