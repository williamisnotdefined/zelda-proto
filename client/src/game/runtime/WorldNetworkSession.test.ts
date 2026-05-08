import {
  INSTANCE_IDS,
  PROTOCOL_VERSION,
  SERVER_MESSAGE_TYPES,
  SESSION_RESUME_REJECT_REASONS,
  type SnapshotMessage,
  type WelcomeMessage,
} from '@/shared';
import { describe, expect, it, vi } from 'vitest';
import type { GameConnection, GameConnectionEvent } from '../../network/gameConnection';
import { WorldNetworkSession } from './WorldNetworkSession';
import type { GameUiSink } from './ui/GameUiSink';

class FakeConnection implements GameConnection {
  private eventHandler: ((event: GameConnectionEvent) => void) | null = null;

  constructor(private desiredNickname: boolean = false) {}

  connect(): void {}
  restoreIfNeeded = vi.fn();
  disconnect(): void {}
  dispose(): void {}
  onceOpen(): void {}
  send(): boolean {
    return true;
  }
  sendJoin(): void {}
  sendChat(): void {}
  getNetworkStats() {
    return {
      incomingBytesPerSecond: 0,
      incomingMessagesPerSecond: 0,
      outgoingBytesPerSecond: 0,
      outgoingMessagesPerSecond: 0,
      bufferedAmount: 0,
    };
  }
  hasDesiredNickname(): boolean {
    return this.desiredNickname;
  }
  onEvent(handler: (event: GameConnectionEvent) => void): () => void {
    this.eventHandler = handler;
    return () => {
      this.eventHandler = null;
    };
  }

  emit(event: GameConnectionEvent): void {
    this.eventHandler?.(event);
  }
}

function createUiSink(): GameUiSink & {
  setLocalPlayerId: ReturnType<typeof vi.fn>;
  setConnectionError: ReturnType<typeof vi.fn>;
  setLeaderboard: ReturnType<typeof vi.fn>;
  addChatMessage: ReturnType<typeof vi.fn>;
  openNicknameModal: ReturnType<typeof vi.fn>;
  syncConnectionState: ReturnType<typeof vi.fn>;
  setLastConnectionAttempt: ReturnType<typeof vi.fn>;
  setWaveCooldownEndsAt: ReturnType<typeof vi.fn>;
  setNumbCooldownEndsAt: ReturnType<typeof vi.fn>;
  setVenomCooldownEndsAt: ReturnType<typeof vi.fn>;
  setDashCooldownEndsAt: ReturnType<typeof vi.fn>;
  setFireballCooldownEndsAt: ReturnType<typeof vi.fn>;
  setGrenadeCooldownEndsAt: ReturnType<typeof vi.fn>;
  setLandmineCooldownEndsAt: ReturnType<typeof vi.fn>;
  setPullCooldownEndsAt: ReturnType<typeof vi.fn>;
} {
  return {
    setPullCooldownEndsAt: vi.fn(),
    setVenomCooldownEndsAt: vi.fn(),
    syncConnectionState: vi.fn(),
    setLastConnectionAttempt: vi.fn(),
    setConnectionError: vi.fn(),
    openNicknameModal: vi.fn(),
    isNicknameModalOpen: () => false,
    setLocalPlayerId: vi.fn(),
    setLocalPlayer: vi.fn(),
    setWaveCooldownEndsAt: vi.fn(),
    setNumbCooldownEndsAt: vi.fn(),
    setDashCooldownEndsAt: vi.fn(),
    setFireballCooldownEndsAt: vi.fn(),
    setGrenadeCooldownEndsAt: vi.fn(),
    setLandmineCooldownEndsAt: vi.fn(),
    setBoss: vi.fn(),
    setLeaderboard: vi.fn(),
    addChatMessage: vi.fn(),
  };
}

function createWelcome(): WelcomeMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: SERVER_MESSAGE_TYPES.WELCOME,
    id: 'player-1',
    sessionToken: 'session_token_123',
    resumed: false,
    mapWidth: 1000,
    mapHeight: 1000,
  };
}

function createSnapshot(): SnapshotMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: SERVER_MESSAGE_TYPES.SNAPSHOT,
    instanceId: INSTANCE_IDS.PHASE1,
    players: [],
    enemies: [],
    bosses: [],
    iceZones: [],
    aoeIndicators: [],
    waveIndicators: [],
    drops: [],
    portals: [],
    hazards: [],
  };
}

function createLeaderboard(): GameConnectionEvent {
  return {
    type: 'message',
    message: {
      protocolVersion: PROTOCOL_VERSION,
      type: SERVER_MESSAGE_TYPES.LEADERBOARD,
      players: [
        {
          id: 'player-1',
          nickname: 'Link',
          playerKills: 2,
          monsterKills: 4,
          deaths: 1,
        },
      ],
    },
  };
}

function createChat(): GameConnectionEvent {
  return {
    type: 'message',
    message: {
      protocolVersion: PROTOCOL_VERSION,
      type: SERVER_MESSAGE_TYPES.CHAT,
      id: 'player-1',
      nickname: 'Link',
      text: 'hello',
      timestamp: 123,
    },
  };
}

describe('WorldNetworkSession', () => {
  it('syncs connection state and restores the connection on start', () => {
    const connection = new FakeConnection();
    const ui = createUiSink();
    const session = new WorldNetworkSession(connection, ui, {
      onWelcome: vi.fn(),
      onSnapshot: vi.fn(),
    });

    session.start();
    connection.emit({ type: 'connection_state', state: 'CONNECTING' });

    expect(connection.restoreIfNeeded).toHaveBeenCalledTimes(1);
    expect(ui.setLastConnectionAttempt).toHaveBeenCalled();
    expect(ui.syncConnectionState).toHaveBeenCalledWith('CONNECTING');
  });

  it('routes welcome and snapshot messages to the runtime handlers', () => {
    const connection = new FakeConnection();
    const ui = createUiSink();
    const onWelcome = vi.fn();
    const onSnapshot = vi.fn();
    const session = new WorldNetworkSession(connection, ui, {
      onWelcome,
      onSnapshot,
    });

    session.start();
    connection.emit({ type: 'message', message: createWelcome() });
    connection.emit({ type: 'message', message: createSnapshot() });

    expect(ui.setLocalPlayerId).toHaveBeenCalledWith('player-1');
    expect(ui.setConnectionError).toHaveBeenCalledWith(null);
    expect(onWelcome).toHaveBeenCalledWith(createWelcome());
    expect(onSnapshot).toHaveBeenCalledWith(createSnapshot());
  });

  it('projects leaderboard and chat updates into the UI sink', () => {
    const connection = new FakeConnection();
    const ui = createUiSink();
    const session = new WorldNetworkSession(connection, ui, {
      onWelcome: vi.fn(),
      onSnapshot: vi.fn(),
    });

    session.start();
    const leaderboardEvent = createLeaderboard();
    const chatEvent = createChat();
    connection.emit(leaderboardEvent);
    connection.emit(chatEvent);

    if (
      leaderboardEvent.type !== 'message' ||
      leaderboardEvent.message.type !== SERVER_MESSAGE_TYPES.LEADERBOARD ||
      chatEvent.type !== 'message' ||
      chatEvent.message.type !== SERVER_MESSAGE_TYPES.CHAT
    ) {
      throw new Error('expected message events');
    }

    expect(ui.setLeaderboard).toHaveBeenCalledWith(leaderboardEvent.message.players);
    expect(ui.addChatMessage).toHaveBeenCalledWith(chatEvent.message);
  });

  it('opens the nickname flow only when resume rejection cannot auto-rejoin', () => {
    const withoutNicknameConnection = new FakeConnection(false);
    const withoutNicknameUi = createUiSink();
    const session = new WorldNetworkSession(withoutNicknameConnection, withoutNicknameUi, {
      onWelcome: vi.fn(),
      onSnapshot: vi.fn(),
    });

    session.start();
    withoutNicknameConnection.emit({
      type: 'message',
      message: {
        protocolVersion: PROTOCOL_VERSION,
        type: SERVER_MESSAGE_TYPES.RESUME_REJECTED,
        reason: SESSION_RESUME_REJECT_REASONS.INVALID_SESSION,
      },
    });

    expect(withoutNicknameUi.openNicknameModal).toHaveBeenCalledTimes(1);
    expect(withoutNicknameUi.setConnectionError).toHaveBeenCalledWith(
      'Session expired. Enter your nickname to reconnect.'
    );

    const withNicknameConnection = new FakeConnection(true);
    const withNicknameUi = createUiSink();
    const withNicknameSession = new WorldNetworkSession(withNicknameConnection, withNicknameUi, {
      onWelcome: vi.fn(),
      onSnapshot: vi.fn(),
    });

    withNicknameSession.start();
    withNicknameConnection.emit({
      type: 'message',
      message: {
        protocolVersion: PROTOCOL_VERSION,
        type: SERVER_MESSAGE_TYPES.RESUME_REJECTED,
        reason: SESSION_RESUME_REJECT_REASONS.INVALID_SESSION,
      },
    });

    expect(withNicknameUi.openNicknameModal).not.toHaveBeenCalled();
    expect(withNicknameUi.setConnectionError).not.toHaveBeenCalledWith(
      'Session expired. Enter your nickname to reconnect.'
    );
  });
});
