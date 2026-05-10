import type {
  BossSnapshot,
  DropSnapshot,
  EnemySnapshot,
  HazardSnapshot,
  PlayerSnapshot,
  PortalSnapshot,
  ServerMessage,
  SnapshotResyncReason,
  SnapshotDeltaMessage,
  SnapshotMessage,
} from '@/shared';
import { PROTOCOL_VERSION, SERVER_MESSAGE_TYPES, SNAPSHOT_RESYNC_REASONS } from '@/shared';

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
  waveIndicators: SnapshotMessage['waveIndicators'];
}

export interface SnapshotNormalizationState {
  snapshotCache: SnapshotCache | null;
  lastSnapshotTick: number;
  lastSnapshotInstanceId: SnapshotMessage['instanceId'] | null;
  resyncRequired: boolean;
}

export interface SnapshotMessageFilterState {
  snapshotInstanceId: SnapshotMessage['instanceId'] | null;
  lastSnapshotTick: number;
  hasSnapshotBase: boolean;
}

export interface SnapshotResyncRequest {
  reason: SnapshotResyncReason;
  lastTick: number;
  instanceId: SnapshotMessage['instanceId'] | null;
}

export type SnapshotNormalizationDropReason = 'stale_tick' | 'resync_pending';

export type NormalizeServerMessageResult =
  | {
      kind: 'message';
      message: ServerMessage;
      snapshotBaseApplied: boolean;
    }
  | {
      kind: 'drop';
      reason: SnapshotNormalizationDropReason;
    }
  | ({
      kind: 'resync';
    } & SnapshotResyncRequest);

function cloneItem<T extends object>(item: T): T {
  return { ...item };
}

function cloneArrayItems<T extends object>(items: T[]): T[] {
  return items.map((item) => cloneItem(item));
}

function getWaveIndicators(
  snapshot: Pick<SnapshotMessage, 'waveIndicators'> | Pick<SnapshotDeltaMessage, 'waveIndicators'>
): SnapshotMessage['waveIndicators'] {
  return cloneArrayItems(snapshot.waveIndicators ?? []);
}

export function createSnapshotNormalizationState(): SnapshotNormalizationState {
  return {
    snapshotCache: null,
    lastSnapshotTick: -1,
    lastSnapshotInstanceId: null,
    resyncRequired: false,
  };
}

export function createSnapshotMessageFilterState(): SnapshotMessageFilterState {
  return {
    snapshotInstanceId: null,
    lastSnapshotTick: -1,
    hasSnapshotBase: false,
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
    waveIndicators: getWaveIndicators(snapshot),
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
    waveIndicators: cloneArrayItems(cache.waveIndicators),
  };
}

export function applySnapshotDelta(
  delta: SnapshotDeltaMessage,
  snapshotCache: SnapshotCache | null
): SnapshotCache {
  if (delta.full) {
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
      waveIndicators: getWaveIndicators(delta),
    };
  }

  if (!snapshotCache) {
    throw new Error('Cannot apply incremental snapshot delta without a baseline');
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
    if (state.statusEffects !== undefined) enemy.statusEffects = cloneItem(state.statusEffects);
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
  snapshotCache.waveIndicators = getWaveIndicators(delta);

  return snapshotCache;
}

export function normalizeServerMessage(
  message: ServerMessage,
  state: SnapshotNormalizationState
): ServerMessage | null {
  const result = normalizeServerMessageResult(message, state);
  if (result.kind !== 'message') {
    return null;
  }

  if (result.message.type === SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA && state.snapshotCache) {
    return toSnapshotMessage(state.snapshotCache);
  }

  return result.message;
}

function createResyncRequest(
  state: SnapshotNormalizationState,
  reason: SnapshotResyncReason
): NormalizeServerMessageResult {
  state.snapshotCache = null;
  state.resyncRequired = true;

  return {
    kind: 'resync',
    reason,
    lastTick: state.lastSnapshotTick,
    instanceId: state.lastSnapshotInstanceId,
  };
}

function applyFullSnapshotBase(
  snapshot: SnapshotMessage,
  state: SnapshotNormalizationState,
  tick: number
): NormalizeServerMessageResult {
  state.snapshotCache = toSnapshotCache(snapshot);
  state.lastSnapshotTick = tick;
  state.lastSnapshotInstanceId = snapshot.instanceId;
  state.resyncRequired = false;

  return {
    kind: 'message',
    message: toSnapshotMessage(state.snapshotCache),
    snapshotBaseApplied: true,
  };
}

export function normalizeServerMessageResult(
  message: ServerMessage,
  state: SnapshotNormalizationState
): NormalizeServerMessageResult {
  if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT) {
    return applyFullSnapshotBase(message, state, -1);
  }

  if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA) {
    if (message.full) {
      state.snapshotCache = applySnapshotDelta(message, null);
      state.lastSnapshotTick = message.tick;
      state.lastSnapshotInstanceId = message.instanceId;
      state.resyncRequired = false;

      return {
        kind: 'message',
        message: toSnapshotMessage(state.snapshotCache),
        snapshotBaseApplied: true,
      };
    }

    if (state.resyncRequired) {
      return { kind: 'drop', reason: 'resync_pending' };
    }

    if (!state.snapshotCache) {
      return createResyncRequest(state, SNAPSHOT_RESYNC_REASONS.MISSING_BASE);
    }

    if (state.snapshotCache.instanceId !== message.instanceId) {
      return createResyncRequest(state, SNAPSHOT_RESYNC_REASONS.INSTANCE_MISMATCH);
    }

    if (message.tick <= state.lastSnapshotTick) {
      return { kind: 'drop', reason: 'stale_tick' };
    }

    if (state.lastSnapshotTick >= 0 && message.tick !== state.lastSnapshotTick + 1) {
      return createResyncRequest(state, SNAPSHOT_RESYNC_REASONS.TICK_GAP);
    }

    state.lastSnapshotTick = message.tick;
    state.lastSnapshotInstanceId = message.instanceId;
    state.snapshotCache = applySnapshotDelta(message, state.snapshotCache);
    return {
      kind: 'message',
      message,
      snapshotBaseApplied: false,
    };
  }

  return {
    kind: 'message',
    message,
    snapshotBaseApplied: false,
  };
}

export function filterSnapshotMessage(
  message: ServerMessage,
  state: SnapshotMessageFilterState
): ServerMessage | null {
  if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT) {
    state.snapshotInstanceId = message.instanceId;
    state.lastSnapshotTick = -1;
    state.hasSnapshotBase = true;
    return message;
  }

  if (message.type === SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA) {
    if (message.full) {
      state.snapshotInstanceId = message.instanceId;
      state.lastSnapshotTick = message.tick;
      state.hasSnapshotBase = true;
      return message;
    }

    if (!state.hasSnapshotBase || state.snapshotInstanceId !== message.instanceId) {
      return null;
    }

    if (message.tick <= state.lastSnapshotTick) {
      return null;
    }

    if (state.lastSnapshotTick >= 0 && message.tick !== state.lastSnapshotTick + 1) {
      state.hasSnapshotBase = false;
      return null;
    }

    state.lastSnapshotTick = message.tick;
  }

  return message;
}
