import {
    PLAYER_ATTACK_SPEED_PENALTY,
    createInputMessage,
    hasDirectionalChange,
} from '@gelehka/game-core';
import type { InputMessage } from '@gelehka/shared';
import Phaser from 'phaser';
import { PlayerEntity } from '../../entities/Player';
import type { GameConnection } from '../../network/gameConnection';
import type { InputState, PendingInput } from '../controllers/PredictionController';
import { PredictionController } from '../controllers/PredictionController';
import { useTouchInputStore } from '../input/touchInputStore';

const INPUT_SEND_INTERVAL_MS = 33;
const MAX_PENDING_INPUTS = 128;

export class LocalInputController {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private prevAttackDown = false;
  private nextInputSeq = 0;
  private pendingInputs: PendingInput[] = [];
  private inputSendAccumulatorMs = 0;
  private lastSentInputState: InputState | null = null;
  private readonly predictionController = new PredictionController();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly connection: GameConnection
  ) {
    this.bindKeys();
  }

  handleWelcome(): void {
    this.nextInputSeq = 0;
    this.pendingInputs = [];
    this.inputSendAccumulatorMs = 0;
    this.lastSentInputState = null;
    this.prevAttackDown = false;
  }

  reset(): void {
    this.pendingInputs = [];
    this.inputSendAccumulatorMs = 0;
    this.lastSentInputState = null;
    this.prevAttackDown = false;
  }

  reconcileLocalPlayer(
    player: Parameters<PredictionController['reconcileLocalPrediction']>[1],
    entity: PlayerEntity
  ): void {
    this.pendingInputs = this.predictionController.reconcileLocalPrediction(
      this.scene.time.now,
      player,
      entity,
      this.pendingInputs,
      () => {
        this.inputSendAccumulatorMs = 0;
      }
    );
  }

  update(delta: number, localEntity: PlayerEntity | null, uiBlocked: boolean): void {
    this.predictionController.trimPendingInputs(this.pendingInputs);

    if (!localEntity) {
      return;
    }

    const localDead = localEntity.serverState === 'dead';
    const touchInput = useTouchInputStore.getState();

    const rawAttackDown = this.attackKey.isDown || touchInput.attackPressed;
    const attack = rawAttackDown && !this.prevAttackDown;
    this.prevAttackDown = rawAttackDown;

    const inputState: InputState = {
      up:
        !uiBlocked &&
        !localDead &&
        (this.cursors.up.isDown || this.keyW.isDown || touchInput.move.up),
      down:
        !uiBlocked &&
        !localDead &&
        (this.cursors.down.isDown || this.keyS.isDown || touchInput.move.down),
      left:
        !uiBlocked &&
        !localDead &&
        (this.cursors.left.isDown || this.keyA.isDown || touchInput.move.left),
      right:
        !uiBlocked &&
        !localDead &&
        (this.cursors.right.isDown || this.keyD.isDown || touchInput.move.right),
      attack: !uiBlocked && !localDead && attack,
    };

    this.predictionController.applyLocalPrediction(inputState, delta, localEntity);

    this.inputSendAccumulatorMs += delta;
    const intervalElapsed = this.inputSendAccumulatorMs >= INPUT_SEND_INTERVAL_MS;
    const changedSinceLastSend = hasDirectionalChange(this.lastSentInputState, inputState);

    if (!intervalElapsed && !changedSinceLastSend && !inputState.attack) {
      return;
    }

    const dtWindowMs = Math.max(1, this.inputSendAccumulatorMs);
    this.inputSendAccumulatorMs = 0;

    const input: InputMessage = createInputMessage(this.nextInputSeq++, inputState);
    const speedMultiplier =
      localEntity.serverState === 'attacking' || inputState.attack
        ? PLAYER_ATTACK_SPEED_PENALTY
        : 1;

    this.pendingInputs.push({
      input,
      dtMs: dtWindowMs,
      sentAtMs: this.scene.time.now,
      speedMultiplier,
    });
    if (this.pendingInputs.length > MAX_PENDING_INPUTS) {
      this.pendingInputs.splice(0, this.pendingInputs.length - MAX_PENDING_INPUTS);
    }

    this.lastSentInputState = {
      up: inputState.up,
      down: inputState.down,
      left: inputState.left,
      right: inputState.right,
      attack: false,
    };
    this.connection.send(input);
  }

  private bindKeys(): void {
    this.cursors = this.scene.input.keyboard!.createCursorKeys();
    this.keyW = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W, false);
    this.keyA = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A, false);
    this.keyS = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S, false);
    this.keyD = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D, false);
    this.attackKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
  }
}
