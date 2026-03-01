// Shared types between client and server.
// Do not add runtime logic here — this file contains type declarations only.

export type Direction = 'up' | 'down' | 'left' | 'right';

export type PlayerState = 'idle' | 'moving' | 'attacking' | 'dead';

export type BlobState = 'idle' | 'chasing' | 'attacking' | 'dead';

export const INSTANCE_IDS = {
  PHASE1: 'phase1',
  PHASE2: 'phase2',
} as const;

export type InstanceId = (typeof INSTANCE_IDS)[keyof typeof INSTANCE_IDS];

export const ENEMY_KINDS = {
  BLOB: 'blob',
  SLIME: 'slime',
} as const;

export type EnemyKind = (typeof ENEMY_KINDS)[keyof typeof ENEMY_KINDS];

export const BOSS_KINDS = {
  GELEHK: 'gelehk',
  DRAGON_LORD: 'dragon_lord',
} as const;

export type BossKind = (typeof BOSS_KINDS)[keyof typeof BOSS_KINDS];

export const DROP_KINDS = {
  HEART_SMALL: 'heart_small',
  HEART_LARGE: 'heart_large',
} as const;

export type DropKind = (typeof DROP_KINDS)[keyof typeof DROP_KINDS];

export const PORTAL_KINDS = {
  PHASE1_TO_PHASE2: 'phase1_to_phase2',
  PHASE2_TO_PHASE1: 'phase2_to_phase1',
} as const;

export type PortalKind = (typeof PORTAL_KINDS)[keyof typeof PORTAL_KINDS];

export const HAZARD_KINDS = {
  FIRE_FIELD: 'fire_field',
} as const;

export type HazardKind = (typeof HAZARD_KINDS)[keyof typeof HAZARD_KINDS];

export const SERVER_MESSAGE_TYPES = {
  SNAPSHOT: 'snapshot',
  SNAPSHOT_DELTA: 'snapshot_delta',
  WELCOME: 'welcome',
  PLAYER_JOIN: 'player_join',
  PLAYER_LEAVE: 'player_leave',
  CHAT: 'chat',
  LEADERBOARD: 'leaderboard',
} as const;

export const CLIENT_MESSAGE_TYPES = {
  INPUT: 'input',
  JOIN: 'join',
  CHAT: 'chat',
} as const;

export type BossPhase = 1 | 2 | 3;

export type BossState =
  | 'idle'
  | 'chasing'
  | 'attacking'
  | 'targeting'
  | 'jumping'
  | 'charging'
  | 'spawning_minions'
  | 'enraged'
  | 'dead';

export interface BurningStatus {
  ticksRemaining: number;
}

export interface PlayerStatusSnapshot {
  burning?: BurningStatus;
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
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: BlobState;
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

export interface SnapshotMessage {
  type: typeof SERVER_MESSAGE_TYPES.SNAPSHOT;
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

export interface WelcomeMessage {
  type: typeof SERVER_MESSAGE_TYPES.WELCOME;
  id: string;
  mapWidth: number;
  mapHeight: number;
}

export interface PlayerJoinMessage {
  type: typeof SERVER_MESSAGE_TYPES.PLAYER_JOIN;
  id: string;
}

export interface PlayerLeaveMessage {
  type: typeof SERVER_MESSAGE_TYPES.PLAYER_LEAVE;
  id: string;
}

export interface ServerChatMessage {
  type: typeof SERVER_MESSAGE_TYPES.CHAT;
  id: string;
  nickname: string;
  text: string;
  timestamp: number;
}

export interface LeaderboardMessage {
  type: typeof SERVER_MESSAGE_TYPES.LEADERBOARD;
  players: PlayerSnapshot[];
}

export interface SnapshotDeltaMessage {
  type: typeof SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA;
  tick: number;
  full: boolean;
  instanceId: InstanceId;
  players: PlayerSnapshot[];
  removedPlayerIds: string[];
  enemies: EnemySnapshot[];
  bosses: BossSnapshot[];
  drops: DropSnapshot[];
  portals: PortalSnapshot[];
  hazards: HazardSnapshot[];
  removedEnemyIds: string[];
  removedBossIds: string[];
  removedDropIds: string[];
  removedPortalIds: string[];
  removedHazardIds: string[];
  iceZones: IceZone[];
  aoeIndicators: AoeIndicator[];
}

export type BlobSnapshot = EnemySnapshot;

export type ServerMessage =
  | SnapshotMessage
  | SnapshotDeltaMessage
  | LeaderboardMessage
  | WelcomeMessage
  | PlayerJoinMessage
  | PlayerLeaveMessage
  | ServerChatMessage;

export interface InputMessage {
  type: typeof CLIENT_MESSAGE_TYPES.INPUT;
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
}

export interface JoinMessage {
  type: typeof CLIENT_MESSAGE_TYPES.JOIN;
  nickname: string;
}

export interface ClientChatMessage {
  type: typeof CLIENT_MESSAGE_TYPES.CHAT;
  text: string;
}

export type ClientMessage = InputMessage | JoinMessage | ClientChatMessage;
