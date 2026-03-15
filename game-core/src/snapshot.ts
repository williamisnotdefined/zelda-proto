import type {
  BossSnapshot,
  DropSnapshot,
  EnemyStateDelta,
  EnemySnapshot,
  EnemyTransformSnapshot,
  HazardSnapshot,
  PlayerSnapshot,
  PortalSnapshot,
  ServerMessage,
  SnapshotDeltaMessage,
  SnapshotMessage,
} from '@gelehka/shared';
import { PROTOCOL_VERSION, SERVER_MESSAGE_TYPES } from '@gelehka/shared';

export interface SnapshotCache {
  instanceId: SnapshotMessage['instanceId'];
  players: Map<string, PlayerSnapshot>;
  enemies: Map<string, EnemySnapshot>;
  bosses: Map<string, BossSnapshot>;
  drops: Map<string, DropSnapshot>;
  portals: Map<string, PortalSnapshot>;
  hazards: Map<string, HazardSnapshot>;
  iceZones: SnapshotMessage['iceZones'];
  aoeIndicators: SnapshotMessage['aoeIndicators'];
}

export interface SnapshotNormalizationState {
  snapshotCache: SnapshotCache | null;
  lastSnapshotTick: number;
}

function cloneItem<T extends object>(item: T): T {
  return { ...item };
}

function cloneArrayItems<T extends object>(items: T[]): T[] {
  return items.map((item) => cloneItem(item));
}

export function createSnapshotNormalizationState(): SnapshotNormalizationState {
  return {
    snapshotCache: null,
    lastSnapshotTick: -1,
  };
}

export function toEntityMap<T extends { id: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.id, cloneItem(item));
  }
  return map;
}

export function toSnapshotCache(snapshot: SnapshotMessage): SnapshotCache {
  return {
    instanceId: snapshot.instanceId,
    players: toEntityMap(snapshot.players),
    enemies: toEntityMap(snapshot.enemies),
    bosses: toEntityMap(snapshot.bosses),
    drops: toEntityMap(snapshot.drops),
    portals: toEntityMap(snapshot.portals),
    hazards: toEntityMap(snapshot.hazards),
    iceZones: cloneArrayItems(snapshot.iceZones),
    aoeIndicators: cloneArrayItems(snapshot.aoeIndicators),
  };
}

export function toSnapshotMessage(cache: SnapshotCache): SnapshotMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: SERVER_MESSAGE_TYPES.SNAPSHOT,
    instanceId: cache.instanceId,
    players: Array.from(cache.players.values(), (item) => cloneItem(item)),
    enemies: Array.from(cache.enemies.values(), (item) => cloneItem(item)),
    bosses: Array.from(cache.bosses.values(), (item) => cloneItem(item)),
    drops: Array.from(cache.drops.values(), (item) => cloneItem(item)),
    portals: Array.from(cache.portals.values(), (item) => cloneItem(item)),
    hazards: Array.from(cache.hazards.values(), (item) => cloneItem(item)),
    iceZones: cloneArrayItems(cache.iceZones),
    aoeIndicators: cloneArrayItems(cache.aoeIndicators),
  };
}

export function applySnapshotDelta(
  delta: SnapshotDeltaMessage,
  snapshotCache: SnapshotCache | null
): SnapshotCache {
  if (delta.full || !snapshotCache) {
    return {
      instanceId: delta.instanceId,
      players: toEntityMap(delta.players),
      enemies: toEntityMap(delta.enemies),
      bosses: toEntityMap(delta.bosses),
      drops: toEntityMap(delta.drops),
      portals: toEntityMap(delta.portals),
      hazards: toEntityMap(delta.hazards),
      iceZones: cloneArrayItems(delta.iceZones),
      aoeIndicators: cloneArrayItems(delta.aoeIndicators),
    };
  }

  for (const player of delta.players) snapshotCache.players.set(player.id, cloneItem(player));
  for (const enemy of delta.enemies) snapshotCache.enemies.set(enemy.id, cloneItem(enemy));
  for (const transform of delta.enemyTransforms) {
    const enemy = snapshotCache.enemies.get(transform.id);
    if (!enemy) continue;
    enemy.x = transform.x;
    enemy.y = transform.y;
  }
  for (const state of delta.enemyStates) {
    const enemy = snapshotCache.enemies.get(state.id);
    if (!enemy) continue;
    enemy.hp = state.hp;
    enemy.maxHp = state.maxHp;
    enemy.state = state.state;
  }
  for (const boss of delta.bosses) snapshotCache.bosses.set(boss.id, cloneItem(boss));
  for (const drop of delta.drops) snapshotCache.drops.set(drop.id, cloneItem(drop));
  for (const portal of delta.portals) snapshotCache.portals.set(portal.id, cloneItem(portal));
  for (const hazard of delta.hazards) snapshotCache.hazards.set(hazard.id, cloneItem(hazard));

  for (const id of delta.removedPlayerIds) snapshotCache.players.delete(id);
  for (const id of delta.removedEnemyIds) snapshotCache.enemies.delete(id);
  for (const id of delta.removedBossIds) snapshotCache.bosses.delete(id);
  for (const id of delta.removedDropIds) snapshotCache.drops.delete(id);
  for (const id of delta.removedPortalIds) snapshotCache.portals.delete(id);
  for (const id of delta.removedHazardIds) snapshotCache.hazards.delete(id);

  snapshotCache.instanceId = delta.instanceId;
  snapshotCache.iceZones = cloneArrayItems(delta.iceZones);
  snapshotCache.aoeIndicators = cloneArrayItems(delta.aoeIndicators);

  return snapshotCache;
}

export function normalizeServerMessage(
  message: ServerMessage,
  state: SnapshotNormalizationState
): ServerMessage | null {
  if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT) {
    state.snapshotCache = toSnapshotCache(message);
    state.lastSnapshotTick = -1;
    return toSnapshotMessage(state.snapshotCache);
  }

  if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA) {
    if (
      state.snapshotCache &&
      state.snapshotCache.instanceId !== message.instanceId &&
      !message.full
    ) {
      return null;
    }
    if (message.tick <= state.lastSnapshotTick) {
      return null;
    }
    state.lastSnapshotTick = message.tick;
    state.snapshotCache = applySnapshotDelta(message, state.snapshotCache);
    return toSnapshotMessage(state.snapshotCache);
  }

  return message;
}
