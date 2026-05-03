import type { BossWaveIndicator, PlayerSnapshot } from '@/shared';
import { WORLD_SPAWN_SAFE_ZONE_RADIUS } from '@/shared/constants';
import Phaser from 'phaser';
import { PlayerEntity } from '../../entities/Player';
import type { GameConnection } from '../../network/gameConnection';
import { FxController } from '../fx/FxController';
import { LocalInputController } from './LocalInputController';
import type { GameUiSink } from './ui/GameUiSink';

export class PlayerRuntime {
  private localPlayerId: string | null = null;
  private previousLocalState: string | null = null;
  private readonly playerEntities = new Map<string, PlayerEntity>();
  private pendingSafeZoneForLocalPlayer = false;
  private readonly inputController: LocalInputController;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ui: GameUiSink,
    private readonly fx: FxController,
    connection: GameConnection
  ) {
    this.inputController = new LocalInputController(
      scene,
      connection,
      (time) => {
        this.ui.setWaveCooldownEndsAt(time);
      },
      (time) => {
        this.ui.setDashCooldownEndsAt(time);
      },
      (time) => {
        this.ui.setFireballCooldownEndsAt(time);
      }
    );
  }

  handleWelcome(localPlayerId: string): void {
    this.localPlayerId = localPlayerId;
    this.pendingSafeZoneForLocalPlayer = true;
    this.previousLocalState = null;
    this.fx.resetLocalToastyCounter();
    this.inputController.handleWelcome();
  }

  syncPlayers(players: PlayerSnapshot[], waveIndicators: BossWaveIndicator[]): void {
    const waveByOwner = new Map<string, BossWaveIndicator>();
    for (const wave of waveIndicators) {
      if (wave.ownerId) {
        waveByOwner.set(wave.ownerId, wave);
      }
    }

    const seenPlayerIds = new Set<string>();
    for (const player of players) {
      seenPlayerIds.add(player.id);
      this.upsertPlayerEntity(player, waveByOwner.get(player.id) ?? null);
    }

    for (const [id] of this.playerEntities) {
      if (!seenPlayerIds.has(id)) {
        this.removePlayerEntity(id);
      }
    }
  }

  update(delta: number, isTypingInInput: boolean): void {
    const localEntity = this.getLocalEntity();
    const uiBlocked = this.ui.isNicknameModalOpen() || isTypingInInput;
    this.inputController.update(delta, localEntity, uiBlocked);

    for (const entity of this.playerEntities.values()) {
      entity.update(delta);
    }
  }

  handleInstanceChanged(): void {
    for (const entity of this.playerEntities.values()) {
      entity.destroy();
    }
    this.playerEntities.clear();
    this.previousLocalState = null;
    this.pendingSafeZoneForLocalPlayer = true;
    this.fx.resetLocalToastyCounter();
    this.inputController.reset();
    this.ui.setLocalPlayer(null);
  }

  reset(): void {
    for (const entity of this.playerEntities.values()) {
      entity.destroy();
    }
    this.playerEntities.clear();
    this.localPlayerId = null;
    this.previousLocalState = null;
    this.pendingSafeZoneForLocalPlayer = false;
    this.fx.resetLocalToastyCounter();
    this.inputController.reset();
    this.ui.setLocalPlayer(null);
  }

  getEntities(): ReadonlyMap<string, PlayerEntity> {
    return this.playerEntities;
  }

  getLocalEntity(): PlayerEntity | null {
    if (!this.localPlayerId) {
      return null;
    }

    return this.playerEntities.get(this.localPlayerId) ?? null;
  }

  getLocalPlayerId(): string | null {
    return this.localPlayerId;
  }

  getLocalWorldPosition(): { x: number; y: number } | null {
    const localEntity = this.getLocalEntity();
    if (!localEntity) {
      return null;
    }

    return {
      x: localEntity.targetX,
      y: localEntity.targetY,
    };
  }

  private upsertPlayerEntity(
    player: PlayerSnapshot,
    waveIndicator: BossWaveIndicator | null
  ): void {
    let entity = this.playerEntities.get(player.id);
    if (!entity) {
      entity = new PlayerEntity(
        this.scene,
        player.x,
        player.y,
        player.id === this.localPlayerId,
        player.nickname
      );
      this.playerEntities.set(player.id, entity);
    }

    entity.setNickname(player.nickname);

    if (player.id === this.localPlayerId) {
      if (this.pendingSafeZoneForLocalPlayer) {
        this.fx.createSafeZoneAt(player.x, player.y, WORLD_SPAWN_SAFE_ZONE_RADIUS);
        this.pendingSafeZoneForLocalPlayer = false;
      }

      this.inputController.reconcileLocalPlayer(player, entity);
      this.fx.handleLocalToastyCounter(player.toastyCount);
      if (this.previousLocalState === 'dead' && player.state !== 'dead') {
        this.fx.createSafeZoneAt(player.x, player.y, WORLD_SPAWN_SAFE_ZONE_RADIUS);
      }
      this.previousLocalState = player.state;

      this.ui.setLocalPlayer({
        id: player.id,
        nickname: player.nickname,
        x: player.x,
        y: player.y,
        hp: player.hp,
        maxHp: player.maxHp,
        state: player.state,
        direction: player.direction,
      });
      entity.syncWaveIndicator(waveIndicator);
      return;
    }

    entity.updateFromServer(
      player.x,
      player.y,
      player.hp,
      player.maxHp,
      player.state,
      player.direction,
      player.statusEffects
    );
    entity.syncWaveIndicator(waveIndicator);
  }

  private removePlayerEntity(id: string): void {
    const entity = this.playerEntities.get(id);
    if (entity) {
      entity.destroy();
      this.playerEntities.delete(id);
    }

    if (this.localPlayerId !== id) {
      return;
    }

    this.localPlayerId = null;
    this.pendingSafeZoneForLocalPlayer = false;
    this.previousLocalState = null;
    this.fx.resetLocalToastyCounter();
    this.inputController.reset();
    this.ui.setLocalPlayer(null);
  }
}
