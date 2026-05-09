import type { SnapshotMessage, WelcomeMessage } from '@/shared';
import { SERVER_MESSAGE_TYPES, SESSION_RESUME_REJECT_REASONS } from '@/shared';
import type { GameConnection } from '../../network/gameConnection';
import type { GameUiSink } from './ui/GameUiSink';

const SESSION_IN_USE_ERROR = 'Session is already active in another connection.';
const SESSION_EXPIRED_ERROR = 'Session expired. Enter your nickname to reconnect.';

interface WorldNetworkSessionHandlers {
  onWelcome: (message: WelcomeMessage) => void;
  onSnapshot: (message: SnapshotMessage) => void;
}

export class WorldNetworkSession {
  private removeEventHandler: (() => void) | null = null;

  constructor(
    private readonly connection: GameConnection,
    private readonly ui: GameUiSink,
    private readonly handlers: WorldNetworkSessionHandlers
  ) {}

  start(): void {
    this.ui.setLastConnectionAttempt(Date.now());
    this.removeEventHandler = this.connection.onEvent((event) => {
      if (event.type === 'connection_state') {
        this.ui.syncConnectionState(event.state);
        if (event.state === 'CONNECTING') {
          this.ui.setLastConnectionAttempt(Date.now());
        }
        return;
      }

      if (event.type === 'error') {
        this.ui.setConnectionError(event.error);
        return;
      }

      const { message } = event;
      switch (message.type) {
        case SERVER_MESSAGE_TYPES.WELCOME:
          this.ui.setLocalPlayerId(message.id);
          this.ui.setConnectionError(null);
          this.handlers.onWelcome(message);
          break;
        case SERVER_MESSAGE_TYPES.SNAPSHOT:
          this.handlers.onSnapshot(message);
          break;
        case SERVER_MESSAGE_TYPES.LEADERBOARD:
          this.ui.setLeaderboard(message.players);
          break;
        case SERVER_MESSAGE_TYPES.RESUME_REJECTED:
          if (message.reason === SESSION_RESUME_REJECT_REASONS.SESSION_IN_USE) {
            this.ui.setConnectionError(SESSION_IN_USE_ERROR);
            return;
          }

          if (!this.connection.hasDesiredNickname()) {
            this.ui.openNicknameModal();
            this.ui.setConnectionError(SESSION_EXPIRED_ERROR);
          }
          break;
      }
    });

    this.connection.restoreIfNeeded();
  }

  stop(): void {
    this.removeEventHandler?.();
    this.removeEventHandler = null;
  }

  send(message: Parameters<GameConnection['send']>[0]): boolean {
    return this.connection.send(message);
  }

  getNetworkStats(): ReturnType<GameConnection['getNetworkStats']> {
    return this.connection.getNetworkStats();
  }
}
