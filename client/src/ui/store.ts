import type {
  BossKind,
  BossPhase,
  BossState,
  Direction,
  EnemyState,
  PlayerLeaderboardEntry,
  PlayerState,
  ServerChatMessage,
} from '@/shared';
import { create } from 'zustand';
import { readStoredConnectionContext } from '../network/sessionContext';

const initialConnectionContext = readStoredConnectionContext();

export interface PlayerData {
  id: string;
  nickname: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: PlayerState;
  direction: Direction;
}

export interface BlobData {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: EnemyState;
}

export interface BossData {
  id: string;
  kind: BossKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: BossState;
  phase: BossPhase;
}

export interface DropData {
  id: string;
  x: number;
  y: number;
  kind: string;
}

export interface GameStore {
  localPlayerId: string | null;
  localPlayer: PlayerData | null;
  waveCooldownEndsAt: number | null;
  dashCooldownEndsAt: number | null;
  boss: BossData | null;
  connected: boolean;
  connectionState: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
  playerCount: number;
  nickname: string | null;
  showNicknameModal: boolean;
  connectionError: string | null;
  lastConnectionAttempt: number | null;
  chatMessages: ServerChatMessage[];
  allPlayers: PlayerLeaderboardEntry[];
  setLocalPlayerId: (id: string) => void;
  setLocalPlayer: (p: PlayerData | null) => void;
  setWaveCooldownEndsAt: (time: number | null) => void;
  setDashCooldownEndsAt: (time: number | null) => void;
  setBoss: (b: BossData | null) => void;
  setConnected: (c: boolean) => void;
  setConnectionState: (state: GameStore['connectionState']) => void;
  setPlayerCount: (n: number) => void;
  setNickname: (name: string) => void;
  hideNicknameModal: () => void;
  openNicknameModal: () => void;
  setConnectionError: (error: string | null) => void;
  setLastConnectionAttempt: (time: number) => void;
  addChatMessage: (msg: ServerChatMessage) => void;
  setAllPlayers: (players: PlayerLeaderboardEntry[]) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  localPlayerId: null,
  localPlayer: null,
  waveCooldownEndsAt: null,
  dashCooldownEndsAt: null,
  boss: null,
  connected: false,
  connectionState: 'DISCONNECTED',
  playerCount: 0,
  nickname: initialConnectionContext.nickname,
  showNicknameModal: initialConnectionContext.nickname === null,
  connectionError: null,
  lastConnectionAttempt: null,
  chatMessages: [],
  allPlayers: [],
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  setLocalPlayer: (p) => set({ localPlayer: p }),
  setWaveCooldownEndsAt: (waveCooldownEndsAt) => set({ waveCooldownEndsAt }),
  setDashCooldownEndsAt: (dashCooldownEndsAt) => set({ dashCooldownEndsAt }),
  setBoss: (b) => set({ boss: b }),
  setConnected: (c) => set({ connected: c }),
  setConnectionState: (state) => set({ connectionState: state }),
  setPlayerCount: (n) => set({ playerCount: n }),
  setNickname: (name) => set({ nickname: name }),
  hideNicknameModal: () => set({ showNicknameModal: false }),
  openNicknameModal: () => set({ showNicknameModal: true }),
  setConnectionError: (error) => set({ connectionError: error }),
  setLastConnectionAttempt: (time) => set({ lastConnectionAttempt: time }),
  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [...state.chatMessages.slice(-49), msg],
    })),
  setAllPlayers: (players) => set({ allPlayers: players }),
}));
