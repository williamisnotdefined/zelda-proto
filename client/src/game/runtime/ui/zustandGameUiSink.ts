import type { ServerChatMessage, PlayerLeaderboardEntry } from '@gelehka/shared';
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

  setDashCooldownEndsAt(time: number | null): void {
    useGameStore.getState().setDashCooldownEndsAt(time);
  }

  setBoss(boss: BossData | null): void {
    useGameStore.getState().setBoss(boss);
  }

  setLeaderboard(players: PlayerLeaderboardEntry[]): void {
    const store = useGameStore.getState();
    store.setAllPlayers(players);
    store.setPlayerCount(players.length);
  }

  addChatMessage(message: ServerChatMessage): void {
    useGameStore.getState().addChatMessage(message);
  }
}

export const zustandGameUiSink = new ZustandGameUiSink();
