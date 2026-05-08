import type { ServerChatMessage, PlayerLeaderboardEntry } from '@/shared';
import type { ConnectionState } from '../../../network/NetworkManager';
import type { BossData, PlayerData } from '../../../ui/store';

export interface GameUiSink {
  syncConnectionState(state: ConnectionState): void;
  setLastConnectionAttempt(time: number): void;
  setConnectionError(error: string | null): void;
  openNicknameModal(): void;
  isNicknameModalOpen(): boolean;
  setLocalPlayerId(id: string): void;
  setLocalPlayer(player: PlayerData | null): void;
  setWaveCooldownEndsAt(time: number | null): void;
  setNumbCooldownEndsAt(time: number | null): void;
  setPullCooldownEndsAt(time: number | null): void;
  setVenomCooldownEndsAt(time: number | null): void;
  setDashCooldownEndsAt(time: number | null): void;
  setFireballCooldownEndsAt(time: number | null): void;
  setGrenadeCooldownEndsAt(time: number | null): void;
  setLandmineCooldownEndsAt(time: number | null): void;
  setBoss(boss: BossData | null): void;
  setLeaderboard(players: PlayerLeaderboardEntry[]): void;
  addChatMessage(message: ServerChatMessage): void;
}
