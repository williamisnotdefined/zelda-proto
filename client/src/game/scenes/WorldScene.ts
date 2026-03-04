import type {
  AoeIndicator,
  BossSnapshot,
  DropSnapshot,
  EnemySnapshot,
  HazardSnapshot,
  InstanceId,
  InputMessage,
  IceZone,
  PortalSnapshot,
  PlayerSnapshot,
  ServerChatMessage,
  ServerMessage,
} from '@gelehka/shared';
import {
  BOSS_KINDS,
  CLIENT_MESSAGE_TYPES,
  ENEMY_KINDS,
  PROTOCOL_VERSION,
  SERVER_MESSAGE_TYPES,
} from '@gelehka/shared';
import { WORLD_SPAWN_SAFE_ZONE_RADIUS } from '@gelehka/shared/constants';
import Phaser from 'phaser';
import { BlobEntity } from '../../entities/Blob';
import { BossDragonLordEntity } from '../../entities/BossDragonLord';
import { BossGelehkEntity } from '../../entities/BossGelehk';
import { BossPhase3Entity } from '../../entities/BossPhase3';
import { DropEntity } from '../../entities/DropEntity';
import { FireFieldHazardEntity } from '../../entities/FireFieldHazardEntity';
import { HandEntity } from '../../entities/Hand';
import { PlayerEntity } from '../../entities/Player';
import { PortalEntity } from '../../entities/PortalEntity';
import { SlimeEntity } from '../../entities/Slime';
import { onError, onMessage, send } from '../../network/socket';
import { useGameStore } from '../../ui/store';
import { PredictionController } from '../controllers/PredictionController';
import type { InputState, PendingInput } from '../controllers/PredictionController';
import { FxController } from '../fx/FxController';
import { Minimap } from '../Minimap';
import { EnvironmentRenderer } from '../render/EnvironmentRenderer';

const INPUT_SEND_INTERVAL_MS = 33;
const MAX_PENDING_INPUTS = 128;
const ENTITY_CULL_MARGIN_PX = 220;
const PICKUP_ENTITY_CULL_MARGIN_PX = 160;
const STATIC_ENTITY_CULL_MARGIN_PX = 260;
const MINIMAP_UPDATE_INTERVAL_MS = 100;
const ANIM_LOD_NEAR_DISTANCE_PX = 420;
const ANIM_LOD_MID_DISTANCE_PX = 860;
const ANIM_LOD_NEAR_TIME_SCALE = 1;
const ANIM_LOD_MID_TIME_SCALE = 0.75;
const ANIM_LOD_FAR_TIME_SCALE = 0.5;

type BossEntity = BossGelehkEntity | BossDragonLordEntity | BossPhase3Entity;
type Destroyable = { destroy: () => void };
type PositionSyncEntity = Destroyable & { updatePosition: (x: number, y: number) => void };

export class WorldScene extends Phaser.Scene {
  private localPlayerId: string | null = null;
  private previousLocalState: string | null = null;
  private playerEntities: Map<string, PlayerEntity> = new Map();
  private blobEntities: Map<string, BlobEntity> = new Map();
  private slimeEntities: Map<string, SlimeEntity> = new Map();
  private handEntities: Map<string, HandEntity> = new Map();
  private bossEntities: Map<string, BossEntity> = new Map();
  private dropEntities: Map<string, DropEntity> = new Map();
  private portalEntities: Map<string, PortalEntity> = new Map();
  private hazardEntities: Map<string, FireFieldHazardEntity> = new Map();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private prevAttack = false;

  private removeMessageHandler: (() => void) | null = null;
  private removeErrorHandler: (() => void) | null = null;

  private nextInputSeq = 0;
  private pendingInputs: PendingInput[] = [];
  private inputSendAccumulatorMs = 0;
  private lastSentInputState: InputState | null = null;

  private minimap!: Minimap;
  private minimapAccumulatorMs = 0;
  private currentInstanceId: InstanceId | null = null;
  private pendingSafeZoneForLocalPlayer = false;

  private readonly predictionController = new PredictionController();
  private environmentRenderer!: EnvironmentRenderer;
  private fx!: FxController;

  constructor() {
    super({ key: 'WorldScene' });
  }

  create(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W, false);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A, false);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S, false);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D, false);
    this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);

    this.environmentRenderer = new EnvironmentRenderer(this);
    this.environmentRenderer.create(this.currentInstanceId);
    this.fx = new FxController(this);
    this.minimap = new Minimap(this);

    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.fx.startBackgroundMusic());
    } else {
      this.fx.startBackgroundMusic();
    }

    useGameStore.getState().setLastConnectionAttempt(Date.now());

    this.removeMessageHandler = onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case SERVER_MESSAGE_TYPES.WELCOME:
          this.localPlayerId = msg.id;
          this.nextInputSeq = 0;
          this.pendingInputs = [];
          this.inputSendAccumulatorMs = 0;
          this.lastSentInputState = null;
          this.fx.resetLocalToastyCounter();
          this.pendingSafeZoneForLocalPlayer = true;
          break;
        case SERVER_MESSAGE_TYPES.SNAPSHOT:
          this.handleSnapshot(msg);
          break;
        case SERVER_MESSAGE_TYPES.LEADERBOARD:
          useGameStore.getState().setAllPlayers(msg.players);
          useGameStore.getState().setPlayerCount(msg.players.length);
          break;
        case SERVER_MESSAGE_TYPES.CHAT:
          useGameStore.getState().addChatMessage(msg as ServerChatMessage);
          break;
      }
    });

    this.removeErrorHandler = onError((error) => {
      useGameStore.getState().setConnectionError(error);
    });
  }

  private handleSnapshot(msg: {
    instanceId: InstanceId;
    players: PlayerSnapshot[];
    enemies: EnemySnapshot[];
    bosses: BossSnapshot[];
    drops: DropSnapshot[];
    portals: PortalSnapshot[];
    hazards: HazardSnapshot[];
    iceZones: IceZone[];
    aoeIndicators: AoeIndicator[];
  }): void {
    if (this.currentInstanceId !== msg.instanceId) {
      this.handleInstanceChanged(msg.instanceId);
    }

    this.syncPlayers(msg.players);
    this.syncBlobs(msg.enemies || []);
    this.syncBosses(msg.players, msg.bosses || [], msg.iceZones || [], msg.aoeIndicators || []);
    this.syncDrops(msg.drops || []);
    this.syncPortals(msg.portals || []);
    this.syncHazards(msg.hazards || []);
  }

  private handleInstanceChanged(nextInstanceId: InstanceId): void {
    this.currentInstanceId = nextInstanceId;
    this.environmentRenderer.applyInstanceVisualTheme(nextInstanceId);
    this.pendingSafeZoneForLocalPlayer = true;
    this.fx.destroySafeZone();
    this.pendingInputs = [];
    this.inputSendAccumulatorMs = 0;
    this.lastSentInputState = null;
    this.minimapAccumulatorMs = 0;
    this.fx.resetLocalToastyCounter();

    this.destroyEntityMap(this.playerEntities);
    this.destroyEntityMap(this.blobEntities);
    this.destroyEntityMap(this.slimeEntities);
    this.destroyEntityMap(this.handEntities);
    this.destroyEntityMap(this.bossEntities);
    this.destroyEntityMap(this.dropEntities);
    this.destroyEntityMap(this.portalEntities);
    this.destroyEntityMap(this.hazardEntities);

    useGameStore.getState().setLocalPlayer(null);
    useGameStore.getState().setBoss(null);
  }

  private syncPlayers(players: PlayerSnapshot[]): void {
    const seenPlayerIds = new Set<string>();
    for (const p of players) {
      seenPlayerIds.add(p.id);
      let entity = this.playerEntities.get(p.id);
      if (!entity) {
        entity = new PlayerEntity(this, p.x, p.y, p.id === this.localPlayerId, p.nickname);
        this.playerEntities.set(p.id, entity);
      }

      if (p.id === this.localPlayerId) {
        if (this.pendingSafeZoneForLocalPlayer) {
          this.fx.createSafeZoneAt(p.x, p.y, WORLD_SPAWN_SAFE_ZONE_RADIUS);
          this.pendingSafeZoneForLocalPlayer = false;
        }

        this.pendingInputs = this.predictionController.reconcileLocalPrediction(
          this.time.now,
          p,
          entity,
          this.pendingInputs,
          () => {
            this.inputSendAccumulatorMs = 0;
          }
        );
        this.fx.handleLocalToastyCounter(p.toastyCount);
        if (this.previousLocalState === 'dead' && p.state !== 'dead') {
          this.fx.createSafeZoneAt(p.x, p.y, WORLD_SPAWN_SAFE_ZONE_RADIUS);
        }
        this.previousLocalState = p.state;

        useGameStore.getState().setLocalPlayer({
          id: p.id,
          nickname: p.nickname,
          x: p.x,
          y: p.y,
          hp: p.hp,
          maxHp: p.maxHp,
          state: p.state,
          direction: p.direction,
        });
      } else {
        entity.updateFromServer(p.x, p.y, p.hp, p.maxHp, p.state, p.direction, p.statusEffects);
      }
    }

    for (const [id, entity] of this.playerEntities) {
      if (!seenPlayerIds.has(id)) {
        entity.destroy();
        this.playerEntities.delete(id);
      }
    }

    if (this.localPlayerId && !seenPlayerIds.has(this.localPlayerId)) {
      this.pendingInputs = [];
      this.inputSendAccumulatorMs = 0;
      this.lastSentInputState = null;
      this.pendingSafeZoneForLocalPlayer = false;
      this.fx.resetLocalToastyCounter();
      useGameStore.getState().setLocalPlayer(null);
    }
  }

  private syncBlobs(enemies: EnemySnapshot[]): void {
    const seenBlobIds = new Set<string>();
    const seenSlimeIds = new Set<string>();
    const seenHandIds = new Set<string>();
    for (const b of enemies) {
      if (b.kind === ENEMY_KINDS.BLOB) {
        seenBlobIds.add(b.id);
        let entity = this.blobEntities.get(b.id);
        if (!entity) {
          entity = new BlobEntity(this, b.x, b.y);
          this.blobEntities.set(b.id, entity);
        }
        entity.updateFromServer(b.x, b.y, b.hp, b.maxHp, b.state);
        continue;
      }

      if (b.kind === ENEMY_KINDS.SLIME) {
        seenSlimeIds.add(b.id);
        let entity = this.slimeEntities.get(b.id);
        if (!entity) {
          entity = new SlimeEntity(this, b.x, b.y);
          this.slimeEntities.set(b.id, entity);
        }
        entity.updateFromServer(b.x, b.y, b.hp, b.maxHp, b.state);
        continue;
      }

      if (b.kind === ENEMY_KINDS.HAND) {
        seenHandIds.add(b.id);
        let entity = this.handEntities.get(b.id);
        if (!entity) {
          entity = new HandEntity(this, b.x, b.y);
          this.handEntities.set(b.id, entity);
        }
        entity.updateFromServer(b.x, b.y, b.hp, b.maxHp, b.state);
      }
    }

    for (const [id, entity] of this.blobEntities) {
      if (!seenBlobIds.has(id)) {
        entity.destroy();
        this.blobEntities.delete(id);
      }
    }

    for (const [id, entity] of this.slimeEntities) {
      if (!seenSlimeIds.has(id)) {
        entity.destroy();
        this.slimeEntities.delete(id);
      }
    }

    for (const [id, entity] of this.handEntities) {
      if (!seenHandIds.has(id)) {
        entity.destroy();
        this.handEntities.delete(id);
      }
    }
  }

  private syncBosses(
    players: PlayerSnapshot[],
    bosses: BossSnapshot[],
    iceZones: IceZone[],
    aoeIndicators: AoeIndicator[]
  ): void {
    const seenBossIds = new Set<string>();
    let nearestBoss: BossSnapshot | null = null;
    let nearestBossDist = Infinity;
    const localPlayer = this.localPlayerId
      ? players.find((p) => p.id === this.localPlayerId)
      : null;

    for (const b of bosses) {
      seenBossIds.add(b.id);
      let entity = this.bossEntities.get(b.id);
      if (!entity) {
        if (b.kind === BOSS_KINDS.GELEHK) {
          entity = new BossGelehkEntity(this, b.x, b.y);
        } else if (b.kind === BOSS_KINDS.DRAGON_LORD) {
          entity = new BossDragonLordEntity(this, b.x, b.y);
        } else {
          const visual = this.getPhase3BossVisual(b.kind);
          entity = new BossPhase3Entity(
            this,
            b.x,
            b.y,
            visual.textureKey,
            visual.animPrefix,
            visual.label
          );
        }
        this.bossEntities.set(b.id, entity);
      }
      if (entity instanceof BossGelehkEntity) {
        entity.updateFromServer(b.x, b.y, b.hp, b.maxHp, b.state, b.phase, iceZones, aoeIndicators);
      } else {
        entity.updateFromServer(b.x, b.y, b.hp, b.maxHp, b.state, b.phase);
      }

      if (localPlayer) {
        const dx = localPlayer.x - b.x;
        const dy = localPlayer.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < nearestBossDist) {
          nearestBossDist = distSq;
          nearestBoss = b;
        }
      }
    }

    for (const [id, entity] of this.bossEntities) {
      if (!seenBossIds.has(id)) {
        entity.destroy();
        this.bossEntities.delete(id);
      }
    }

    if (nearestBoss && nearestBoss.state !== 'dead') {
      useGameStore.getState().setBoss({
        id: nearestBoss.id,
        kind: nearestBoss.kind,
        x: nearestBoss.x,
        y: nearestBoss.y,
        hp: nearestBoss.hp,
        maxHp: nearestBoss.maxHp,
        state: nearestBoss.state,
        phase: nearestBoss.phase,
      });
    } else {
      useGameStore.getState().setBoss(null);
    }
  }

  private syncDrops(drops: DropSnapshot[]): void {
    this.syncPositionEntities(
      drops,
      this.dropEntities,
      (drop) => new DropEntity(this, drop.x, drop.y, drop.kind)
    );
  }

  private syncPortals(portals: PortalSnapshot[]): void {
    this.syncPositionEntities(
      portals,
      this.portalEntities,
      (portal) => new PortalEntity(this, portal.x, portal.y)
    );
  }

  private syncHazards(hazards: HazardSnapshot[]): void {
    this.syncPositionEntities(
      hazards,
      this.hazardEntities,
      (hazard) => new FireFieldHazardEntity(this, hazard.x, hazard.y)
    );
  }

  update(_time: number, delta: number): void {
    this.predictionController.trimPendingInputs(this.pendingInputs);
    this.environmentRenderer.update(this.currentInstanceId);

    if (!this.localPlayerId) return;

    const localEntity = this.playerEntities.get(this.localPlayerId) ?? null;
    const localDead = localEntity?.serverState === 'dead';
    const uiBlocked = useGameStore.getState().showNicknameModal || this.isTypingInInput();

    const attack = this.attackKey.isDown && !this.prevAttack;
    this.prevAttack = this.attackKey.isDown;

    const upPressed = this.cursors.up.isDown || this.keyW.isDown;
    const downPressed = this.cursors.down.isDown || this.keyS.isDown;
    const leftPressed = this.cursors.left.isDown || this.keyA.isDown;
    const rightPressed = this.cursors.right.isDown || this.keyD.isDown;

    const inputState: InputState = {
      up: !uiBlocked && !localDead && upPressed,
      down: !uiBlocked && !localDead && downPressed,
      left: !uiBlocked && !localDead && leftPressed,
      right: !uiBlocked && !localDead && rightPressed,
      attack: !uiBlocked && !localDead && attack,
    };

    this.predictionController.applyLocalPrediction(inputState, delta, localEntity);

    this.inputSendAccumulatorMs += delta;
    const intervalElapsed = this.inputSendAccumulatorMs >= INPUT_SEND_INTERVAL_MS;
    const changedSinceLastSend =
      !this.lastSentInputState ||
      this.lastSentInputState.up !== inputState.up ||
      this.lastSentInputState.down !== inputState.down ||
      this.lastSentInputState.left !== inputState.left ||
      this.lastSentInputState.right !== inputState.right;

    if (intervalElapsed || changedSinceLastSend || inputState.attack) {
      const dtWindowMs = Math.max(1, this.inputSendAccumulatorMs);
      this.inputSendAccumulatorMs = 0;

      const input: InputMessage = {
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.INPUT,
        seq: this.nextInputSeq++,
        up: inputState.up,
        down: inputState.down,
        left: inputState.left,
        right: inputState.right,
        attack: inputState.attack,
      };

      this.pendingInputs.push({ input, dtMs: dtWindowMs, sentAtMs: this.time.now });
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
      send(input);
    }

    for (const entity of this.playerEntities.values()) {
      entity.update(this, delta);
    }

    const expandedView = new Phaser.Geom.Rectangle(
      this.cameras.main.worldView.x - ENTITY_CULL_MARGIN_PX,
      this.cameras.main.worldView.y - ENTITY_CULL_MARGIN_PX,
      this.cameras.main.worldView.width + ENTITY_CULL_MARGIN_PX * 2,
      this.cameras.main.worldView.height + ENTITY_CULL_MARGIN_PX * 2
    );

    const pickupView = new Phaser.Geom.Rectangle(
      this.cameras.main.worldView.x - PICKUP_ENTITY_CULL_MARGIN_PX,
      this.cameras.main.worldView.y - PICKUP_ENTITY_CULL_MARGIN_PX,
      this.cameras.main.worldView.width + PICKUP_ENTITY_CULL_MARGIN_PX * 2,
      this.cameras.main.worldView.height + PICKUP_ENTITY_CULL_MARGIN_PX * 2
    );

    const staticEntityView = new Phaser.Geom.Rectangle(
      this.cameras.main.worldView.x - STATIC_ENTITY_CULL_MARGIN_PX,
      this.cameras.main.worldView.y - STATIC_ENTITY_CULL_MARGIN_PX,
      this.cameras.main.worldView.width + STATIC_ENTITY_CULL_MARGIN_PX * 2,
      this.cameras.main.worldView.height + STATIC_ENTITY_CULL_MARGIN_PX * 2
    );

    const localX = localEntity?.sprite.x ?? this.cameras.main.midPoint.x;
    const localY = localEntity?.sprite.y ?? this.cameras.main.midPoint.y;

    for (const entity of this.blobEntities.values()) {
      const inView = this.isEntityInView(expandedView, entity.sprite.x, entity.sprite.y);
      const animTimeScale = this.getAnimationLodTimeScale(
        localX,
        localY,
        entity.sprite.x,
        entity.sprite.y
      );
      entity.update(delta, inView, animTimeScale);
    }

    for (const entity of this.slimeEntities.values()) {
      const inView = this.isEntityInView(expandedView, entity.x, entity.y);
      const animTimeScale = this.getAnimationLodTimeScale(localX, localY, entity.x, entity.y);
      entity.update(delta, inView, animTimeScale);
    }

    for (const entity of this.handEntities.values()) {
      const inView = this.isEntityInView(expandedView, entity.x, entity.y);
      const animTimeScale = this.getAnimationLodTimeScale(localX, localY, entity.x, entity.y);
      entity.update(delta, inView, animTimeScale);
    }

    for (const entity of this.bossEntities.values()) {
      entity.update(delta);
    }

    for (const entity of this.dropEntities.values()) {
      entity.update(delta, this.isEntityInView(pickupView, entity.sprite.x, entity.sprite.y));
    }

    for (const entity of this.portalEntities.values()) {
      entity.update(delta, this.isEntityInView(staticEntityView, entity.x, entity.y));
    }

    for (const entity of this.hazardEntities.values()) {
      entity.update(delta, this.isEntityInView(staticEntityView, entity.x, entity.y));
    }

    if (localEntity) {
      this.cameras.main.centerOn(localEntity.sprite.x, localEntity.sprite.y);
      this.minimapAccumulatorMs += delta;
      if (this.minimapAccumulatorMs >= MINIMAP_UPDATE_INTERVAL_MS) {
        this.minimapAccumulatorMs = 0;
        this.minimap.draw(
          localEntity.sprite.x,
          localEntity.sprite.y,
          this.playerEntities,
          this.blobEntities,
          this.slimeEntities,
          this.handEntities,
          this.bossEntities,
          this.localPlayerId
        );
      }
    }
  }

  shutdown(): void {
    this.removeMessageHandler?.();
    this.removeErrorHandler?.();
    this.minimap?.destroy();

    this.pendingInputs = [];
    this.inputSendAccumulatorMs = 0;
    this.lastSentInputState = null;
    this.currentInstanceId = null;
    this.pendingSafeZoneForLocalPlayer = false;
    this.minimapAccumulatorMs = 0;

    this.destroyEntityMap(this.playerEntities);
    this.destroyEntityMap(this.blobEntities);
    this.destroyEntityMap(this.slimeEntities);
    this.destroyEntityMap(this.handEntities);
    this.destroyEntityMap(this.bossEntities);
    this.destroyEntityMap(this.dropEntities);
    this.destroyEntityMap(this.portalEntities);
    this.destroyEntityMap(this.hazardEntities);

    this.fx?.destroy();
    this.environmentRenderer?.destroy();
  }

  private isEntityInView(view: Phaser.Geom.Rectangle, x: number, y: number): boolean {
    return x >= view.left && x <= view.right && y >= view.top && y <= view.bottom;
  }

  private getAnimationLodTimeScale(
    originX: number,
    originY: number,
    targetX: number,
    targetY: number
  ): number {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const distSq = dx * dx + dy * dy;

    if (distSq <= ANIM_LOD_NEAR_DISTANCE_PX * ANIM_LOD_NEAR_DISTANCE_PX) {
      return ANIM_LOD_NEAR_TIME_SCALE;
    }

    if (distSq <= ANIM_LOD_MID_DISTANCE_PX * ANIM_LOD_MID_DISTANCE_PX) {
      return ANIM_LOD_MID_TIME_SCALE;
    }

    return ANIM_LOD_FAR_TIME_SCALE;
  }

  private destroyEntityMap<T extends Destroyable>(entities: Map<string, T>): void {
    for (const entity of entities.values()) {
      entity.destroy();
    }
    entities.clear();
  }

  private syncPositionEntities<
    T extends { id: string; x: number; y: number },
    TEntity extends PositionSyncEntity,
  >(snapshots: T[], entities: Map<string, TEntity>, createEntity: (snapshot: T) => TEntity): void {
    const seenIds = new Set<string>();

    for (const snapshot of snapshots) {
      seenIds.add(snapshot.id);
      let entity = entities.get(snapshot.id);
      if (!entity) {
        entity = createEntity(snapshot);
        entities.set(snapshot.id, entity);
      }
      entity.updatePosition(snapshot.x, snapshot.y);
    }

    for (const [id, entity] of entities) {
      if (seenIds.has(id)) continue;
      entity.destroy();
      entities.delete(id);
    }
  }

  private isTypingInInput(): boolean {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return false;
    if (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT'
    ) {
      return true;
    }
    return active.isContentEditable;
  }

  private getPhase3BossVisual(kind: BossSnapshot['kind']): {
    textureKey: string;
    animPrefix: string;
    label: string;
  } {
    if (kind === BOSS_KINDS.SILVERBACK_WAINER) {
      return {
        textureKey: 'silverback_wainer',
        animPrefix: 'silverback_wainer',
        label: 'SILVERBACK WAINER',
      };
    }
    if (kind === BOSS_KINDS.SLIM_MAIOLI) {
      return {
        textureKey: 'slim_maioli',
        animPrefix: 'slim_maioli',
        label: 'SLIM MAIOLI',
      };
    }
    return {
      textureKey: 'frankly_stein',
      animPrefix: 'frankly_stein',
      label: 'FRANKLY STEIN',
    };
  }
}
