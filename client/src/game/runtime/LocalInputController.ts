import {
  PLAYER_ATTACK_COOLDOWN,
  PLAYER_DASH_COOLDOWN,
  PLAYER_DASH_DOUBLE_TAP_WINDOW,
  PLAYER_FIREBALL_COOLDOWN,
  PLAYER_GRENADE_COOLDOWN,
  PLAYER_LANDMINE_COOLDOWN,
  PLAYER_NUMB_COOLDOWN,
  PLAYER_PULL_COOLDOWN,
  PLAYER_WAVE_CAST_DURATION,
  PLAYER_WAVE_COOLDOWN,
  createInputMessage,
  hasDirectionalChange,
} from '@/game-core';
import type { Direction, InputMessage } from '@/shared';
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
  private waveKey!: Phaser.Input.Keyboard.Key;
  private numbKey!: Phaser.Input.Keyboard.Key;
  private pullKey!: Phaser.Input.Keyboard.Key;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private fireballKey!: Phaser.Input.Keyboard.Key;
  private grenadeKey!: Phaser.Input.Keyboard.Key;
  private landmineKey!: Phaser.Input.Keyboard.Key;
  private prevFireballDown = false;
  private prevGrenadeDown = false;
  private prevWaveDown = false;
  private prevNumbDown = false;
  private prevPullDown = false;
  private prevLandmineDown = false;
  private prevUpDown = false;
  private prevDownDown = false;
  private prevLeftDown = false;
  private prevRightDown = false;
  private nextInputSeq = 0;
  private pendingInputs: PendingInput[] = [];
  private inputSendAccumulatorMs = 0;
  private lastSentInputState: InputState | null = null;
  private waveCooldownEndsAtMs = 0;
  private attackCooldownEndsAtMs = 0;
  private dashCooldownEndsAtMs = 0;
  private numbCooldownEndsAtMs = 0;
  private pullCooldownEndsAtMs = 0;
  private fireballCooldownEndsAtMs = 0;
  private grenadeCooldownEndsAtMs = 0;
  private landmineCooldownEndsAtMs = 0;
  private waveLikeActiveUntilMs = 0;
  private readonly lastDirectionalTapAtMs: Record<Direction, number> = {
    up: 0,
    down: 0,
    left: 0,
    right: 0,
  };
  private readonly predictionController = new PredictionController();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly connection: GameConnection,
    private readonly setWaveCooldownEndsAt: (time: number | null) => void,
    private readonly setNumbCooldownEndsAt: (time: number | null) => void,
    private readonly setPullCooldownEndsAt: (time: number | null) => void,
    private readonly setDashCooldownEndsAt: (time: number | null) => void,
    private readonly setFireballCooldownEndsAt: (time: number | null) => void,
    private readonly setGrenadeCooldownEndsAt: (time: number | null) => void,
    private readonly setLandmineCooldownEndsAt: (time: number | null) => void
  ) {
    this.bindKeys();
  }

  handleWelcome(): void {
    this.nextInputSeq = 0;
    this.pendingInputs = [];
    this.inputSendAccumulatorMs = 0;
    this.lastSentInputState = null;
    this.prevFireballDown = false;
    this.prevGrenadeDown = false;
    this.prevWaveDown = false;
    this.prevNumbDown = false;
    this.prevPullDown = false;
    this.prevLandmineDown = false;
    this.resetDirectionalTapState();
    this.waveCooldownEndsAtMs = 0;
    this.attackCooldownEndsAtMs = 0;
    this.dashCooldownEndsAtMs = 0;
    this.numbCooldownEndsAtMs = 0;
    this.pullCooldownEndsAtMs = 0;
    this.fireballCooldownEndsAtMs = 0;
    this.grenadeCooldownEndsAtMs = 0;
    this.landmineCooldownEndsAtMs = 0;
    this.waveLikeActiveUntilMs = 0;
    this.setWaveCooldownEndsAt(null);
    this.setNumbCooldownEndsAt(null);
    this.setPullCooldownEndsAt(null);
    this.setDashCooldownEndsAt(null);
    this.setFireballCooldownEndsAt(null);
    this.setGrenadeCooldownEndsAt(null);
    this.setLandmineCooldownEndsAt(null);
  }

  reset(): void {
    this.pendingInputs = [];
    this.inputSendAccumulatorMs = 0;
    this.lastSentInputState = null;
    this.prevFireballDown = false;
    this.prevGrenadeDown = false;
    this.prevWaveDown = false;
    this.prevNumbDown = false;
    this.prevPullDown = false;
    this.prevLandmineDown = false;
    this.resetDirectionalTapState();
    this.waveCooldownEndsAtMs = 0;
    this.attackCooldownEndsAtMs = 0;
    this.dashCooldownEndsAtMs = 0;
    this.numbCooldownEndsAtMs = 0;
    this.pullCooldownEndsAtMs = 0;
    this.fireballCooldownEndsAtMs = 0;
    this.grenadeCooldownEndsAtMs = 0;
    this.landmineCooldownEndsAtMs = 0;
    this.waveLikeActiveUntilMs = 0;
    this.setWaveCooldownEndsAt(null);
    this.setNumbCooldownEndsAt(null);
    this.setPullCooldownEndsAt(null);
    this.setDashCooldownEndsAt(null);
    this.setFireballCooldownEndsAt(null);
    this.setGrenadeCooldownEndsAt(null);
    this.setLandmineCooldownEndsAt(null);
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
    const nowMs = Date.now();

    if (localDead && this.waveCooldownEndsAtMs !== 0) {
      this.waveCooldownEndsAtMs = 0;
      this.setWaveCooldownEndsAt(null);
    }
    if (localDead && this.attackCooldownEndsAtMs !== 0) {
      this.attackCooldownEndsAtMs = 0;
    }
    if (localDead && this.dashCooldownEndsAtMs !== 0) {
      this.dashCooldownEndsAtMs = 0;
      this.setDashCooldownEndsAt(null);
    }
    if (localDead && this.numbCooldownEndsAtMs !== 0) {
      this.numbCooldownEndsAtMs = 0;
      this.setNumbCooldownEndsAt(null);
    }
    if (localDead && this.pullCooldownEndsAtMs !== 0) {
      this.pullCooldownEndsAtMs = 0;
      this.setPullCooldownEndsAt(null);
    }
    if (localDead && this.fireballCooldownEndsAtMs !== 0) {
      this.fireballCooldownEndsAtMs = 0;
      this.setFireballCooldownEndsAt(null);
    }
    if (localDead && this.grenadeCooldownEndsAtMs !== 0) {
      this.grenadeCooldownEndsAtMs = 0;
      this.setGrenadeCooldownEndsAt(null);
    }
    if (localDead && this.landmineCooldownEndsAtMs !== 0) {
      this.landmineCooldownEndsAtMs = 0;
      this.setLandmineCooldownEndsAt(null);
    }
    if (localDead) {
      this.waveLikeActiveUntilMs = 0;
      this.resetDirectionalTapState();
    }

    const rawAttackDown = this.attackKey.isDown || touchInput.attackPressed;
    const rawFireballDown = this.fireballKey.isDown || touchInput.fireballPressed;
    const manualFireball = rawFireballDown && !this.prevFireballDown;
    this.prevFireballDown = rawFireballDown;
    const rawGrenadeDown = this.grenadeKey.isDown || touchInput.grenadePressed;
    const manualGrenade = rawGrenadeDown && !this.prevGrenadeDown;
    this.prevGrenadeDown = rawGrenadeDown;
    const rawNumbDown = this.numbKey.isDown || touchInput.numbPressed;
    const manualNumb = rawNumbDown && !this.prevNumbDown;
    this.prevNumbDown = rawNumbDown;
    const rawPullDown = this.pullKey.isDown || touchInput.pullPressed;
    const manualPull = rawPullDown && !this.prevPullDown;
    this.prevPullDown = rawPullDown;
    const rawLandmineDown = this.landmineKey.isDown || touchInput.landminePressed;
    const manualLandmine = rawLandmineDown && !this.prevLandmineDown;
    this.prevLandmineDown = rawLandmineDown;
    const rawUpDown = this.cursors.up.isDown || touchInput.move.up;
    const rawDownDown = this.cursors.down.isDown || touchInput.move.down;
    const rawLeftDown = this.cursors.left.isDown || touchInput.move.left;
    const rawRightDown = this.cursors.right.isDown || touchInput.move.right;
    const rawWaveDown = this.waveKey.isDown || touchInput.wavePressed;
    const dashDirection = this.consumeDashDirectionTap(
      nowMs,
      {
        up: rawUpDown,
        down: rawDownDown,
        left: rawLeftDown,
        right: rawRightDown,
      },
      !uiBlocked && !localDead
    );
    const attackReady = nowMs >= this.attackCooldownEndsAtMs;
    const waveReady = nowMs >= this.waveCooldownEndsAtMs;
    const dashReady = nowMs >= this.dashCooldownEndsAtMs;
    const numbReady = nowMs >= this.numbCooldownEndsAtMs;
    const pullReady = nowMs >= this.pullCooldownEndsAtMs;
    const fireballReady = nowMs >= this.fireballCooldownEndsAtMs;
    const grenadeReady = nowMs >= this.grenadeCooldownEndsAtMs;
    const landmineReady = nowMs >= this.landmineCooldownEndsAtMs;
    const waveLikeReady = nowMs >= this.waveLikeActiveUntilMs;
    const attack = !uiBlocked && !localDead && rawAttackDown && attackReady;
    const manualWave = rawWaveDown && !this.prevWaveDown;
    const wave = manualWave && waveReady && waveLikeReady;
    const dash = dashDirection !== null && dashReady;
    const numb = manualNumb && numbReady && waveLikeReady;
    const pull = manualPull && pullReady && waveLikeReady;
    const fireball = manualFireball && fireballReady;
    const grenade = manualGrenade && grenadeReady;
    const landmine = manualLandmine && landmineReady;
    this.prevWaveDown = rawWaveDown;
    if (attack) {
      this.attackCooldownEndsAtMs = nowMs + PLAYER_ATTACK_COOLDOWN;
    }
    if (wave) {
      this.waveCooldownEndsAtMs = nowMs + PLAYER_WAVE_COOLDOWN;
      this.waveLikeActiveUntilMs = nowMs + PLAYER_WAVE_CAST_DURATION;
      this.setWaveCooldownEndsAt(this.waveCooldownEndsAtMs);
    }
    if (dash) {
      this.dashCooldownEndsAtMs = nowMs + PLAYER_DASH_COOLDOWN;
      this.setDashCooldownEndsAt(this.dashCooldownEndsAtMs);
    }
    if (numb) {
      this.numbCooldownEndsAtMs = nowMs + PLAYER_NUMB_COOLDOWN;
      this.waveLikeActiveUntilMs = nowMs + PLAYER_WAVE_CAST_DURATION;
      this.setNumbCooldownEndsAt(this.numbCooldownEndsAtMs);
    }
    if (pull) {
      this.pullCooldownEndsAtMs = nowMs + PLAYER_PULL_COOLDOWN;
      this.waveLikeActiveUntilMs = nowMs + PLAYER_WAVE_CAST_DURATION;
      this.setPullCooldownEndsAt(this.pullCooldownEndsAtMs);
    }
    if (fireball) {
      this.fireballCooldownEndsAtMs = nowMs + PLAYER_FIREBALL_COOLDOWN;
      this.setFireballCooldownEndsAt(this.fireballCooldownEndsAtMs);
    }
    if (grenade) {
      this.grenadeCooldownEndsAtMs = nowMs + PLAYER_GRENADE_COOLDOWN;
      this.setGrenadeCooldownEndsAt(this.grenadeCooldownEndsAtMs);
    }
    if (landmine) {
      this.landmineCooldownEndsAtMs = nowMs + PLAYER_LANDMINE_COOLDOWN;
      this.setLandmineCooldownEndsAt(this.landmineCooldownEndsAtMs);
    }

    const inputState: InputState = {
      up: !uiBlocked && !localDead && rawUpDown,
      down: !uiBlocked && !localDead && rawDownDown,
      left: !uiBlocked && !localDead && rawLeftDown,
      right: !uiBlocked && !localDead && rawRightDown,
      attack,
      wave: !uiBlocked && !localDead && wave,
      numb: !uiBlocked && !localDead && numb,
      pull: !uiBlocked && !localDead && pull,
      dash: !uiBlocked && !localDead && dash,
      fireball: !uiBlocked && !localDead && fireball,
      grenade: !uiBlocked && !localDead && grenade,
      landmine: !uiBlocked && !localDead && landmine,
    };

    this.predictionController.applyLocalPrediction(inputState, delta, localEntity);

    this.inputSendAccumulatorMs += delta;
    const intervalElapsed = this.inputSendAccumulatorMs >= INPUT_SEND_INTERVAL_MS;
    const changedSinceLastSend = hasDirectionalChange(this.lastSentInputState, inputState);

    if (
      !intervalElapsed &&
      !changedSinceLastSend &&
      !inputState.attack &&
      !inputState.wave &&
      !inputState.numb &&
      !inputState.pull &&
      !inputState.dash &&
      !inputState.fireball &&
      !inputState.grenade &&
      !inputState.landmine
    ) {
      return;
    }

    const dtWindowMs = Math.max(1, this.inputSendAccumulatorMs);
    this.inputSendAccumulatorMs = 0;

    const input: InputMessage = createInputMessage(this.nextInputSeq++, inputState);

    this.pendingInputs.push({
      input,
      dtMs: dtWindowMs,
      sentAtMs: this.scene.time.now,
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
      wave: false,
      numb: false,
      pull: false,
      dash: false,
      fireball: false,
      grenade: false,
      landmine: false,
    };
    this.connection.send(input);
  }

  private bindKeys(): void {
    this.cursors = this.scene.input.keyboard!.createCursorKeys();
    this.waveKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R, false);
    this.numbKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.T, false);
    this.pullKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Y, false);
    this.attackKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
    this.fireballKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E, false);
    this.grenadeKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q, false);
    this.landmineKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W, false);
  }

  private consumeDashDirectionTap(
    nowMs: number,
    directions: Pick<InputState, 'up' | 'down' | 'left' | 'right'>,
    enabled: boolean
  ): Direction | null {
    let dashDirection: Direction | null = null;

    const registerTap = (direction: Direction, isDown: boolean, wasDown: boolean): void => {
      if (!isDown || wasDown) {
        return;
      }

      const lastTapAtMs = this.lastDirectionalTapAtMs[direction];
      this.lastDirectionalTapAtMs[direction] = nowMs;
      if (
        enabled &&
        dashDirection === null &&
        lastTapAtMs > 0 &&
        nowMs - lastTapAtMs <= PLAYER_DASH_DOUBLE_TAP_WINDOW
      ) {
        dashDirection = direction;
      }
    };

    registerTap('up', directions.up, this.prevUpDown);
    registerTap('down', directions.down, this.prevDownDown);
    registerTap('left', directions.left, this.prevLeftDown);
    registerTap('right', directions.right, this.prevRightDown);

    this.prevUpDown = directions.up;
    this.prevDownDown = directions.down;
    this.prevLeftDown = directions.left;
    this.prevRightDown = directions.right;

    return dashDirection;
  }

  private resetDirectionalTapState(): void {
    this.prevUpDown = false;
    this.prevDownDown = false;
    this.prevLeftDown = false;
    this.prevRightDown = false;
    this.lastDirectionalTapAtMs.up = 0;
    this.lastDirectionalTapAtMs.down = 0;
    this.lastDirectionalTapAtMs.left = 0;
    this.lastDirectionalTapAtMs.right = 0;
  }
}
