import type { AoeIndicator, BossKind, BossSnapshot, IceZone } from '@gelehka/shared';
import { BOSS_KINDS } from '@gelehka/shared';
import Phaser from 'phaser';
import { BossDragonLordEntity } from '../../../entities/BossDragonLord';
import { BossGelehkEntity } from '../../../entities/BossGelehk';
import { BossPhase3Entity } from '../../../entities/BossPhase3';

export type BossEntity = BossGelehkEntity | BossDragonLordEntity | BossPhase3Entity;

interface BossUpdateContext {
  iceZones: IceZone[];
  aoeIndicators: AoeIndicator[];
}

export interface BossRegistryEntry {
  create(scene: Phaser.Scene, snapshot: BossSnapshot): BossEntity;
  update(entity: BossEntity, snapshot: BossSnapshot, context: BossUpdateContext): void;
}

export type BossRegistry = Record<BossKind, BossRegistryEntry>;

function getPhase3BossVisual(kind: BossSnapshot['kind']): {
  textureKey: string;
  animPrefix: string;
  label: string;
} {
  if (kind === BOSS_KINDS.SILVERBACK_WAINER) {
    return {
      textureKey: 'silverback_wainer',
      animPrefix: 'silverback_wainer',
      label: 'SILVERBACK WAINER',
    };
  }

  if (kind === BOSS_KINDS.SLIM_MAIOLI) {
    return {
      textureKey: 'slim_maioli',
      animPrefix: 'slim_maioli',
      label: 'SLIM MAIOLI',
    };
  }

  return {
    textureKey: 'frankly_stein',
    animPrefix: 'frankly_stein',
    label: 'FRANKLY STEIN',
  };
}

export const bossRegistry: BossRegistry = {
  [BOSS_KINDS.GELEHK]: {
    create: (scene, snapshot) => new BossGelehkEntity(scene, snapshot.x, snapshot.y),
    update: (entity, snapshot, context) => {
      (entity as BossGelehkEntity).updateFromServer(
        snapshot.x,
        snapshot.y,
        snapshot.hp,
        snapshot.maxHp,
        snapshot.state,
        snapshot.phase,
        context.iceZones,
        context.aoeIndicators.filter((aoe) => aoe.ownerId === snapshot.id)
      );
    },
  },
  [BOSS_KINDS.DRAGON_LORD]: {
    create: (scene, snapshot) => new BossDragonLordEntity(scene, snapshot.x, snapshot.y),
    update: (entity, snapshot) => {
      (entity as BossDragonLordEntity).updateFromServer(
        snapshot.x,
        snapshot.y,
        snapshot.hp,
        snapshot.maxHp,
        snapshot.state,
        snapshot.phase
      );
    },
  },
  [BOSS_KINDS.SILVERBACK_WAINER]: {
    create: (scene, snapshot) => {
      const visual = getPhase3BossVisual(snapshot.kind);
      return new BossPhase3Entity(
        scene,
        snapshot.x,
        snapshot.y,
        visual.textureKey,
        visual.animPrefix,
        visual.label
      );
    },
    update: (entity, snapshot) => {
      (entity as BossPhase3Entity).updateFromServer(
        snapshot.x,
        snapshot.y,
        snapshot.hp,
        snapshot.maxHp,
        snapshot.state,
        snapshot.phase
      );
    },
  },
  [BOSS_KINDS.SLIM_MAIOLI]: {
    create: (scene, snapshot) => {
      const visual = getPhase3BossVisual(snapshot.kind);
      return new BossPhase3Entity(
        scene,
        snapshot.x,
        snapshot.y,
        visual.textureKey,
        visual.animPrefix,
        visual.label
      );
    },
    update: (entity, snapshot) => {
      (entity as BossPhase3Entity).updateFromServer(
        snapshot.x,
        snapshot.y,
        snapshot.hp,
        snapshot.maxHp,
        snapshot.state,
        snapshot.phase
      );
    },
  },
  [BOSS_KINDS.FRANKLY_STEIN]: {
    create: (scene, snapshot) => {
      const visual = getPhase3BossVisual(snapshot.kind);
      return new BossPhase3Entity(
        scene,
        snapshot.x,
        snapshot.y,
        visual.textureKey,
        visual.animPrefix,
        visual.label
      );
    },
    update: (entity, snapshot) => {
      (entity as BossPhase3Entity).updateFromServer(
        snapshot.x,
        snapshot.y,
        snapshot.hp,
        snapshot.maxHp,
        snapshot.state,
        snapshot.phase
      );
    },
  },
};
