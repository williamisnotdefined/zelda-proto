// Shared runtime constants and types between client and server.

export type Direction = 'up' | 'down' | 'left' | 'right';

export type PlayerState = 'idle' | 'moving' | 'dead';

export type BlobState = 'idle' | 'chasing' | 'attacking' | 'dead';

export type KnightState =
  | 'idle'
  | 'chasing'
  | 'attacking'
  | 'shielding'
  | 'sprinting'
  | 'rolling'
  | 'casting'
  | 'dead';

export const INSTANCE_IDS = {
  PHASE1: 'phase1',
  PHASE2: 'phase2',
  PHASE3: 'phase3',
  PHASE4: 'phase4',
} as const;

export type InstanceId = (typeof INSTANCE_IDS)[keyof typeof INSTANCE_IDS];

export const ENEMY_KINDS = {
  BLOB: 'blob',
  SKELETON: 'skeleton',
  KNIGHT: 'knight',
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
  VANESSA_THE_RUTHLESS: 'vanessa_the_ruthless',
} as const;

export type BossKind = (typeof BOSS_KINDS)[keyof typeof BOSS_KINDS];

export const DROP_KINDS = {
  FOOD_SMALL: 'food_small',
  FOOD_LARGE: 'food_large',
  FOOD_PACMAN: 'food_pacman',
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
  GRENADE: 'grenade',
  MOLOTOV: 'molotov',
  LANDMINE: 'landmine',
  LANDMINE_EXPLOSION: 'landmine_explosion',
  MOLOTOV_EXPLOSION: 'molotov_explosion',
  KNIGHT_BLADE_WAVE: 'knight_blade_wave',
} as const;

export type HazardKind = (typeof HAZARD_KINDS)[keyof typeof HAZARD_KINDS];

export const PROTOCOL_VERSION = 15 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

interface ProtocolEnvelope {
  protocolVersion: ProtocolVersion;
}

export const SERVER_MESSAGE_TYPES = {
  SNAPSHOT: 'snapshot',
  SNAPSHOT_DELTA: 'snapshot_delta',
  WELCOME: 'welcome',
  RESUME_REJECTED: 'resume_rejected',
  LEADERBOARD: 'leaderboard',
} as const;

export const CLIENT_MESSAGE_TYPES = {
  INPUT: 'input',
  JOIN: 'join',
  RESUME_SESSION: 'resume_session',
  SNAPSHOT_RESYNC: 'snapshot_resync',
} as const;

export const SESSION_RESUME_REJECT_REASONS = {
  INVALID_SESSION: 'invalid_session',
  SESSION_IN_USE: 'session_in_use',
} as const;

export type SessionResumeRejectReason =
  (typeof SESSION_RESUME_REJECT_REASONS)[keyof typeof SESSION_RESUME_REJECT_REASONS];

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
  | 'wave_windup'
  | 'spawning_minions'
  | 'enraged'
  | 'dead';

export type WaveState = 'windup' | 'expanding' | 'collapsing';
export type PlayerWaveKind = 'wave' | 'numb' | 'pull' | 'venom';

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
  shurikenActive?: boolean;
}

export interface EnemySnapshot {
  id: string;
  kind: EnemyKind;
  elite?: boolean;
  variant?: PacmanGhostVariant;
  venomMarked?: boolean;
  statusEffects?: PlayerStatusSnapshot;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: EnemyState;
}

export type EnemyState = BlobState | KnightState;

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
  statusEffects?: PlayerStatusSnapshot;
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
  venomMarked?: boolean;
  statusEffects?: PlayerStatusSnapshot;
  targetX?: number;
  targetY?: number;
  speechText?: string;
  speechColor?: string;
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

export interface WaveIndicator {
  ownerId?: string;
  x: number;
  y: number;
  radius: number;
  state: WaveState;
  kind?: PlayerWaveKind;
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
  tint?: number;
  direction?: Direction;
}

interface SnapshotWorldState {
  instanceId: InstanceId;
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
  bosses: BossSnapshot[];
  iceZones: IceZone[];
  aoeIndicators: AoeIndicator[];
  waveIndicators: WaveIndicator[];
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
  sessionToken: string;
  resumed: boolean;
  mapWidth: number;
  mapHeight: number;
}

export interface ResumeRejectedMessage extends ProtocolEnvelope {
  type: typeof SERVER_MESSAGE_TYPES.RESUME_REJECTED;
  reason: SessionResumeRejectReason;
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
  | ResumeRejectedMessage;

export interface InputMessage {
  protocolVersion: ProtocolVersion;
  type: typeof CLIENT_MESSAGE_TYPES.INPUT;
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  wave: boolean;
  numb: boolean;
  pull: boolean;
  venom: boolean;
  dash: boolean;
  grenade: boolean;
  molotov: boolean;
  landmine: boolean;
  shuriken: boolean;
}

export interface JoinMessage {
  protocolVersion: ProtocolVersion;
  type: typeof CLIENT_MESSAGE_TYPES.JOIN;
  nickname: string;
}

export interface ResumeSessionMessage {
  protocolVersion: ProtocolVersion;
  type: typeof CLIENT_MESSAGE_TYPES.RESUME_SESSION;
  sessionToken: string;
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
  | ResumeSessionMessage
  | SnapshotResyncRequestMessage;
