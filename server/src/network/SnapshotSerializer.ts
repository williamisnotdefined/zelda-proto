import type {
  AoeIndicator,
  BossSnapshot,
  DropSnapshot,
  EnemyStateDelta,
  EnemySnapshot,
  EnemyTransformSnapshot,
  HazardSnapshot,
  IceZone,
  InstanceId,
  PlayerSnapshot,
  PortalSnapshot,
  SnapshotDeltaMessage,
  SnapshotMessage,
} from './MessageTypes.js';
import { PROTOCOL_VERSION, SERVER_MESSAGE_TYPES } from '@gelehka/shared';

const ENEMY_TRANSFORM_NEAR_DISTANCE_PX = 650;
const ENEMY_TRANSFORM_MID_DISTANCE_PX = 1200;
const ENEMY_TRANSFORM_MID_INTERVAL_TICKS = 1;
const ENEMY_TRANSFORM_FAR_INTERVAL_TICKS = 3;

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

export interface DiffSnapshotOptions {
  viewerX: number;
  viewerY: number;
}

function toMap<T extends { id: string }>(items: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const item of items) out.set(item.id, item);
  return out;
}

function cloneEnemySnapshot(enemy: EnemySnapshot): EnemySnapshot {
  return { ...enemy };
}

function getEnemyTransformIntervalTicks(
  viewerX: number,
  viewerY: number,
  enemy: EnemySnapshot
): number {
  const dx = enemy.x - viewerX;
  const dy = enemy.y - viewerY;
  const distSq = dx * dx + dy * dy;

  if (distSq <= ENEMY_TRANSFORM_NEAR_DISTANCE_PX * ENEMY_TRANSFORM_NEAR_DISTANCE_PX) {
    return 1;
  }

  if (distSq <= ENEMY_TRANSFORM_MID_DISTANCE_PX * ENEMY_TRANSFORM_MID_DISTANCE_PX) {
    return ENEMY_TRANSFORM_MID_INTERVAL_TICKS;
  }

  return ENEMY_TRANSFORM_FAR_INTERVAL_TICKS;
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
    protocolVersion: PROTOCOL_VERSION,
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
  const aPurpleBurning = a.purpleBurning?.ticksRemaining;
  const bPurpleBurning = b.purpleBurning?.ticksRemaining;
  const aBlueBurning = a.blueBurning?.ticksRemaining;
  const bBlueBurning = b.blueBurning?.ticksRemaining;
  return (
    aBurning === bBurning && aPurpleBurning === bPurpleBurning && aBlueBurning === bBlueBurning
  );
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

function hashEnemyId(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function isEnemyTransformTick(enemyId: string, tick: number, intervalTicks: number): boolean {
  if (intervalTicks <= 1) {
    return true;
  }

  const phase = hashEnemyId(enemyId) % intervalTicks;
  return tick % intervalTicks === phase;
}

function diffEnemies(
  prev: Map<string, EnemySnapshot>,
  curr: Map<string, EnemySnapshot>,
  tick: number,
  options?: DiffSnapshotOptions
): {
  enemies: EnemySnapshot[];
  enemyTransforms: EnemyTransformSnapshot[];
  enemyStates: EnemyStateDelta[];
  removed: string[];
  nextEnemies: Map<string, EnemySnapshot>;
} {
  const enemies: EnemySnapshot[] = [];
  const enemyTransforms: EnemyTransformSnapshot[] = [];
  const enemyStates: EnemyStateDelta[] = [];
  const removed: string[] = [];
  const nextEnemies = new Map<string, EnemySnapshot>();

  for (const item of curr.values()) {
    const previous = prev.get(item.id);
    if (!previous) {
      enemies.push(item);
      nextEnemies.set(item.id, item);
      continue;
    }

    if (previous.kind !== item.kind || previous.variant !== item.variant) {
      enemies.push(item);
      nextEnemies.set(item.id, item);
      continue;
    }

    const transformChanged = previous.x !== item.x || previous.y !== item.y;
    const stateChanged =
      previous.hp !== item.hp || previous.maxHp !== item.maxHp || previous.state !== item.state;
    const transformInterval = options
      ? getEnemyTransformIntervalTicks(options.viewerX, options.viewerY, item)
      : 1;
    const shouldSendTransform =
      transformChanged && isEnemyTransformTick(item.id, tick, transformInterval);

    if (!shouldSendTransform && !stateChanged) {
      nextEnemies.set(item.id, previous);
      continue;
    }

    const nextEnemy = cloneEnemySnapshot(previous);

    if (shouldSendTransform) {
      enemyTransforms.push({
        id: item.id,
        x: item.x,
        y: item.y,
      });
      nextEnemy.x = item.x;
      nextEnemy.y = item.y;
    }

    if (stateChanged) {
      enemyStates.push({
        id: item.id,
        hp: item.hp,
        maxHp: item.maxHp,
        state: item.state,
      });
      nextEnemy.hp = item.hp;
      nextEnemy.maxHp = item.maxHp;
      nextEnemy.state = item.state;
    }

    nextEnemies.set(item.id, nextEnemy);
  }

  for (const id of prev.keys()) {
    if (!curr.has(id)) removed.push(id);
  }

  return { enemies, enemyTransforms, enemyStates, removed, nextEnemies };
}

export function diffSnapshot(
  prev: SnapshotState | null,
  current: SnapshotBundle,
  tick: number,
  full: boolean,
  options?: DiffSnapshotOptions
): { message: SnapshotDeltaMessage; nextState: SnapshotState } {
  const currState = toSnapshotState(current);

  if (!prev || full) {
    return {
      message: {
        protocolVersion: PROTOCOL_VERSION,
        type: SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA,
        tick,
        full: true,
        instanceId: current.instanceId,
        players: current.players,
        removedPlayerIds: [],
        enemies: current.enemies,
        enemyTransforms: [],
        enemyStates: [],
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

  const enemiesDiff = diffEnemies(prev.enemies, currState.enemies, tick, options);
  const bossesDiff = diffCollection(prev.bosses, currState.bosses);
  const dropsDiff = diffCollection(prev.drops, currState.drops);
  const portalsDiff = diffCollection(prev.portals, currState.portals);
  const hazardsDiff = diffCollection(prev.hazards, currState.hazards);
  const playersDiff = diffCollection(prev.players, currState.players, playerSnapshotEqual);

  return {
    message: {
      protocolVersion: PROTOCOL_VERSION,
      type: SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA,
      tick,
      full: false,
      instanceId: current.instanceId,
      players: playersDiff.changed,
      removedPlayerIds: playersDiff.removed,
      enemies: enemiesDiff.enemies,
      enemyTransforms: enemiesDiff.enemyTransforms,
      enemyStates: enemiesDiff.enemyStates,
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
    nextState: {
      players: currState.players,
      enemies: enemiesDiff.nextEnemies,
      bosses: currState.bosses,
      drops: currState.drops,
      portals: currState.portals,
      hazards: currState.hazards,
    },
  };
}
