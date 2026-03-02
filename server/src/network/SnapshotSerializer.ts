import type {
  AoeIndicator,
  BossSnapshot,
  DropSnapshot,
  EnemySnapshot,
  HazardSnapshot,
  IceZone,
  InstanceId,
  PlayerSnapshot,
  PortalSnapshot,
  SnapshotDeltaMessage,
  SnapshotMessage,
} from './MessageTypes.js';
import { SERVER_MESSAGE_TYPES } from '@gelehka/shared';

export interface SnapshotBundle {
  instanceId: InstanceId;
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
  bosses: BossSnapshot[];
  drops: DropSnapshot[];
  portals: PortalSnapshot[];
  hazards: HazardSnapshot[];
  iceZones: IceZone[];
  aoeIndicators: AoeIndicator[];
}

export interface SnapshotState {
  players: Map<string, PlayerSnapshot>;
  enemies: Map<string, EnemySnapshot>;
  bosses: Map<string, BossSnapshot>;
  drops: Map<string, DropSnapshot>;
  portals: Map<string, PortalSnapshot>;
  hazards: Map<string, HazardSnapshot>;
}

function toMap<T extends { id: string }>(items: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const item of items) out.set(item.id, item);
  return out;
}

export function toSnapshotState(snapshot: SnapshotBundle): SnapshotState {
  return {
    players: toMap(snapshot.players),
    enemies: toMap(snapshot.enemies),
    bosses: toMap(snapshot.bosses),
    drops: toMap(snapshot.drops),
    portals: toMap(snapshot.portals),
    hazards: toMap(snapshot.hazards),
  };
}

export function toSnapshotMessage(snapshot: SnapshotBundle): SnapshotMessage {
  return {
    type: SERVER_MESSAGE_TYPES.SNAPSHOT,
    instanceId: snapshot.instanceId,
    players: snapshot.players,
    enemies: snapshot.enemies,
    bosses: snapshot.bosses,
    drops: snapshot.drops,
    portals: snapshot.portals,
    hazards: snapshot.hazards,
    iceZones: snapshot.iceZones,
    aoeIndicators: snapshot.aoeIndicators,
  };
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function statusEffectsEqual(
  a: PlayerSnapshot['statusEffects'],
  b: PlayerSnapshot['statusEffects']
): boolean {
  const aBurning = a.burning?.ticksRemaining;
  const bBurning = b.burning?.ticksRemaining;
  return aBurning === bBurning;
}

function playerSnapshotEqual(a: PlayerSnapshot, b: PlayerSnapshot): boolean {
  return (
    a.id === b.id &&
    a.nickname === b.nickname &&
    a.x === b.x &&
    a.y === b.y &&
    a.hp === b.hp &&
    a.maxHp === b.maxHp &&
    a.state === b.state &&
    a.direction === b.direction &&
    a.playerKills === b.playerKills &&
    a.monsterKills === b.monsterKills &&
    a.deaths === b.deaths &&
    a.toastyCount === b.toastyCount &&
    a.lastProcessedInputSeq === b.lastProcessedInputSeq &&
    statusEffectsEqual(a.statusEffects, b.statusEffects)
  );
}

function diffCollection<T extends { id: string }>(
  prev: Map<string, T>,
  curr: Map<string, T>,
  equals?: (a: T, b: T) => boolean
): { changed: T[]; removed: string[] } {
  const changed: T[] = [];
  const removed: string[] = [];

  for (const item of curr.values()) {
    const previous = prev.get(item.id);
    if (!previous) {
      changed.push(item);
      continue;
    }

    if (equals) {
      if (!equals(previous, item)) {
        changed.push(item);
      }
      continue;
    }

    if (!shallowEqual(previous as Record<string, unknown>, item as Record<string, unknown>)) {
      changed.push(item);
    }
  }

  for (const id of prev.keys()) {
    if (!curr.has(id)) removed.push(id);
  }

  return { changed, removed };
}

export function diffSnapshot(
  prev: SnapshotState | null,
  current: SnapshotBundle,
  tick: number,
  full: boolean
): { message: SnapshotDeltaMessage; nextState: SnapshotState } {
  const currState = toSnapshotState(current);

  if (!prev || full) {
    return {
      message: {
        type: SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA,
        tick,
        full: true,
        instanceId: current.instanceId,
        players: current.players,
        removedPlayerIds: [],
        enemies: current.enemies,
        bosses: current.bosses,
        drops: current.drops,
        portals: current.portals,
        hazards: current.hazards,
        removedEnemyIds: [],
        removedBossIds: [],
        removedDropIds: [],
        removedPortalIds: [],
        removedHazardIds: [],
        iceZones: current.iceZones,
        aoeIndicators: current.aoeIndicators,
      },
      nextState: currState,
    };
  }

  const enemiesDiff = diffCollection(prev.enemies, currState.enemies);
  const bossesDiff = diffCollection(prev.bosses, currState.bosses);
  const dropsDiff = diffCollection(prev.drops, currState.drops);
  const portalsDiff = diffCollection(prev.portals, currState.portals);
  const hazardsDiff = diffCollection(prev.hazards, currState.hazards);
  const playersDiff = diffCollection(prev.players, currState.players, playerSnapshotEqual);

  return {
    message: {
      type: SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA,
      tick,
      full: false,
      instanceId: current.instanceId,
      players: playersDiff.changed,
      removedPlayerIds: playersDiff.removed,
      enemies: enemiesDiff.changed,
      bosses: bossesDiff.changed,
      drops: dropsDiff.changed,
      portals: portalsDiff.changed,
      hazards: hazardsDiff.changed,
      removedEnemyIds: enemiesDiff.removed,
      removedBossIds: bossesDiff.removed,
      removedDropIds: dropsDiff.removed,
      removedPortalIds: portalsDiff.removed,
      removedHazardIds: hazardsDiff.removed,
      iceZones: current.iceZones,
      aoeIndicators: current.aoeIndicators,
    },
    nextState: currState,
  };
}
