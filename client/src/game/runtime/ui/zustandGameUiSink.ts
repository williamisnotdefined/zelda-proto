import type { PlayerLeaderboardEntry } from '@/shared';
import type { ConnectionState } from '../../../network/NetworkManager';
import type { BossData, PlayerData } from '../../../ui/store';
import { useGameStore } from '../../../ui/store';
import type { GameUiSink } from './GameUiSink';

class ZustandGameUiSink implements GameUiSink {
  syncConnectionState(state: ConnectionState): void {
    const store = useGameStore.getState();
    store.setConnectionState(state);
    store.setConnected(state === 'CONNECTED');
  }

  setLastConnectionAttempt(time: number): void {
    useGameStore.getState().setLastConnectionAttempt(time);
  }

  setConnectionError(error: string | null): void {
    useGameStore.getState().setConnectionError(error);
  }

  openNicknameModal(): void {
    useGameStore.getState().openNicknameModal();
  }

  isNicknameModalOpen(): boolean {
    return useGameStore.getState().showNicknameModal;
  }

  setLocalPlayerId(id: string): void {
    useGameStore.getState().setLocalPlayerId(id);
  }

  setLocalPlayer(player: PlayerData | null): void {
    useGameStore.getState().setLocalPlayer(player);
  }

  setWaveCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setWaveCooldownEndsAt(time);
  }

  setNumbCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setNumbCooldownEndsAt(time);
  }

  setPullCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setPullCooldownEndsAt(time);
  }

  setVenomCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setVenomCooldownEndsAt(time);
  }

  setConfusionCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setConfusionCooldownEndsAt(time);
  }

  setDashCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setDashCooldownEndsAt(time);
  }

  setGrenadeCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setGrenadeCooldownEndsAt(time);
  }

  setMolotovCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setMolotovCooldownEndsAt(time);
  }

  setLandmineCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setLandmineCooldownEndsAt(time);
  }

  setShurikenCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setShurikenCooldownEndsAt(time);
  }

  setSpikedBallsCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setSpikedBallsCooldownEndsAt(time);
  }

  setBoss(boss: BossData | null): void {
    useGameStore.getState().setBoss(boss);
  }

  setLeaderboard(players: PlayerLeaderboardEntry[]): void {
    const store = useGameStore.getState();
    store.setAllPlayers(players);
    store.setPlayerCount(players.length);
  }
}

export const zustandGameUiSink = new ZustandGameUiSink();
