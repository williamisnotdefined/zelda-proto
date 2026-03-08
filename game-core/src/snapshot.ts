import type {
  BossSnapshot,
  DropSnapshot,
  EnemySnapshot,
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

export function createSnapshotNormalizationState(): SnapshotNormalizationState {
  return {
    snapshotCache: null,
    lastSnapshotTick: -1,
  };
}

export function toEntityMap<T extends { id: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.id, item);
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
    iceZones: snapshot.iceZones,
    aoeIndicators: snapshot.aoeIndicators,
  };
}

export function toSnapshotMessage(cache: SnapshotCache): SnapshotMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: SERVER_MESSAGE_TYPES.SNAPSHOT,
    instanceId: cache.instanceId,
    players: Array.from(cache.players.values()),
    enemies: Array.from(cache.enemies.values()),
    bosses: Array.from(cache.bosses.values()),
    drops: Array.from(cache.drops.values()),
    portals: Array.from(cache.portals.values()),
    hazards: Array.from(cache.hazards.values()),
    iceZones: cache.iceZones,
    aoeIndicators: cache.aoeIndicators,
  };
}

export function applySnapshotDelta(
  delta: SnapshotDeltaMessage,
  snapshotCache: SnapshotCache | null
): SnapshotCache {
  if (delta.full || !snapshotCache || snapshotCache.instanceId !== delta.instanceId) {
    return {
      instanceId: delta.instanceId,
      players: toEntityMap(delta.players),
      enemies: toEntityMap(delta.enemies),
      bosses: toEntityMap(delta.bosses),
      drops: toEntityMap(delta.drops),
      portals: toEntityMap(delta.portals),
      hazards: toEntityMap(delta.hazards),
      iceZones: delta.iceZones,
      aoeIndicators: delta.aoeIndicators,
    };
  }

  for (const player of delta.players) snapshotCache.players.set(player.id, player);
  for (const enemy of delta.enemies) snapshotCache.enemies.set(enemy.id, enemy);
  for (const boss of delta.bosses) snapshotCache.bosses.set(boss.id, boss);
  for (const drop of delta.drops) snapshotCache.drops.set(drop.id, drop);
  for (const portal of delta.portals) snapshotCache.portals.set(portal.id, portal);
  for (const hazard of delta.hazards) snapshotCache.hazards.set(hazard.id, hazard);

  for (const id of delta.removedPlayerIds) snapshotCache.players.delete(id);
  for (const id of delta.removedEnemyIds) snapshotCache.enemies.delete(id);
  for (const id of delta.removedBossIds) snapshotCache.bosses.delete(id);
  for (const id of delta.removedDropIds) snapshotCache.drops.delete(id);
  for (const id of delta.removedPortalIds) snapshotCache.portals.delete(id);
  for (const id of delta.removedHazardIds) snapshotCache.hazards.delete(id);

  snapshotCache.instanceId = delta.instanceId;
  snapshotCache.iceZones = delta.iceZones;
  snapshotCache.aoeIndicators = delta.aoeIndicators;

  return snapshotCache;
}

export function normalizeServerMessage(
  message: ServerMessage,
  state: SnapshotNormalizationState
): ServerMessage | null {
  if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT) {
    state.snapshotCache = toSnapshotCache(message);
    return toSnapshotMessage(state.snapshotCache);
  }

  if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA) {
    if (message.tick <= state.lastSnapshotTick) {
      return null;
    }
    state.lastSnapshotTick = message.tick;
    state.snapshotCache = applySnapshotDelta(message, state.snapshotCache);
    return toSnapshotMessage(state.snapshotCache);
  }

  return message;
}
