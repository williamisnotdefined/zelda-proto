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
  SnapshotDeltaMessage,
} from '@gelehka/shared';
import { createInputMessage, hasDirectionalChange } from '@gelehka/game-core';
import {
  BOSS_KINDS,
  ENEMY_KINDS,
  HAZARD_KINDS,
  INSTANCE_IDS,
  PACMAN_GHOST_VARIANTS,
  SERVER_MESSAGE_TYPES,
} from '@gelehka/shared';
import { WORLD_SPAWN_SAFE_ZONE_RADIUS } from '@gelehka/shared/constants';
import Phaser from 'phaser';
import { BlobEntity } from '../../entities/Blob';
import { BossDragonLordEntity } from '../../entities/BossDragonLord';
import { BossGelehkEntity } from '../../entities/BossGelehk';
import { BossPhase3Entity } from '../../entities/BossPhase3';
import { BlueFlameHazardEntity } from '../../entities/BlueFlameHazardEntity';
import { DropEntity } from '../../entities/DropEntity';
import { FireFieldHazardEntity } from '../../entities/FireFieldHazardEntity';
import { HandEntity } from '../../entities/Hand';
import { PacmanGhostEntity } from '../../entities/PacmanGhost';
import { PlayerEntity } from '../../entities/Player';
import { PortalEntity } from '../../entities/PortalEntity';
import { PurpleFieldHazardEntity } from '../../entities/PurpleFieldHazardEntity';
import { SlimeEntity } from '../../entities/Slime';
import { onError, onMessage, send } from '../../network/socket';
import { useTouchInputStore } from '../input/touchInputStore';
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
const PHASE4_MINIMAP_UPDATE_INTERVAL_MS = 200;
const ANIM_LOD_NEAR_DISTANCE_PX = 420;
const ANIM_LOD_MID_DISTANCE_PX = 860;
const ANIM_LOD_NEAR_TIME_SCALE = 1;
const ANIM_LOD_MID_TIME_SCALE = 0.75;
const ANIM_LOD_FAR_TIME_SCALE = 0.5;
const PACMAN_GHOST_HUD_DISTANCE_PX = 520;

type BossEntity = BossGelehkEntity | BossDragonLordEntity | BossPhase3Entity;
type HazardEntity = FireFieldHazardEntity | PurpleFieldHazardEntity | BlueFlameHazardEntity;
type Destroyable = { destroy: () => void };
type PositionSyncEntity = Destroyable & { updatePosition: (x: number, y: number) => void };

export class WorldScene extends Phaser.Scene {
  private localPlayerId: string | null = null;
  private previousLocalState: string | null = null;
  private playerEntities: Map<string, PlayerEntity> = new Map();
  private blobEntities: Map<string, BlobEntity> = new Map();
  private slimeEntities: Map<string, SlimeEntity> = new Map();
  private handEntities: Map<string, HandEntity> = new Map();
  private pacmanGhostEntities: Map<string, PacmanGhostEntity> = new Map();
  private bossEntities: Map<string, BossEntity> = new Map();
  private dropEntities: Map<string, DropEntity> = new Map();
  private portalEntities: Map<string, PortalEntity> = new Map();
  private hazardEntities: Map<string, HazardEntity> = new Map();
  private enemyKindsById: Map<string, EnemySnapshot['kind']> = new Map();
  private bossSnapshotsById: Map<string, BossSnapshot> = new Map();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private prevAttackDown = false;

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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);

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
          this.prevAttackDown = false;
          this.fx.resetLocalToastyCounter();
          this.pendingSafeZoneForLocalPlayer = true;
          break;
        case SERVER_MESSAGE_TYPES.SNAPSHOT:
          this.handleSnapshot(msg);
          break;
        case SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA:
          if (msg.full) {
            this.handleSnapshot(msg);
          } else {
            this.handleSnapshotDelta(msg);
          }
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
    this.syncBosses(msg.bosses || [], msg.iceZones || [], msg.aoeIndicators || []);
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
    this.destroyEntityMap(this.pacmanGhostEntities);
    this.destroyEntityMap(this.bossEntities);
    this.destroyEntityMap(this.dropEntities);
    this.destroyEntityMap(this.portalEntities);
    this.destroyEntityMap(this.hazardEntities);
    this.enemyKindsById.clear();
    this.bossSnapshotsById.clear();

    useGameStore.getState().setLocalPlayer(null);
    useGameStore.getState().setBoss(null);
  }

  private handleSnapshotDelta(msg: SnapshotDeltaMessage): void {
    if (this.currentInstanceId !== msg.instanceId) {
      return;
    }

    this.applyPlayerDelta(msg.players, msg.removedPlayerIds || []);
    this.applyEnemyDelta(msg.enemies || [], msg.removedEnemyIds || []);
    this.applyBossDelta(
      msg.bosses || [],
      msg.removedBossIds || [],
      msg.iceZones || [],
      msg.aoeIndicators || []
    );
    this.applyDropDelta(msg.drops || [], msg.removedDropIds || []);
    this.applyPortalDelta(msg.portals || [], msg.removedPortalIds || []);
    this.applyHazardDelta(msg.hazards || [], msg.removedHazardIds || []);
  }

  private syncPlayers(players: PlayerSnapshot[]): void {
    const seenPlayerIds = new Set<string>();
    for (const p of players) {
      seenPlayerIds.add(p.id);
      this.upsertPlayerEntity(p);
    }

    for (const [id] of this.playerEntities) {
      if (!seenPlayerIds.has(id)) {
        this.removePlayerEntity(id);
      }
    }
  }

  private applyPlayerDelta(players: PlayerSnapshot[], removedPlayerIds: string[]): void {
    for (const player of players) {
      this.upsertPlayerEntity(player);
    }

    for (const playerId of removedPlayerIds) {
      this.removePlayerEntity(playerId);
    }
  }

  private upsertPlayerEntity(player: PlayerSnapshot): void {
    let entity = this.playerEntities.get(player.id);
    if (!entity) {
      entity = new PlayerEntity(
        this,
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

      this.pendingInputs = this.predictionController.reconcileLocalPrediction(
        this.time.now,
        player,
        entity,
        this.pendingInputs,
        () => {
          this.inputSendAccumulatorMs = 0;
        }
      );
      this.fx.handleLocalToastyCounter(player.toastyCount);
      if (this.previousLocalState === 'dead' && player.state !== 'dead') {
        this.fx.createSafeZoneAt(player.x, player.y, WORLD_SPAWN_SAFE_ZONE_RADIUS);
      }
      this.previousLocalState = player.state;

      useGameStore.getState().setLocalPlayer({
        id: player.id,
        nickname: player.nickname,
        x: player.x,
        y: player.y,
        hp: player.hp,
        maxHp: player.maxHp,
        state: player.state,
        direction: player.direction,
      });
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
  }

  private removePlayerEntity(id: string): void {
    const entity = this.playerEntities.get(id);
    if (entity) {
      entity.destroy();
      this.playerEntities.delete(id);
    }

    if (this.localPlayerId === id) {
      this.localPlayerId = null;
      this.pendingInputs = [];
      this.inputSendAccumulatorMs = 0;
      this.lastSentInputState = null;
      this.prevAttackDown = false;
      this.pendingSafeZoneForLocalPlayer = false;
      this.previousLocalState = null;
      this.fx.resetLocalToastyCounter();
      useGameStore.getState().setLocalPlayer(null);
    }
  }

  private syncBlobs(enemies: EnemySnapshot[]): void {
    const seenBlobIds = new Set<string>();
    const seenSlimeIds = new Set<string>();
    const seenHandIds = new Set<string>();
    const seenPacmanGhostIds = new Set<string>();
    for (const b of enemies) {
      if (b.kind === ENEMY_KINDS.BLOB) {
        seenBlobIds.add(b.id);
        this.upsertEnemyEntity(b);
        continue;
      }

      if (b.kind === ENEMY_KINDS.SLIME) {
        seenSlimeIds.add(b.id);
        this.upsertEnemyEntity(b);
        continue;
      }

      if (b.kind === ENEMY_KINDS.HAND) {
        seenHandIds.add(b.id);
        this.upsertEnemyEntity(b);
        continue;
      }

      if (b.kind === ENEMY_KINDS.PACMAN_GHOST) {
        seenPacmanGhostIds.add(b.id);
        this.upsertEnemyEntity(b);
      }
    }

    for (const [id] of this.blobEntities) {
      if (!seenBlobIds.has(id)) {
        this.removeEnemyEntity(id, ENEMY_KINDS.BLOB);
      }
    }

    for (const [id] of this.slimeEntities) {
      if (!seenSlimeIds.has(id)) {
        this.removeEnemyEntity(id, ENEMY_KINDS.SLIME);
      }
    }

    for (const [id] of this.handEntities) {
      if (!seenHandIds.has(id)) {
        this.removeEnemyEntity(id, ENEMY_KINDS.HAND);
      }
    }

    for (const [id] of this.pacmanGhostEntities) {
      if (!seenPacmanGhostIds.has(id)) {
        this.removeEnemyEntity(id, ENEMY_KINDS.PACMAN_GHOST);
      }
    }
  }

  private applyEnemyDelta(enemies: EnemySnapshot[], removedEnemyIds: string[]): void {
    for (const enemy of enemies) {
      this.upsertEnemyEntity(enemy);
    }

    for (const enemyId of removedEnemyIds) {
      this.removeEnemyEntity(enemyId);
    }
  }

  private upsertEnemyEntity(enemy: EnemySnapshot): void {
    const previousKind = this.enemyKindsById.get(enemy.id);
    if (previousKind && previousKind !== enemy.kind) {
      this.removeEnemyEntity(enemy.id, previousKind);
    }

    this.enemyKindsById.set(enemy.id, enemy.kind);

    if (enemy.kind === ENEMY_KINDS.BLOB) {
      let entity = this.blobEntities.get(enemy.id);
      if (!entity) {
        entity = new BlobEntity(this, enemy.x, enemy.y);
        this.blobEntities.set(enemy.id, entity);
      }
      entity.updateFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state);
      return;
    }

    if (enemy.kind === ENEMY_KINDS.SLIME) {
      let entity = this.slimeEntities.get(enemy.id);
      if (!entity) {
        entity = new SlimeEntity(this, enemy.x, enemy.y);
        this.slimeEntities.set(enemy.id, entity);
      }
      entity.updateFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state);
      return;
    }

    if (enemy.kind === ENEMY_KINDS.HAND) {
      let entity = this.handEntities.get(enemy.id);
      if (!entity) {
        entity = new HandEntity(this, enemy.x, enemy.y);
        this.handEntities.set(enemy.id, entity);
      }
      entity.updateFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state);
      return;
    }

    if (enemy.kind === ENEMY_KINDS.PACMAN_GHOST) {
      const variant = enemy.variant ?? PACMAN_GHOST_VARIANTS.RED;
      let entity = this.pacmanGhostEntities.get(enemy.id);
      if (entity && entity.variant !== variant) {
        entity.destroy();
        this.pacmanGhostEntities.delete(enemy.id);
        entity = undefined;
      }
      if (!entity) {
        entity = new PacmanGhostEntity(this, enemy.x, enemy.y, variant);
        this.pacmanGhostEntities.set(enemy.id, entity);
      }
      entity.updateFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state);
    }
  }

  private removeEnemyEntity(id: string, knownKind?: EnemySnapshot['kind']): void {
    const kind = knownKind ?? this.enemyKindsById.get(id);
    if (!kind) {
      return;
    }

    if (kind === ENEMY_KINDS.BLOB) {
      const entity = this.blobEntities.get(id);
      if (entity) {
        entity.destroy();
        this.blobEntities.delete(id);
      }
    } else if (kind === ENEMY_KINDS.SLIME) {
      const entity = this.slimeEntities.get(id);
      if (entity) {
        entity.destroy();
        this.slimeEntities.delete(id);
      }
    } else if (kind === ENEMY_KINDS.HAND) {
      const entity = this.handEntities.get(id);
      if (entity) {
        entity.destroy();
        this.handEntities.delete(id);
      }
    } else if (kind === ENEMY_KINDS.PACMAN_GHOST) {
      const entity = this.pacmanGhostEntities.get(id);
      if (entity) {
        entity.destroy();
        this.pacmanGhostEntities.delete(id);
      }
    }

    this.enemyKindsById.delete(id);
  }

  private syncBosses(
    bosses: BossSnapshot[],
    iceZones: IceZone[],
    aoeIndicators: AoeIndicator[]
  ): void {
    this.bossSnapshotsById.clear();
    for (const boss of bosses) {
      this.bossSnapshotsById.set(boss.id, boss);
    }

    this.renderBosses(iceZones, aoeIndicators);
  }

  private applyBossDelta(
    bosses: BossSnapshot[],
    removedBossIds: string[],
    iceZones: IceZone[],
    aoeIndicators: AoeIndicator[]
  ): void {
    for (const boss of bosses) {
      this.bossSnapshotsById.set(boss.id, boss);
    }

    for (const bossId of removedBossIds) {
      this.bossSnapshotsById.delete(bossId);
    }

    this.renderBosses(iceZones, aoeIndicators);
  }

  private renderBosses(iceZones: IceZone[], aoeIndicators: AoeIndicator[]): void {
    const seenBossIds = new Set<string>();
    let nearestBoss: BossSnapshot | null = null;
    let nearestBossDist = Infinity;
    const localPlayer = this.getLocalPlayerWorldPosition();

    for (const b of this.bossSnapshotsById.values()) {
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
        entity.updateFromServer(
          b.x,
          b.y,
          b.hp,
          b.maxHp,
          b.state,
          b.phase,
          iceZones,
          aoeIndicators.filter((aoe) => aoe.ownerId === b.id)
        );
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

  private getLocalPlayerWorldPosition(): { x: number; y: number } | null {
    if (!this.localPlayerId) {
      return null;
    }

    const localEntity = this.playerEntities.get(this.localPlayerId);
    if (!localEntity) {
      return null;
    }

    return {
      x: localEntity.targetX,
      y: localEntity.targetY,
    };
  }

  private syncDrops(drops: DropSnapshot[]): void {
    this.syncPositionEntities(
      drops,
      this.dropEntities,
      (drop) => new DropEntity(this, drop.x, drop.y, drop.kind)
    );
  }

  private applyDropDelta(drops: DropSnapshot[], removedDropIds: string[]): void {
    this.applyPositionEntitiesDelta(
      drops,
      removedDropIds,
      this.dropEntities,
      (drop) => new DropEntity(this, drop.x, drop.y, drop.kind)
    );
  }

  private syncPortals(portals: PortalSnapshot[]): void {
    const seenPortalIds = new Set<string>();
    for (const portal of portals) {
      seenPortalIds.add(portal.id);
      let entity = this.portalEntities.get(portal.id);
      if (!entity) {
        entity = new PortalEntity(this, portal.x, portal.y, portal.kind);
        this.portalEntities.set(portal.id, entity);
      }

      entity.updatePosition(portal.x, portal.y);
      entity.updateKind(portal.kind);
    }

    for (const [id, entity] of this.portalEntities) {
      if (seenPortalIds.has(id)) continue;
      entity.destroy();
      this.portalEntities.delete(id);
    }
  }

  private applyPortalDelta(portals: PortalSnapshot[], removedPortalIds: string[]): void {
    for (const portal of portals) {
      let entity = this.portalEntities.get(portal.id);
      if (!entity) {
        entity = new PortalEntity(this, portal.x, portal.y, portal.kind);
        this.portalEntities.set(portal.id, entity);
      }

      entity.updatePosition(portal.x, portal.y);
      entity.updateKind(portal.kind);
    }

    for (const portalId of removedPortalIds) {
      const entity = this.portalEntities.get(portalId);
      if (!entity) continue;
      entity.destroy();
      this.portalEntities.delete(portalId);
    }
  }

  private syncHazards(hazards: HazardSnapshot[]): void {
    const seenHazardIds = new Set<string>();

    for (const hazard of hazards) {
      seenHazardIds.add(hazard.id);
      let entity = this.hazardEntities.get(hazard.id);
      if (!entity) {
        if (hazard.kind === HAZARD_KINDS.PURPLE_FIELD) {
          entity = new PurpleFieldHazardEntity(this, hazard.x, hazard.y);
        } else if (hazard.kind === HAZARD_KINDS.BLUE_FLAME) {
          entity = new BlueFlameHazardEntity(this, hazard.x, hazard.y);
        } else {
          entity = new FireFieldHazardEntity(this, hazard.x, hazard.y);
        }
        this.hazardEntities.set(hazard.id, entity);
      }
      entity.updatePosition(hazard.x, hazard.y);
    }

    for (const [id, entity] of this.hazardEntities) {
      if (seenHazardIds.has(id)) continue;
      entity.destroy();
      this.hazardEntities.delete(id);
    }
  }

  private applyHazardDelta(hazards: HazardSnapshot[], removedHazardIds: string[]): void {
    for (const hazard of hazards) {
      let entity = this.hazardEntities.get(hazard.id);
      if (!entity) {
        if (hazard.kind === HAZARD_KINDS.PURPLE_FIELD) {
          entity = new PurpleFieldHazardEntity(this, hazard.x, hazard.y);
        } else if (hazard.kind === HAZARD_KINDS.BLUE_FLAME) {
          entity = new BlueFlameHazardEntity(this, hazard.x, hazard.y);
        } else {
          entity = new FireFieldHazardEntity(this, hazard.x, hazard.y);
        }
        this.hazardEntities.set(hazard.id, entity);
      }
      entity.updatePosition(hazard.x, hazard.y);
    }

    for (const hazardId of removedHazardIds) {
      const entity = this.hazardEntities.get(hazardId);
      if (!entity) continue;
      entity.destroy();
      this.hazardEntities.delete(hazardId);
    }
  }

  update(_time: number, delta: number): void {
    this.predictionController.trimPendingInputs(this.pendingInputs);
    this.environmentRenderer.update(this.currentInstanceId);

    if (!this.localPlayerId) return;

    const localEntity = this.playerEntities.get(this.localPlayerId) ?? null;
    const localDead = localEntity?.serverState === 'dead';
    const uiBlocked = useGameStore.getState().showNicknameModal || this.isTypingInInput();

    const touchInput = useTouchInputStore.getState();

    const rawAttackDown = this.attackKey.isDown || touchInput.attackPressed;
    const attack = rawAttackDown && !this.prevAttackDown;
    this.prevAttackDown = rawAttackDown;

    const upPressed = this.cursors.up.isDown || this.keyW.isDown || touchInput.move.up;
    const downPressed = this.cursors.down.isDown || this.keyS.isDown || touchInput.move.down;
    const leftPressed = this.cursors.left.isDown || this.keyA.isDown || touchInput.move.left;
    const rightPressed = this.cursors.right.isDown || this.keyD.isDown || touchInput.move.right;

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
    const changedSinceLastSend = hasDirectionalChange(this.lastSentInputState, inputState);

    if (intervalElapsed || changedSinceLastSend || inputState.attack) {
      const dtWindowMs = Math.max(1, this.inputSendAccumulatorMs);
      this.inputSendAccumulatorMs = 0;

      const input: InputMessage = createInputMessage(this.nextInputSeq++, inputState);
      const speedMultiplier =
        localEntity?.serverState === 'attacking' || inputState.attack ? 0.5 : 1;

      this.pendingInputs.push({
        input,
        dtMs: dtWindowMs,
        sentAtMs: this.time.now,
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

    for (const entity of this.pacmanGhostEntities.values()) {
      const inView = this.isEntityInView(expandedView, entity.x, entity.y);
      const animTimeScale = this.getAnimationLodTimeScale(localX, localY, entity.x, entity.y);
      const showHud = this.shouldShowPacmanGhostHud(localX, localY, entity.x, entity.y);
      entity.update(delta, inView, animTimeScale, showHud);
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
      if (this.minimapAccumulatorMs >= this.getMinimapUpdateInterval()) {
        this.minimapAccumulatorMs = 0;
        this.minimap.draw(
          localEntity.sprite.x,
          localEntity.sprite.y,
          this.playerEntities,
          this.blobEntities,
          this.slimeEntities,
          this.handEntities,
          this.pacmanGhostEntities,
          this.bossEntities,
          this.portalEntities,
          this.localPlayerId
        );
      }
    }
  }

  shutdown(): void {
    this.removeMessageHandler?.();
    this.removeMessageHandler = null;
    this.removeErrorHandler?.();
    this.removeErrorHandler = null;
    this.minimap?.destroy();

    this.localPlayerId = null;
    this.previousLocalState = null;
    this.pendingInputs = [];
    this.inputSendAccumulatorMs = 0;
    this.lastSentInputState = null;
    this.prevAttackDown = false;
    this.currentInstanceId = null;
    this.pendingSafeZoneForLocalPlayer = false;
    this.minimapAccumulatorMs = 0;

    this.destroyEntityMap(this.playerEntities);
    this.destroyEntityMap(this.blobEntities);
    this.destroyEntityMap(this.slimeEntities);
    this.destroyEntityMap(this.handEntities);
    this.destroyEntityMap(this.pacmanGhostEntities);
    this.destroyEntityMap(this.bossEntities);
    this.destroyEntityMap(this.dropEntities);
    this.destroyEntityMap(this.portalEntities);
    this.destroyEntityMap(this.hazardEntities);
    this.enemyKindsById.clear();
    this.bossSnapshotsById.clear();

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

  private shouldShowPacmanGhostHud(
    originX: number,
    originY: number,
    targetX: number,
    targetY: number
  ): boolean {
    const dx = targetX - originX;
    const dy = targetY - originY;
    return dx * dx + dy * dy <= PACMAN_GHOST_HUD_DISTANCE_PX * PACMAN_GHOST_HUD_DISTANCE_PX;
  }

  private getMinimapUpdateInterval(): number {
    return this.currentInstanceId === INSTANCE_IDS.PHASE4
      ? PHASE4_MINIMAP_UPDATE_INTERVAL_MS
      : MINIMAP_UPDATE_INTERVAL_MS;
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

  private applyPositionEntitiesDelta<
    T extends { id: string; x: number; y: number },
    TEntity extends PositionSyncEntity,
  >(
    snapshots: T[],
    removedIds: string[],
    entities: Map<string, TEntity>,
    createEntity: (snapshot: T) => TEntity
  ): void {
    for (const snapshot of snapshots) {
      let entity = entities.get(snapshot.id);
      if (!entity) {
        entity = createEntity(snapshot);
        entities.set(snapshot.id, entity);
      }
      entity.updatePosition(snapshot.x, snapshot.y);
    }

    for (const id of removedIds) {
      const entity = entities.get(id);
      if (!entity) continue;
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
