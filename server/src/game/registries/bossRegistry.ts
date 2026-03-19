import type { BossDefinition } from '@gelehka/shared/definitions';
import { bossDefinitions } from '@gelehka/shared/definitions';
import { BOSS_KINDS } from '@gelehka/shared';
import type { AoeIndicator, BossKind, IceZone } from '../../network/MessageTypes.js';
import { BossGelehk, BOSS_HEIGHT, BOSS_WIDTH, ICE_ZONE_SLOW } from '../../entities/BossGelehk.js';
import {
  DragonLord,
  DRAGON_LORD_CONTACT_RADIUS,
  DRAGON_LORD_HEIGHT,
  DRAGON_LORD_WIDTH,
} from '../../entities/DragonLord.js';
import { Phase3Boss } from '../../entities/Phase3Boss.js';
import type { Player } from '../../entities/Player.js';
import type { BossRegionContext } from '../systems/BossRegionSystem.js';

export type BossRuntimeEntity = BossGelehk | DragonLord | Phase3Boss;
type DragonLikeBossKind =
  | typeof BOSS_KINDS.DRAGON_LORD
  | typeof BOSS_KINDS.SILVERBACK_WAINER
  | typeof BOSS_KINDS.SLIM_MAIOLI
  | typeof BOSS_KINDS.FRANKLY_STEIN;

export interface BossAttackBounds {
  width: number;
  height: number;
  halfDiagonal: number;
}

export interface BossRuntimeDefinition<TBoss extends BossRuntimeEntity = BossRuntimeEntity> {
  kind: BossKind;
  definition: BossDefinition;
  attackBounds: BossAttackBounds;
  contactDamageRadius?: number;
  create(id: string, x: number, y: number): TBoss;
  update(boss: TBoss, context: BossRegionContext): void;
  getContactDamageAmount?(boss: TBoss): number;
  canDealContactDamage?(boss: TBoss, playerId: string): boolean;
  markContactDamageDealt?(boss: TBoss, playerId: string): void;
  getPlayerSpeedMultiplier?(boss: TBoss, player: Player): number;
  onSafeZoneExpel?(boss: TBoss): void;
  collectSnapshotEffects?(boss: TBoss): {
    iceZones?: IceZone[];
    aoeIndicators?: AoeIndicator[];
  };
}

function createAttackBounds(width: number, height: number): BossAttackBounds {
  return {
    width,
    height,
    halfDiagonal: Math.hypot(width / 2, height / 2),
  };
}

const GELEHK_ATTACK_BOUNDS = createAttackBounds(BOSS_WIDTH, BOSS_HEIGHT);
const DRAGON_ATTACK_BOUNDS = createAttackBounds(DRAGON_LORD_WIDTH, DRAGON_LORD_HEIGHT);

function createDragonLikeRuntimeDefinition(
  kind: DragonLikeBossKind
): BossRuntimeDefinition<DragonLord | Phase3Boss> {
  return {
    kind,
    definition: bossDefinitions[kind],
    attackBounds: DRAGON_ATTACK_BOUNDS,
    contactDamageRadius: DRAGON_LORD_CONTACT_RADIUS,
    create: (id, x, y) =>
      kind === BOSS_KINDS.DRAGON_LORD ? new DragonLord(id, x, y) : new Phase3Boss(id, x, y, kind),
    update: (boss, context) => {
      boss.update(
        context.dt,
        context.players,
        (x, y, dirX, dirY) => {
          const flameKind = 'flameKind' in boss ? boss.flameKind : undefined;
          context.spawnFireLine(x, y, dirX, dirY, flameKind);
        },
        context.findNearestPlayerInRadius
      );
    },
    getContactDamageAmount: (boss) => boss.damage,
    canDealContactDamage: (boss, playerId) => boss.canDealContactDamageTo(playerId),
    markContactDamageDealt: (boss, playerId) => {
      boss.markContactDamageDealt(playerId);
    },
    onSafeZoneExpel: (boss) => {
      boss.targetPlayerId = null;
    },
  };
}

const gelehkDefinition: BossRuntimeDefinition<BossGelehk> = {
  kind: BOSS_KINDS.GELEHK,
  definition: bossDefinitions[BOSS_KINDS.GELEHK],
  attackBounds: GELEHK_ATTACK_BOUNDS,
  create: (id, x, y) => new BossGelehk(id, x, y),
  update: (boss, context) => {
    boss.update(
      context.dt,
      context.players,
      (x, y, _count) => {
        context.spawnMinions(x, y);
      },
      (x, y) => {
        context.spawnPurpleField(x, y);
      },
      context.safeZone,
      context.findNearestPlayerInRadius,
      context.forEachPlayerInRadius
    );
  },
  getPlayerSpeedMultiplier: (boss, player) => {
    if (boss.active && boss.state !== 'dead' && boss.isInIceZone(player.x, player.y)) {
      return ICE_ZONE_SLOW;
    }
    return 1;
  },
  collectSnapshotEffects: (boss) => ({
    iceZones: boss.iceZones,
    aoeIndicators: boss.aoeIndicators,
  }),
};

export const bossRegistry: Record<BossKind, BossRuntimeDefinition> = {
  [BOSS_KINDS.GELEHK]: gelehkDefinition,
  [BOSS_KINDS.DRAGON_LORD]: createDragonLikeRuntimeDefinition(BOSS_KINDS.DRAGON_LORD),
  [BOSS_KINDS.SILVERBACK_WAINER]: createDragonLikeRuntimeDefinition(BOSS_KINDS.SILVERBACK_WAINER),
  [BOSS_KINDS.SLIM_MAIOLI]: createDragonLikeRuntimeDefinition(BOSS_KINDS.SLIM_MAIOLI),
  [BOSS_KINDS.FRANKLY_STEIN]: createDragonLikeRuntimeDefinition(BOSS_KINDS.FRANKLY_STEIN),
};

export const MAX_BOSS_ATTACK_HALF_DIAGONAL = Math.max(
  ...Object.values(bossRegistry).map((definition) => definition.attackBounds.halfDiagonal)
);

export function getBossRuntimeDefinition(kind: BossKind): BossRuntimeDefinition {
  return bossRegistry[kind];
}
