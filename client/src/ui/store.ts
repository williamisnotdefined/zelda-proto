import { create } from 'zustand';

export interface PlayerData {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
  direction: string;
}

export interface SlimeData {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
}

export interface BossData {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
  phase: number;
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
  boss: BossData | null;
  connected: boolean;
  playerCount: number;
  setLocalPlayerId: (id: string) => void;
  setLocalPlayer: (p: PlayerData | null) => void;
  setBoss: (b: BossData | null) => void;
  setConnected: (c: boolean) => void;
  setPlayerCount: (n: number) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  localPlayerId: null,
  localPlayer: null,
  boss: null,
  connected: false,
  playerCount: 0,
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  setLocalPlayer: (p) => set({ localPlayer: p }),
  setBoss: (b) => set({ boss: b }),
  setConnected: (c) => set({ connected: c }),
  setPlayerCount: (n) => set({ playerCount: n }),
}));
