import type { BossKind, EnemyKind } from '@gelehka/shared';
import { ENEMY_KINDS } from '@gelehka/shared';
import { EcsWorld, type EntityId } from '../../core/ecs/EcsWorld.js';
import { SpatialQueryIndex } from '../../core/ecs/SpatialQueryIndex.js';
import { BLOB_CONTACT_RADIUS, type Blob } from '../../entities/Blob.js';
import type { Player } from '../../entities/Player.js';
import {
  COMBAT_COMPONENTS,
  type CombatActorRole,
  type CombatDamageableComponent,
  type ContactDamageComponent,
  type MeleeHitIntentComponent,
  type MeleeHitIntentEntry,
  type PendingDamageComponent,
  type PendingDamageEntry,
  type SafeZoneArea,
  type SafeZoneProtectedComponent,
} from '../combat/components.js';
import { getBossRuntimeDefinition, type BossRuntimeEntity } from '../registries/bossRegistry.js';
import { EcsBackedCollection } from './EcsBackedCollection.js';

interface ActorMetaComponent {
  role: CombatActorRole;
  kind?: EnemyKind | BossKind;
  state: string;
  alive: boolean;
}

const PLAYER_COMPONENT = 'player';
const ENEMY_COMPONENT = 'enemy';
const BOSS_COMPONENT = 'boss';
const ACTOR_META_COMPONENT = 'actor_meta';
const ALIVE_COMPONENT = 'alive';
const DEFAULT_CELL_SIZE = 512;
const SAFE_ZONE_PROTECTED_COMPONENT: SafeZoneProtectedComponent = {
  active: true,
};

function isAlive(value: { state: string }): boolean {
  return value.state !== 'dead';
}

function setDamageable(ecsWorld: EcsWorld, entityId: EntityId, actorRole: CombatActorRole): void {
  const component: CombatDamageableComponent = { actorRole };
  ecsWorld.setComponent(entityId, COMBAT_COMPONENTS.DAMAGEABLE, component);
}

function syncActorMeta(
  ecsWorld: EcsWorld,
  entityId: EntityId,
  role: CombatActorRole,
  value: { state: string; kind?: EnemyKind | BossKind }
): void {
  const alive = isAlive(value);
  const meta: ActorMetaComponent = {
    role,
    state: value.state,
    alive,
    ...(value.kind ? { kind: value.kind } : {}),
  };

  ecsWorld.setComponent(entityId, ACTOR_META_COMPONENT, meta);
  if (alive) {
    ecsWorld.setComponent(entityId, ALIVE_COMPONENT, true);
  } else {
    ecsWorld.removeComponent(entityId, ALIVE_COMPONENT);
  }
}

function syncPlayerCombatState(
  ecsWorld: EcsWorld,
  entityId: EntityId,
  player: Player,
  safeZone?: SafeZoneArea
): void {
  setDamageable(ecsWorld, entityId, 'player');

  if (safeZone && player.isProtected(safeZone.x, safeZone.y, safeZone.radius)) {
    ecsWorld.setComponent(
      entityId,
      COMBAT_COMPONENTS.SAFE_ZONE_PROTECTED,
      SAFE_ZONE_PROTECTED_COMPONENT
    );
  } else {
    ecsWorld.removeComponent(entityId, COMBAT_COMPONENTS.SAFE_ZONE_PROTECTED);
  }
}

function syncEnemyCombatState(ecsWorld: EcsWorld, entityId: EntityId, enemy: Blob): void {
  setDamageable(ecsWorld, entityId, 'enemy');

  if (enemy.state === 'dead' || enemy.damageCooldown > 0) {
    ecsWorld.removeComponent(entityId, COMBAT_COMPONENTS.CONTACT_DAMAGE);
    return;
  }

  const component: ContactDamageComponent = {
    actorRole: 'enemy',
    actorKind: enemy.kind,
    radius: enemy.contactRadius ?? BLOB_CONTACT_RADIUS,
    damage: enemy.damage,
  };
  ecsWorld.setComponent(entityId, COMBAT_COMPONENTS.CONTACT_DAMAGE, component);
}

function syncBossCombatState(
  ecsWorld: EcsWorld,
  entityId: EntityId,
  boss: BossRuntimeEntity
): void {
  setDamageable(ecsWorld, entityId, 'boss');

  const definition = getBossRuntimeDefinition(boss.kind);
  const contactDamageRadius = definition.contactDamageRadius;
  const getContactDamageAmount = definition.getContactDamageAmount;

  if (boss.state === 'dead' || !contactDamageRadius || !getContactDamageAmount) {
    ecsWorld.removeComponent(entityId, COMBAT_COMPONENTS.CONTACT_DAMAGE);
    return;
  }

  const component: ContactDamageComponent = {
    actorRole: 'boss',
    actorKind: boss.kind,
    radius: contactDamageRadius,
    damage: getContactDamageAmount(boss),
  };
  ecsWorld.setComponent(entityId, COMBAT_COMPONENTS.CONTACT_DAMAGE, component);
}

function createEnemyStores(
  ecsWorld: EcsWorld,
  spatialIndex: SpatialQueryIndex
): Map<EnemyKind, EcsBackedCollection<Blob>> {
  const createStore = (kind: EnemyKind) =>
    new EcsBackedCollection<Blob>(ecsWorld, ENEMY_COMPONENT, {
      onSet: (world, entityId, enemy) => {
        syncActorMeta(world, entityId, 'enemy', enemy);
        syncEnemyCombatState(world, entityId, enemy);
        world.setComponent(entityId, 'enemy_kind', kind);
        spatialIndex.upsert(entityId, enemy.x, enemy.y);
      },
      onDelete: (_world, entityId) => {
        spatialIndex.remove(entityId);
      },
    });

  return new Map<EnemyKind, EcsBackedCollection<Blob>>([
    [ENEMY_KINDS.BLOB, createStore(ENEMY_KINDS.BLOB)],
    [ENEMY_KINDS.SLIME, createStore(ENEMY_KINDS.SLIME)],
    [ENEMY_KINDS.HAND, createStore(ENEMY_KINDS.HAND)],
    [ENEMY_KINDS.PACMAN_GHOST, createStore(ENEMY_KINDS.PACMAN_GHOST)],
  ]);
}

export class ActorStore {
  readonly ecsWorld = new EcsWorld();
  private readonly spatialIndex = new SpatialQueryIndex(DEFAULT_CELL_SIZE);
  readonly players = new EcsBackedCollection<Player>(this.ecsWorld, PLAYER_COMPONENT, {
    onSet: (ecsWorld, entityId, player) => {
      syncActorMeta(ecsWorld, entityId, 'player', player);
      syncPlayerCombatState(ecsWorld, entityId, player);
      this.spatialIndex.upsert(entityId, player.x, player.y);
    },
    onDelete: (_ecsWorld, entityId) => {
      this.spatialIndex.remove(entityId);
    },
  });
  readonly bosses = new EcsBackedCollection<BossRuntimeEntity>(this.ecsWorld, BOSS_COMPONENT, {
    onSet: (ecsWorld, entityId, boss) => {
      syncActorMeta(ecsWorld, entityId, 'boss', boss);
      syncBossCombatState(ecsWorld, entityId, boss);
      ecsWorld.setComponent(entityId, 'boss_kind', boss.kind);
      this.spatialIndex.upsert(entityId, boss.x, boss.y);
    },
    onDelete: (_ecsWorld, entityId) => {
      this.spatialIndex.remove(entityId);
    },
  });
  readonly enemyStores = createEnemyStores(this.ecsWorld, this.spatialIndex);

  getEnemyStore(kind: EnemyKind): EcsBackedCollection<Blob> {
    const store = this.enemyStores.get(kind);
    if (!store) {
      throw new Error(`Missing enemy store for kind ${kind}`);
    }
    return store;
  }

  getEnemyStores(): Iterable<EcsBackedCollection<Blob>> {
    return this.enemyStores.values();
  }

  syncPlayers(safeZone?: SafeZoneArea): void {
    this.players.syncAll();

    for (const [playerId, player] of this.players) {
      const entityId = this.players.getEntityId(playerId);
      if (entityId === undefined) {
        continue;
      }
      syncPlayerCombatState(this.ecsWorld, entityId, player, safeZone);
    }
  }

  syncBosses(): void {
    this.bosses.syncAll();
  }

  syncEnemies(): void {
    for (const store of this.enemyStores.values()) {
      store.syncAll();
    }
  }

  syncAllActors(safeZone?: SafeZoneArea): void {
    this.syncPlayers(safeZone);
    this.syncEnemies();
    this.syncBosses();
  }

  getPlayers(): Player[] {
    return this.queryObjects<Player>([PLAYER_COMPONENT]);
  }

  getAlivePlayers(): Player[] {
    return this.queryObjects<Player>([PLAYER_COMPONENT, ALIVE_COMPONENT]);
  }

  getEnemies(): Blob[] {
    return this.queryObjects<Blob>([ENEMY_COMPONENT]);
  }

  getAliveEnemies(): Blob[] {
    return this.queryObjects<Blob>([ENEMY_COMPONENT, ALIVE_COMPONENT]);
  }

  getBosses(): BossRuntimeEntity[] {
    return this.queryObjects<BossRuntimeEntity>([BOSS_COMPONENT]);
  }

  getAliveBosses(): BossRuntimeEntity[] {
    return this.queryObjects<BossRuntimeEntity>([BOSS_COMPONENT, ALIVE_COMPONENT]);
  }

  getPlayerById(playerId: string): Player | null {
    return this.players.get(playerId) ?? null;
  }

  getEnemyById(enemyId: string): Blob | null {
    for (const store of this.enemyStores.values()) {
      const enemy = store.get(enemyId);
      if (enemy) {
        return enemy;
      }
    }

    return null;
  }

  getBossById(bossId: string): BossRuntimeEntity | null {
    return this.bosses.get(bossId) ?? null;
  }

  getEnemyContactSources(): Blob[] {
    return this.queryObjects<Blob>([
      ENEMY_COMPONENT,
      ALIVE_COMPONENT,
      COMBAT_COMPONENTS.CONTACT_DAMAGE,
    ]);
  }

  getBossContactSources(): BossRuntimeEntity[] {
    return this.queryObjects<BossRuntimeEntity>([
      BOSS_COMPONENT,
      ALIVE_COMPONENT,
      COMBAT_COMPONENTS.CONTACT_DAMAGE,
    ]);
  }

  getPlayersWithMeleeHitIntents(): Player[] {
    return this.queryObjects<Player>([PLAYER_COMPONENT, COMBAT_COMPONENTS.MELEE_HIT_INTENT]);
  }

  getPlayersWithPendingDamage(): Player[] {
    return this.queryObjects<Player>([
      PLAYER_COMPONENT,
      COMBAT_COMPONENTS.DAMAGEABLE,
      COMBAT_COMPONENTS.PENDING_DAMAGE,
    ]);
  }

  getEnemiesWithPendingDamage(): Blob[] {
    return this.queryObjects<Blob>([
      ENEMY_COMPONENT,
      COMBAT_COMPONENTS.DAMAGEABLE,
      COMBAT_COMPONENTS.PENDING_DAMAGE,
    ]);
  }

  getBossesWithPendingDamage(): BossRuntimeEntity[] {
    return this.queryObjects<BossRuntimeEntity>([
      BOSS_COMPONENT,
      COMBAT_COMPONENTS.DAMAGEABLE,
      COMBAT_COMPONENTS.PENDING_DAMAGE,
    ]);
  }

  isPlayerSafeZoneProtected(playerId: string): boolean {
    const entityId = this.players.getEntityId(playerId);
    if (entityId === undefined) {
      return false;
    }

    return this.ecsWorld.hasComponent(entityId, COMBAT_COMPONENTS.SAFE_ZONE_PROTECTED);
  }

  queuePlayerMeleeHitIntent(playerId: string, entry: MeleeHitIntentEntry): void {
    const entityId = this.players.getEntityId(playerId);
    if (entityId === undefined) {
      return;
    }

    const hitIntent = this.ecsWorld.getComponent<MeleeHitIntentComponent>(
      entityId,
      COMBAT_COMPONENTS.MELEE_HIT_INTENT
    );
    if (hitIntent) {
      hitIntent.entries.push(entry);
      return;
    }

    this.ecsWorld.setComponent<MeleeHitIntentComponent>(
      entityId,
      COMBAT_COMPONENTS.MELEE_HIT_INTENT,
      {
        entries: [entry],
      }
    );
  }

  drainPlayerMeleeHitIntents(playerId: string): MeleeHitIntentEntry[] {
    const entityId = this.players.getEntityId(playerId);
    if (entityId === undefined) {
      return [];
    }

    const hitIntent = this.ecsWorld.getComponent<MeleeHitIntentComponent>(
      entityId,
      COMBAT_COMPONENTS.MELEE_HIT_INTENT
    );
    if (!hitIntent) {
      return [];
    }

    this.ecsWorld.removeComponent(entityId, COMBAT_COMPONENTS.MELEE_HIT_INTENT);
    return [...hitIntent.entries];
  }

  queuePendingDamage(
    targetRole: CombatActorRole,
    targetId: string,
    entry: PendingDamageEntry
  ): void {
    const entityId = this.resolveEntityId(targetRole, targetId);
    if (entityId === undefined) {
      return;
    }

    const pendingDamage = this.ecsWorld.getComponent<PendingDamageComponent>(
      entityId,
      COMBAT_COMPONENTS.PENDING_DAMAGE
    );
    if (pendingDamage) {
      pendingDamage.entries.push(entry);
      return;
    }

    this.ecsWorld.setComponent<PendingDamageComponent>(entityId, COMBAT_COMPONENTS.PENDING_DAMAGE, {
      entries: [entry],
    });
  }

  queuePendingPlayerDamage(playerId: string, entry: PendingDamageEntry): void {
    this.queuePendingDamage('player', playerId, entry);
  }

  drainPendingDamage(targetRole: CombatActorRole, targetId: string): PendingDamageEntry[] {
    const entityId = this.resolveEntityId(targetRole, targetId);
    if (entityId === undefined) {
      return [];
    }

    const pendingDamage = this.ecsWorld.getComponent<PendingDamageComponent>(
      entityId,
      COMBAT_COMPONENTS.PENDING_DAMAGE
    );
    if (!pendingDamage) {
      return [];
    }

    this.ecsWorld.removeComponent(entityId, COMBAT_COMPONENTS.PENDING_DAMAGE);
    return [...pendingDamage.entries];
  }

  drainPendingPlayerDamage(playerId: string): PendingDamageEntry[] {
    return this.drainPendingDamage('player', playerId);
  }

  queryPlayersInRadius(x: number, y: number, radius: number): Player[] {
    return this.queryObjectsInRadius(x, y, radius, PLAYER_COMPONENT, (entityId) =>
      this.matchesRole(entityId, 'player', true)
    );
  }

  forEachPlayerInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (player: Player) => void
  ): void {
    this.forEachObjectInRadius(x, y, radius, PLAYER_COMPONENT, callback, (entityId) =>
      this.matchesRole(entityId, 'player', true)
    );
  }

  forEachAlivePlayerInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (player: Player) => void
  ): void {
    this.forEachObjectInRadius(x, y, radius, PLAYER_COMPONENT, callback, (entityId) =>
      this.matchesRole(entityId, 'player')
    );
  }

  findNearestPlayerInRadius(
    x: number,
    y: number,
    radius: number,
    predicate?: (player: Player) => boolean
  ): Player | null {
    const entityId = this.spatialIndex.findNearestInRadius(x, y, radius, (candidateEntityId) => {
      if (!this.matchesRole(candidateEntityId, 'player', true)) {
        return false;
      }

      const player = this.ecsWorld.getComponent<Player>(candidateEntityId, PLAYER_COMPONENT);
      return player ? (predicate?.(player) ?? true) : false;
    });

    if (entityId === null) {
      return null;
    }

    return this.ecsWorld.getComponent<Player>(entityId, PLAYER_COMPONENT) ?? null;
  }

  queryEnemiesInRadius(x: number, y: number, radius: number): Blob[] {
    return this.queryObjectsInRadius(x, y, radius, ENEMY_COMPONENT, (entityId) =>
      this.matchesRole(entityId, 'enemy')
    );
  }

  forEachEnemyInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (enemy: Blob) => void
  ): void {
    this.forEachObjectInRadius(x, y, radius, ENEMY_COMPONENT, callback, (entityId) =>
      this.matchesRole(entityId, 'enemy')
    );
  }

  forEachBossInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (boss: BossRuntimeEntity) => void
  ): void {
    this.forEachObjectInRadius(x, y, radius, BOSS_COMPONENT, callback, (entityId) =>
      this.matchesRole(entityId, 'boss')
    );
  }

  queryBossesInRadius(
    x: number,
    y: number,
    radius: number,
    options?: { includeDead?: boolean }
  ): BossRuntimeEntity[] {
    return this.queryObjectsInRadius(x, y, radius, BOSS_COMPONENT, (entityId) =>
      this.matchesRole(entityId, 'boss', options?.includeDead === true)
    );
  }

  private resolveEntityId(targetRole: CombatActorRole, targetId: string): EntityId | undefined {
    if (targetRole === 'player') {
      return this.players.getEntityId(targetId);
    }

    if (targetRole === 'boss') {
      return this.bosses.getEntityId(targetId);
    }

    for (const store of this.enemyStores.values()) {
      const entityId = store.getEntityId(targetId);
      if (entityId !== undefined) {
        return entityId;
      }
    }

    return undefined;
  }

  private matchesRole(entityId: EntityId, role: CombatActorRole, includeDead = false): boolean {
    const meta = this.ecsWorld.getComponent<ActorMetaComponent>(entityId, ACTOR_META_COMPONENT);
    if (!meta || meta.role !== role) {
      return false;
    }

    return includeDead || meta.alive;
  }

  private queryObjects<T>(componentNames: string[]): T[] {
    const entityIds = this.ecsWorld.query(componentNames);
    const componentName = componentNames[0];
    const objects: T[] = [];

    for (const entityId of entityIds) {
      const value = this.ecsWorld.getComponent<T>(entityId, componentName);
      if (value) {
        objects.push(value);
      }
    }

    return objects;
  }

  private queryObjectsInRadius<T>(
    x: number,
    y: number,
    radius: number,
    componentName: string,
    predicate: (entityId: EntityId) => boolean
  ): T[] {
    const objects: T[] = [];
    this.forEachObjectInRadius<T>(
      x,
      y,
      radius,
      componentName,
      (value) => {
        objects.push(value);
      },
      predicate
    );
    return objects;
  }

  private forEachObjectInRadius<T>(
    x: number,
    y: number,
    radius: number,
    componentName: string,
    callback: (value: T) => void,
    predicate: (entityId: EntityId) => boolean
  ): void {
    this.spatialIndex.forEachInRadius(
      x,
      y,
      radius,
      (entityId) => {
        const value = this.ecsWorld.getComponent<T>(entityId, componentName);
        if (value) {
          callback(value);
        }
      },
      predicate
    );
  }
}
