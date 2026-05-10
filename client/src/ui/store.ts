import type {
  BossKind,
  BossPhase,
  BossState,
  Direction,
  EnemyState,
  PlayerLeaderboardEntry,
  PlayerState,
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

export interface LocalPlayerHudData {
  hp: number;
  maxHp: number;
  state: PlayerState;
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
  localPlayerHud: LocalPlayerHudData | null;
  waveCooldownEndsAt: number | null;
  numbCooldownEndsAt: number | null;
  pullCooldownEndsAt: number | null;
  venomCooldownEndsAt: number | null;
  confusionCooldownEndsAt: number | null;
  dashCooldownEndsAt: number | null;
  grenadeCooldownEndsAt: number | null;
  molotovCooldownEndsAt: number | null;
  landmineCooldownEndsAt: number | null;
  shurikenCooldownEndsAt: number | null;
  spikedBallsCooldownEndsAt: number | null;
  boss: BossData | null;
  connected: boolean;
  connectionState: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
  playerCount: number;
  nickname: string | null;
  showNicknameModal: boolean;
  connectionError: string | null;
  lastConnectionAttempt: number | null;
  allPlayers: PlayerLeaderboardEntry[];
  setLocalPlayerId: (id: string) => void;
  setLocalPlayer: (p: PlayerData | null) => void;
  setWaveCooldownEndsAt: (time: number | null) => void;
  setNumbCooldownEndsAt: (time: number | null) => void;
  setPullCooldownEndsAt: (time: number | null) => void;
  setVenomCooldownEndsAt: (time: number | null) => void;
  setConfusionCooldownEndsAt: (time: number | null) => void;
  setDashCooldownEndsAt: (time: number | null) => void;
  setGrenadeCooldownEndsAt: (time: number | null) => void;
  setMolotovCooldownEndsAt: (time: number | null) => void;
  setLandmineCooldownEndsAt: (time: number | null) => void;
  setShurikenCooldownEndsAt: (time: number | null) => void;
  setSpikedBallsCooldownEndsAt: (time: number | null) => void;
  setBoss: (b: BossData | null) => void;
  setConnected: (c: boolean) => void;
  setConnectionState: (state: GameStore['connectionState']) => void;
  setPlayerCount: (n: number) => void;
  setNickname: (name: string) => void;
  hideNicknameModal: () => void;
  openNicknameModal: () => void;
  setConnectionError: (error: string | null) => void;
  setLastConnectionAttempt: (time: number) => void;
  setAllPlayers: (players: PlayerLeaderboardEntry[]) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  localPlayerId: null,
  localPlayer: null,
  localPlayerHud: null,
  waveCooldownEndsAt: null,
  numbCooldownEndsAt: null,
  pullCooldownEndsAt: null,
  venomCooldownEndsAt: null,
  confusionCooldownEndsAt: null,
  dashCooldownEndsAt: null,
  grenadeCooldownEndsAt: null,
  molotovCooldownEndsAt: null,
  landmineCooldownEndsAt: null,
  shurikenCooldownEndsAt: null,
  spikedBallsCooldownEndsAt: null,
  boss: null,
  connected: false,
  connectionState: 'DISCONNECTED',
  playerCount: 0,
  nickname: initialConnectionContext.nickname,
  showNicknameModal: initialConnectionContext.nickname === null,
  connectionError: null,
  lastConnectionAttempt: null,
  allPlayers: [],
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  setLocalPlayer: (p) =>
    set((state) => {
      if (!p) {
        return {
          localPlayer: null,
          localPlayerHud: null,
        };
      }

      const nextHud: LocalPlayerHudData = {
        hp: p.hp,
        maxHp: p.maxHp,
        state: p.state,
      };
      const previousHud = state.localPlayerHud;

      return {
        localPlayer: p,
        localPlayerHud:
          previousHud &&
          previousHud.hp === nextHud.hp &&
          previousHud.maxHp === nextHud.maxHp &&
          previousHud.state === nextHud.state
            ? previousHud
            : nextHud,
      };
    }),
  setWaveCooldownEndsAt: (waveCooldownEndsAt) => set({ waveCooldownEndsAt }),
  setNumbCooldownEndsAt: (numbCooldownEndsAt) => set({ numbCooldownEndsAt }),
  setPullCooldownEndsAt: (pullCooldownEndsAt) => set({ pullCooldownEndsAt }),
  setVenomCooldownEndsAt: (venomCooldownEndsAt) => set({ venomCooldownEndsAt }),
  setConfusionCooldownEndsAt: (confusionCooldownEndsAt) => set({ confusionCooldownEndsAt }),
  setDashCooldownEndsAt: (dashCooldownEndsAt) => set({ dashCooldownEndsAt }),
  setGrenadeCooldownEndsAt: (grenadeCooldownEndsAt) => set({ grenadeCooldownEndsAt }),
  setMolotovCooldownEndsAt: (molotovCooldownEndsAt) => set({ molotovCooldownEndsAt }),
  setLandmineCooldownEndsAt: (landmineCooldownEndsAt) => set({ landmineCooldownEndsAt }),
  setShurikenCooldownEndsAt: (shurikenCooldownEndsAt) => set({ shurikenCooldownEndsAt }),
  setSpikedBallsCooldownEndsAt: (spikedBallsCooldownEndsAt) => set({ spikedBallsCooldownEndsAt }),
  setBoss: (b) => set({ boss: b }),
  setConnected: (c) => set({ connected: c }),
  setConnectionState: (state) => set({ connectionState: state }),
  setPlayerCount: (n) => set({ playerCount: n }),
  setNickname: (name) => set({ nickname: name }),
  hideNicknameModal: () => set({ showNicknameModal: false }),
  openNicknameModal: () => set({ showNicknameModal: true }),
  setConnectionError: (error) => set({ connectionError: error }),
  setLastConnectionAttempt: (time) => set({ lastConnectionAttempt: time }),
  setAllPlayers: (players) => set({ allPlayers: players }),
}));
