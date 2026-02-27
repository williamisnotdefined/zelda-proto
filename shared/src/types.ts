// Shared types between client and server.
// Do not add runtime logic here — this file contains type declarations only.

export type Direction = 'up' | 'down' | 'left' | 'right';

export type PlayerState = 'idle' | 'moving' | 'attacking' | 'dead';

export type SlimeState = 'idle' | 'chasing' | 'attacking' | 'dead';

export type BossPhase = 1 | 2 | 3;

export type BossState =
  | 'idle'
  | 'targeting'
  | 'jumping'
  | 'charging'
  | 'spawning_minions'
  | 'enraged'
  | 'dead';

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
}

export interface SlimeSnapshot {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: SlimeState;
}

export interface BossSnapshot {
  id: string;
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
}

export interface DropSnapshot {
  id: string;
  x: number;
  y: number;
  kind: 'heal';
}

export interface SnapshotMessage {
  type: 'snapshot';
  players: PlayerSnapshot[];
  enemies: SlimeSnapshot[];
  bosses: BossSnapshot[];
  iceZones: IceZone[];
  aoeIndicators: AoeIndicator[];
  drops: DropSnapshot[];
}

export interface WelcomeMessage {
  type: 'welcome';
  id: string;
  mapWidth: number;
  mapHeight: number;
}

export interface PlayerJoinMessage {
  type: 'player_join';
  id: string;
}

export interface PlayerLeaveMessage {
  type: 'player_leave';
  id: string;
}

export interface ServerChatMessage {
  type: 'chat';
  id: string;
  nickname: string;
  text: string;
  timestamp: number;
}

export type ServerMessage =
  | SnapshotMessage
  | WelcomeMessage
  | PlayerJoinMessage
  | PlayerLeaveMessage
  | ServerChatMessage;

export interface InputMessage {
  type: 'input';
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
}

export interface JoinMessage {
  type: 'join';
  nickname: string;
}

export interface ClientChatMessage {
  type: 'chat';
  text: string;
}

export type ClientMessage = InputMessage | JoinMessage | ClientChatMessage;
