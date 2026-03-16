// Shared runtime constants and types between client and server.

export type Direction = 'up' | 'down' | 'left' | 'right';

export type PlayerState = 'idle' | 'moving' | 'attacking' | 'dead';

export type BlobState = 'idle' | 'chasing' | 'attacking' | 'dead';

export const INSTANCE_IDS = {
  PHASE1: 'phase1',
  PHASE2: 'phase2',
  PHASE3: 'phase3',
  PHASE4: 'phase4',
} as const;

export type InstanceId = (typeof INSTANCE_IDS)[keyof typeof INSTANCE_IDS];

export const ENEMY_KINDS = {
  BLOB: 'blob',
  SLIME: 'slime',
  HAND: 'hand',
  PACMAN_GHOST: 'pacman_ghost',
} as const;

export type EnemyKind = (typeof ENEMY_KINDS)[keyof typeof ENEMY_KINDS];

export const PACMAN_GHOST_VARIANTS = {
  RED: 'red',
  BLUE: 'blue',
  ORANGE: 'orange',
  PINK: 'pink',
} as const;

export type PacmanGhostVariant = (typeof PACMAN_GHOST_VARIANTS)[keyof typeof PACMAN_GHOST_VARIANTS];

export const BOSS_KINDS = {
  GELEHK: 'gelehk',
  DRAGON_LORD: 'dragon_lord',
  SILVERBACK_WAINER: 'silverback_wainer',
  SLIM_MAIOLI: 'slim_maioli',
  FRANKLY_STEIN: 'frankly_stein',
} as const;

export type BossKind = (typeof BOSS_KINDS)[keyof typeof BOSS_KINDS];

export const DROP_KINDS = {
  HEART_SMALL: 'heart_small',
  HEART_LARGE: 'heart_large',
  HEART_PACMAN: 'heart_pacman',
} as const;

export type DropKind = (typeof DROP_KINDS)[keyof typeof DROP_KINDS];

export const PORTAL_KINDS = {
  PHASE1_TO_PHASE2: 'phase1_to_phase2',
  PHASE2_TO_PHASE1: 'phase2_to_phase1',
  PHASE2_TO_PHASE3: 'phase2_to_phase3',
  PHASE3_TO_PHASE2: 'phase3_to_phase2',
  PHASE3_TO_PHASE4: 'phase3_to_phase4',
  PHASE4_TO_PHASE3: 'phase4_to_phase3',
} as const;

export type PortalKind = (typeof PORTAL_KINDS)[keyof typeof PORTAL_KINDS];

export const HAZARD_KINDS = {
  FIRE_FIELD: 'fire_field',
  PURPLE_FIELD: 'purple_field',
  BLUE_FLAME: 'blue_flame',
} as const;

export type HazardKind = (typeof HAZARD_KINDS)[keyof typeof HAZARD_KINDS];

export const PROTOCOL_VERSION = 3 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

interface ProtocolEnvelope {
  protocolVersion: ProtocolVersion;
}

export const SERVER_MESSAGE_TYPES = {
  SNAPSHOT: 'snapshot',
  SNAPSHOT_DELTA: 'snapshot_delta',
  WELCOME: 'welcome',
  CHAT: 'chat',
  LEADERBOARD: 'leaderboard',
} as const;

export const CLIENT_MESSAGE_TYPES = {
  INPUT: 'input',
  JOIN: 'join',
  CHAT: 'chat',
  SNAPSHOT_RESYNC: 'snapshot_resync',
} as const;

export const SNAPSHOT_RESYNC_REASONS = {
  MISSING_BASE: 'missing_base',
  TICK_GAP: 'tick_gap',
  INSTANCE_MISMATCH: 'instance_mismatch',
  MANUAL: 'manual',
} as const;

export type SnapshotResyncReason =
  (typeof SNAPSHOT_RESYNC_REASONS)[keyof typeof SNAPSHOT_RESYNC_REASONS];

export type BossPhase = 1 | 2 | 3 | 4;

export type BossState =
  | 'idle'
  | 'chasing'
  | 'attacking'
  | 'casting'
  | 'special'
  | 'targeting'
  | 'jumping'
  | 'charging'
  | 'spawning_minions'
  | 'enraged'
  | 'dead';

export interface BurningStatus {
  ticksRemaining: number;
}

export const PLAYER_STATUS_EFFECTS = {
  BURNING: 'burning',
  PURPLE_BURNING: 'purpleBurning',
  BLUE_BURNING: 'blueBurning',
} as const;

export type PlayerStatusEffect = (typeof PLAYER_STATUS_EFFECTS)[keyof typeof PLAYER_STATUS_EFFECTS];

export type PlayerStatusSnapshot = Partial<Record<PlayerStatusEffect, BurningStatus>>;

export interface PlayerLeaderboardEntry {
  id: string;
  nickname: string;
  playerKills: number;
  monsterKills: number;
  deaths: number;
}

export interface PlayerSnapshot {
  id: string;
  nickname: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: PlayerState;
  direction: Direction;
  playerKills: number;
  monsterKills: number;
  deaths: number;
  toastyCount: number;
  lastProcessedInputSeq: number;
  statusEffects: PlayerStatusSnapshot;
}

export interface EnemySnapshot {
  id: string;
  kind: EnemyKind;
  variant?: PacmanGhostVariant;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: EnemyState;
}

export type EnemyState = BlobState;

export interface EnemyTransformSnapshot {
  id: string;
  x: number;
  y: number;
}

export interface EnemyStateDelta {
  id: string;
  hp: number;
  maxHp: number;
  state: EnemyState;
}

export interface BossSnapshot {
  id: string;
  kind: BossKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: BossState;
  phase: BossPhase;
  targetX?: number;
  targetY?: number;
}

export interface IceZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AoeIndicator {
  ownerId?: string;
  x: number;
  y: number;
  radius: number;
  timer: number;
  hit: boolean;
}

export interface DropSnapshot {
  id: string;
  x: number;
  y: number;
  kind: DropKind;
}

export interface PortalSnapshot {
  id: string;
  x: number;
  y: number;
  kind: PortalKind;
}

export interface HazardSnapshot {
  id: string;
  x: number;
  y: number;
  kind: HazardKind;
  ttlMs: number;
}

interface SnapshotWorldState {
  instanceId: InstanceId;
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
  bosses: BossSnapshot[];
  iceZones: IceZone[];
  aoeIndicators: AoeIndicator[];
  drops: DropSnapshot[];
  portals: PortalSnapshot[];
  hazards: HazardSnapshot[];
}

export interface SnapshotMessage extends ProtocolEnvelope, SnapshotWorldState {
  type: typeof SERVER_MESSAGE_TYPES.SNAPSHOT;
}

export interface WelcomeMessage extends ProtocolEnvelope {
  type: typeof SERVER_MESSAGE_TYPES.WELCOME;
  id: string;
  mapWidth: number;
  mapHeight: number;
}

export interface ServerChatMessage extends ProtocolEnvelope {
  type: typeof SERVER_MESSAGE_TYPES.CHAT;
  id: string;
  nickname: string;
  text: string;
  timestamp: number;
}

export interface LeaderboardMessage extends ProtocolEnvelope {
  type: typeof SERVER_MESSAGE_TYPES.LEADERBOARD;
  players: PlayerLeaderboardEntry[];
}

interface SnapshotDeltaMessageBase extends ProtocolEnvelope, SnapshotWorldState {
  type: typeof SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA;
  tick: number;
}

export interface FullSnapshotDeltaMessage extends SnapshotDeltaMessageBase {
  full: true;
  removedPlayerIds: [];
  enemyTransforms: [];
  enemyStates: [];
  removedEnemyIds: [];
  removedBossIds: [];
  removedDropIds: [];
  removedPortalIds: [];
  removedHazardIds: [];
}

export interface IncrementalSnapshotDeltaMessage extends SnapshotDeltaMessageBase {
  full: false;
  removedPlayerIds: string[];
  enemyTransforms: EnemyTransformSnapshot[];
  enemyStates: EnemyStateDelta[];
  removedEnemyIds: string[];
  removedBossIds: string[];
  removedDropIds: string[];
  removedPortalIds: string[];
  removedHazardIds: string[];
}

export type SnapshotDeltaMessage = FullSnapshotDeltaMessage | IncrementalSnapshotDeltaMessage;

export type BlobSnapshot = EnemySnapshot;

export type ServerMessage =
  | SnapshotMessage
  | SnapshotDeltaMessage
  | LeaderboardMessage
  | WelcomeMessage
  | ServerChatMessage;

export interface InputMessage {
  protocolVersion: ProtocolVersion;
  type: typeof CLIENT_MESSAGE_TYPES.INPUT;
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
}

export interface JoinMessage {
  protocolVersion: ProtocolVersion;
  type: typeof CLIENT_MESSAGE_TYPES.JOIN;
  nickname: string;
}

export interface ClientChatMessage {
  protocolVersion: ProtocolVersion;
  type: typeof CLIENT_MESSAGE_TYPES.CHAT;
  text: string;
}

export interface SnapshotResyncRequestMessage {
  protocolVersion: ProtocolVersion;
  type: typeof CLIENT_MESSAGE_TYPES.SNAPSHOT_RESYNC;
  reason: SnapshotResyncReason;
  lastTick: number;
  instanceId: InstanceId | null;
}

export type ClientMessage =
  | InputMessage
  | JoinMessage
  | ClientChatMessage
  | SnapshotResyncRequestMessage;
