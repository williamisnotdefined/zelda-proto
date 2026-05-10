import type { InstanceId, SnapshotDeltaMessage, SnapshotMessage, WelcomeMessage } from '@/shared';
import Phaser from 'phaser';
import { gameConnection } from '../../network/gameConnection';
import { BossRuntime } from '../runtime/bosses/BossRuntime';
import { EnemyRuntime } from '../runtime/enemies/EnemyRuntime';
import { PlayerRuntime } from '../runtime/PlayerRuntime';
import { WorldNetworkSession } from '../runtime/WorldNetworkSession';
import { zustandGameUiSink } from '../runtime/ui/zustandGameUiSink';
import { StaticEntityRuntime } from '../runtime/world/StaticEntityRuntime';
import { WorldOverlayController } from '../runtime/world/WorldOverlayController';
import { FxController } from '../fx/FxController';
import { EnvironmentRenderer } from '../render/EnvironmentRenderer';

export class WorldScene extends Phaser.Scene {
  private currentInstanceId: InstanceId | null = null;
  private environmentRenderer!: EnvironmentRenderer;
  private fx!: FxController;
  private networkSession!: WorldNetworkSession;
  private playerRuntime!: PlayerRuntime;
  private enemyRuntime!: EnemyRuntime;
  private bossRuntime!: BossRuntime;
  private staticEntityRuntime!: StaticEntityRuntime;
  private overlayController!: WorldOverlayController;

  constructor() {
    super({ key: 'WorldScene' });
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);

    this.environmentRenderer = new EnvironmentRenderer(this);
    this.environmentRenderer.create(this.currentInstanceId);
    this.fx = new FxController(this);
    this.playerRuntime = new PlayerRuntime(this, zustandGameUiSink, this.fx, gameConnection);
    this.enemyRuntime = new EnemyRuntime(this, this.fx);
    this.bossRuntime = new BossRuntime(this, zustandGameUiSink, this.fx);
    this.staticEntityRuntime = new StaticEntityRuntime(this);
    this.overlayController = new WorldOverlayController(this, () =>
      this.networkSession.getNetworkStats()
    );
    this.networkSession = new WorldNetworkSession(gameConnection, zustandGameUiSink, {
      onWelcome: (message) => this.handleWelcome(message),
      onSnapshot: (message) => this.handleSnapshot(message),
      onSnapshotDelta: (message) => this.handleSnapshotDelta(message),
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);

    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.fx.startBackgroundMusic());
    } else {
      this.fx.startBackgroundMusic();
    }

    this.networkSession.start();
  }

  update(_time: number, delta: number): void {
    this.environmentRenderer.update(this.currentInstanceId);
    this.playerRuntime.update(delta, this.isTypingInInput(), this.currentInstanceId);

    const localEntity = this.playerRuntime.getLocalEntity();
    if (!localEntity) {
      return;
    }

    this.cameras.main.centerOn(localEntity.sprite.x, localEntity.sprite.y);

    const enemyVisualStats = this.enemyRuntime.update(
      delta,
      localEntity.sprite.x,
      localEntity.sprite.y
    );
    this.bossRuntime.update(delta);
    this.staticEntityRuntime.update(delta);
    this.overlayController.update({
      delta,
      currentInstanceId: this.currentInstanceId,
      localPlayerId: this.playerRuntime.getLocalPlayerId(),
      localEntity,
      playerEntities: this.playerRuntime.getEntities(),
      enemyRuntime: this.enemyRuntime,
      enemyVisualStats,
      bossEntities: this.bossRuntime.getEntities(),
      portalEntities: this.staticEntityRuntime.getPortalEntities(),
      dropCount: this.staticEntityRuntime.getDropCount(),
      hazardCount: this.staticEntityRuntime.getHazardCount(),
    });
  }

  shutdown(): void {
    this.networkSession?.stop();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);

    this.playerRuntime?.reset();
    this.enemyRuntime?.reset();
    this.bossRuntime?.reset();
    this.staticEntityRuntime?.reset();
    this.overlayController?.destroy();

    this.currentInstanceId = null;
    this.fx?.destroy();
    this.environmentRenderer?.destroy();
  }

  private handleWelcome(message: WelcomeMessage): void {
    this.playerRuntime.handleWelcome(message.id);
  }

  private handleSnapshot(message: SnapshotMessage): void {
    if (this.currentInstanceId !== message.instanceId) {
      this.handleInstanceChanged(message.instanceId);
    }

    this.playerRuntime.syncPlayers(message.players, message.waveIndicators ?? []);
    this.enemyRuntime.syncSnapshots(message.enemies);
    this.bossRuntime.syncSnapshots(
      message.bosses,
      message.iceZones,
      message.aoeIndicators,
      message.waveIndicators ?? [],
      this.playerRuntime.getLocalWorldPosition()
    );
    this.staticEntityRuntime.syncDrops(message.drops);
    this.staticEntityRuntime.syncPortals(message.portals);
    this.staticEntityRuntime.syncHazards(message.hazards);
  }

  private handleSnapshotDelta(message: SnapshotDeltaMessage): void {
    if (message.full || this.currentInstanceId !== message.instanceId) {
      return;
    }

    this.playerRuntime.syncPlayerDelta(
      message.players,
      message.removedPlayerIds,
      message.waveIndicators ?? []
    );
    this.enemyRuntime.syncSnapshotDelta(
      message.enemies,
      message.enemyTransforms,
      message.enemyStates,
      message.removedEnemyIds
    );
    this.bossRuntime.syncSnapshotDelta(
      message.bosses,
      message.removedBossIds,
      message.iceZones,
      message.aoeIndicators,
      message.waveIndicators ?? [],
      this.playerRuntime.getLocalWorldPosition()
    );
    this.staticEntityRuntime.syncDropDelta(message.drops, message.removedDropIds);
    this.staticEntityRuntime.syncPortalDelta(message.portals, message.removedPortalIds);
    this.staticEntityRuntime.syncHazardDelta(message.hazards, message.removedHazardIds);
  }

  private handleInstanceChanged(nextInstanceId: InstanceId): void {
    this.currentInstanceId = nextInstanceId;
    this.environmentRenderer.applyInstanceVisualTheme(nextInstanceId);
    this.fx.destroySafeZone();
    this.playerRuntime.handleInstanceChanged(nextInstanceId);
    this.enemyRuntime.reset();
    this.bossRuntime.reset();
    this.staticEntityRuntime.reset();
    this.overlayController.reset();
  }

  private handleScaleResize(): void {
    this.enemyRuntime.handleScaleResize();
  }

  private isTypingInInput(): boolean {
    const active = document.activeElement as HTMLElement | null;
    if (!active) {
      return false;
    }

    if (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT'
    ) {
      return true;
    }

    return active.isContentEditable;
  }
}
