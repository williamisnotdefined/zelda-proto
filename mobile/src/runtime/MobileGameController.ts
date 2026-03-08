import { createInputMessage, getDeltaForInput, hasDirectionalChange } from '@gelehka/game-core';
import { SERVER_MESSAGE_TYPES } from '@gelehka/shared';
import type { ServerMessage, SnapshotMessage } from '@gelehka/shared';
import { audioController } from '../audio/AudioController';
import { runtimeConfig } from '../config/runtime';
import type { ConnectionState } from '../network/MobileNetworkManager';
import {
  connect,
  disconnect,
  onConnectionState,
  onError,
  onMessage,
  send,
  sendChat,
  sendJoin,
} from '../network/socket';
import { useMobileInputStore } from '../store/inputStore';
import { useMobileGameStore } from '../store/gameStore';

const INPUT_SEND_INTERVAL_MS = 33;
const PLAYER_PREDICT_SPEED = 150;
const PLAYER_ATTACK_SPEED_PENALTY = 0.5;
const PRESENTATION_TICK_MS = 16;

class MobileGameController {
  private started = false;
  private unsubscribers: Array<() => void> = [];
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private presentationTimer: ReturnType<typeof setInterval> | null = null;
  private inputAccumulatorMs = 0;
  private previousInputTickMs = 0;
  private previousPresentationTickMs = 0;
  private prevAttackDown = false;
  private previousLocalState: string | null = null;

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    audioController.startBackgroundMusic().catch(() => undefined);
    this.unsubscribers = [
      onMessage((message) => this.handleMessage(message)),
      onError((error) => useMobileGameStore.getState().setConnectionError(error)),
      onConnectionState((state) => this.handleConnectionState(state)),
    ];

    this.previousInputTickMs = Date.now();
    this.inputTimer = setInterval(() => this.tickInputLoop(), INPUT_SEND_INTERVAL_MS);

    this.previousPresentationTickMs = Date.now();
    this.presentationTimer = setInterval(() => this.tickPresentationLoop(), PRESENTATION_TICK_MS);
  }

  stop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = null;
    }

    if (this.presentationTimer) {
      clearInterval(this.presentationTimer);
      this.presentationTimer = null;
    }

    disconnect();
    audioController.stopBackgroundMusic().catch(() => undefined);
    useMobileInputStore.getState().reset();
    this.previousLocalState = null;
  }

  connectWithNickname(nickname: string): void {
    const trimmed = nickname.trim();
    const store = useMobileGameStore.getState();

    store.setNickname(trimmed);
    store.setConnectionError(null);
    store.setLastConnectionAttempt(Date.now());
    if (!trimmed) {
      store.setConnectionError('Escolha um nickname antes de conectar.');
      return;
    }

    connect(runtimeConfig.wsUrl);
  }

  sendChatMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    sendChat(trimmed.slice(0, 100));
  }

  disconnect(): void {
    disconnect();
  }

  setMuted(muted: boolean): void {
    audioController.setMuted(muted).catch(() => undefined);
  }

  getMuted(): boolean {
    return audioController.getMuted();
  }

  private handleConnectionState(state: ConnectionState): void {
    const store = useMobileGameStore.getState();
    store.setConnectionState(state);

    if (state === 'CONNECTED') {
      const nickname = store.nickname.trim();
      if (nickname) {
        sendJoin(nickname);
      }
      return;
    }

    if (state === 'DISCONNECTED') {
      this.inputAccumulatorMs = 0;
      this.prevAttackDown = false;
      store.resetSession();
      this.previousLocalState = null;
    }
  }

  private handleMessage(message: ServerMessage): void {
    const store = useMobileGameStore.getState();
    const previousToastyCount = store.predictedLocalPlayer?.toastyCount ?? 0;

    switch (message.type) {
      case SERVER_MESSAGE_TYPES.WELCOME:
        store.handleWelcome(message);
        break;
      case SERVER_MESSAGE_TYPES.SNAPSHOT:
        store.handleSnapshot(message as SnapshotMessage, Date.now());
        this.handleLocalSnapshotFx();
        if (
          (useMobileGameStore.getState().predictedLocalPlayer?.toastyCount ?? 0) >
          previousToastyCount
        ) {
          store.showToastyFx();
          audioController.playToasty().catch(() => undefined);
        }
        break;
      case SERVER_MESSAGE_TYPES.LEADERBOARD:
        store.setConnectionError(null);
        store.setLeaderboardPlayers(message.players);
        break;
      case SERVER_MESSAGE_TYPES.CHAT:
        store.addChatMessage(message);
        break;
      default:
        break;
    }
  }

  private tickInputLoop(): void {
    const now = Date.now();
    const dtMs = Math.max(1, now - this.previousInputTickMs);
    this.previousInputTickMs = now;

    const game = useMobileGameStore.getState();
    const input = useMobileInputStore.getState();
    const localPlayer = game.predictedLocalPlayer;
    const localDead = localPlayer?.state === 'dead';

    const rawAttackDown = input.attackPressed;
    const attack = rawAttackDown && !this.prevAttackDown;
    this.prevAttackDown = rawAttackDown;

    const inputState = {
      up: !localDead && input.move.up,
      down: !localDead && input.move.down,
      left: !localDead && input.move.left,
      right: !localDead && input.move.right,
      attack: !localDead && attack,
    };

    if (localPlayer && localPlayer.state !== 'dead') {
      const speedPenalty = localPlayer.state === 'attacking' ? PLAYER_ATTACK_SPEED_PENALTY : 1;
      const delta = getDeltaForInput(inputState, dtMs, PLAYER_PREDICT_SPEED, speedPenalty);
      if (delta.dx !== 0 || delta.dy !== 0) {
        game.setPredictedLocalPlayer({
          ...localPlayer,
          x: localPlayer.x + delta.dx,
          y: localPlayer.y + delta.dy,
        });
      }
    }

    this.inputAccumulatorMs += dtMs;
    const shouldSend =
      game.connected &&
      game.localPlayerId &&
      (this.inputAccumulatorMs >= INPUT_SEND_INTERVAL_MS ||
        hasDirectionalChange(game.lastSentInputState, inputState) ||
        inputState.attack);

    if (!shouldSend) {
      return;
    }

    const windowMs = Math.max(1, this.inputAccumulatorMs);
    this.inputAccumulatorMs = 0;

    const seq = game.consumeNextInputSeq();
    const message = createInputMessage(seq, inputState);
    game.pushPendingInput({ input: message, dtMs: windowMs, sentAtMs: now });
    game.setLastSentInputState({
      up: inputState.up,
      down: inputState.down,
      left: inputState.left,
      right: inputState.right,
      attack: false,
    });
    send(message);
  }

  private tickPresentationLoop(): void {
    const now = Date.now();
    const dtMs = Math.max(1, now - this.previousPresentationTickMs);
    this.previousPresentationTickMs = now;
    useMobileGameStore.getState().tickPresentation(dtMs);
  }

  private handleLocalSnapshotFx(): void {
    const store = useMobileGameStore.getState();
    const localPlayer = store.predictedLocalPlayer;
    if (!localPlayer) {
      this.previousLocalState = null;
      return;
    }

    if (!this.previousLocalState) {
      store.showSafeZoneFx(localPlayer.x, localPlayer.y);
    } else if (this.previousLocalState === 'dead' && localPlayer.state !== 'dead') {
      store.showSafeZoneFx(localPlayer.x, localPlayer.y);
    }

    this.previousLocalState = localPlayer.state;
  }
}

export const mobileGameController = new MobileGameController();
