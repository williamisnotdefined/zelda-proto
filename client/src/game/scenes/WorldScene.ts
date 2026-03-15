import type {
  AoeIndicator,
  BossSnapshot,
  DropSnapshot,
  EnemyStateDelta,
  EnemySnapshot,
  EnemyTransformSnapshot,
  HazardSnapshot,
  InstanceId,
  InputMessage,
  IceZone,
  PacmanGhostVariant,
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
import { getNetworkStats, onError, onMessage, send } from '../../network/socket';
import { useTouchInputStore } from '../input/touchInputStore';
import { useGameStore } from '../../ui/store';
import { PredictionController } from '../controllers/PredictionController';
import type { InputState, PendingInput } from '../controllers/PredictionController';
import { PerformanceOverlay } from '../debug/PerformanceOverlay';
import { FxController } from '../fx/FxController';
import { Minimap } from '../Minimap';
import { EnvironmentRenderer } from '../render/EnvironmentRenderer';

const INPUT_SEND_INTERVAL_MS = 33;
const MAX_PENDING_INPUTS = 128;
const MAX_COMMON_ENEMY_POOL_SIZE = 128;
const MAX_PACMAN_GHOST_ENTITY_POOL_SIZE = 64;
const ENEMY_VISUAL_SYNC_MOVEMENT_THRESHOLD_PX = 416;
const ENTITY_CULL_MARGIN_PX = 220;
const PICKUP_ENTITY_CULL_MARGIN_PX = 160;
const STATIC_ENTITY_CULL_MARGIN_PX = 260;
const ENEMY_SNAPSHOT_GRID_CELL_SIZE = 512;
const MINIMAP_UPDATE_INTERVAL_MS = 100;
const PHASE4_MINIMAP_UPDATE_INTERVAL_MS = 200;
const ENEMY_VISUAL_LOD_NEAR_DISTANCE_PX = 420;
const ENEMY_VISUAL_LOD_MID_DISTANCE_PX = 860;
const ENEMY_VISUAL_LOD_NEAR_TIME_SCALE = 1;
const ENEMY_VISUAL_LOD_MID_TIME_SCALE = 0.75;
const ENEMY_VISUAL_ANIMATION_BUDGET = 160;
const MAX_SMOOTH_VISIBLE_ENEMIES = 400;

type BossEntity = BossGelehkEntity | BossDragonLordEntity | BossPhase3Entity;
type HazardEntity = FireFieldHazardEntity | PurpleFieldHazardEntity | BlueFlameHazardEntity;
type Destroyable = { destroy: () => void };
type PooledEnemyEntity = Destroyable & { setDormant: () => void };
type PositionSyncEntity = Destroyable & { updatePosition: (x: number, y: number) => void };
type EnemyVisualLodTier = 'near' | 'mid' | 'far';
type EnemyVisualLod = Readonly<{
  tier: EnemyVisualLodTier;
  animate: boolean;
  animationTimeScale: number;
}>;
type EnemyVisualCandidate = {
  id: string;
  distSq: number;
  baseLod: EnemyVisualLod;
};
type EnemyVisualBudget = {
  lodById: Map<string, EnemyVisualLod>;
  nearCount: number;
  midCount: number;
  farCount: number;
  animatedCount: number;
};
type EnemyVisualStats = {
  visibleCount: number;
  nearCount: number;
  midCount: number;
  farCount: number;
  animatedCount: number;
  usingBudget: boolean;
};
type EnemyVisualUpdatable = {
  serverState: string;
  update: (dt: number, inView: boolean, lod: EnemyVisualLod) => void;
};

const ENEMY_VISUAL_LOD_NEAR: EnemyVisualLod = {
  tier: 'near',
  animate: true,
  animationTimeScale: ENEMY_VISUAL_LOD_NEAR_TIME_SCALE,
};

const ENEMY_VISUAL_LOD_MID: EnemyVisualLod = {
  tier: 'mid',
  animate: true,
  animationTimeScale: ENEMY_VISUAL_LOD_MID_TIME_SCALE,
};

const ENEMY_VISUAL_LOD_FAR: EnemyVisualLod = {
  tier: 'far',
  animate: false,
  animationTimeScale: 0,
};

export class WorldScene extends Phaser.Scene {
  private localPlayerId: string | null = null;
  private previousLocalState: string | null = null;
  private playerEntities: Map<string, PlayerEntity> = new Map();
  private blobEntities: Map<string, BlobEntity> = new Map();
  private blobEntityPool: BlobEntity[] = [];
  private slimeEntities: Map<string, SlimeEntity> = new Map();
  private slimeEntityPool: SlimeEntity[] = [];
  private handEntities: Map<string, HandEntity> = new Map();
  private handEntityPool: HandEntity[] = [];
  private pacmanGhostEntities: Map<string, PacmanGhostEntity> = new Map();
  private pacmanGhostEntityPools: Record<PacmanGhostVariant, PacmanGhostEntity[]> = {
    [PACMAN_GHOST_VARIANTS.RED]: [],
    [PACMAN_GHOST_VARIANTS.BLUE]: [],
    [PACMAN_GHOST_VARIANTS.ORANGE]: [],
    [PACMAN_GHOST_VARIANTS.PINK]: [],
  };
  private bossEntities: Map<string, BossEntity> = new Map();
  private dropEntities: Map<string, DropEntity> = new Map();
  private portalEntities: Map<string, PortalEntity> = new Map();
  private hazardEntities: Map<string, HazardEntity> = new Map();
  private enemySnapshotsById: Map<string, EnemySnapshot> = new Map();
  private enemyKindsById: Map<string, EnemySnapshot['kind']> = new Map();
  private enemySnapshotBuckets: Map<string, Set<string>> = new Map();
  private enemySnapshotCellById: Map<string, string> = new Map();
  private dirtyEnemyVisualIds: Set<string> = new Set();
  private bossSnapshotsById: Map<string, BossSnapshot> = new Map();
  private readonly expandedEnemyView = new Phaser.Geom.Rectangle();
  private readonly pickupEntityView = new Phaser.Geom.Rectangle();
  private readonly staticEntityView = new Phaser.Geom.Rectangle();

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
  private pendingEnemyVisualSync = true;
  private lastEnemyVisualSyncCenterX = Number.NaN;
  private lastEnemyVisualSyncCenterY = Number.NaN;
  private lastEnemyVisualSyncWidth = 0;
  private lastEnemyVisualSyncHeight = 0;
  private currentInstanceId: InstanceId | null = null;
  private pendingSafeZoneForLocalPlayer = false;

  private readonly predictionController = new PredictionController();
  private environmentRenderer!: EnvironmentRenderer;
  private perfOverlay!: PerformanceOverlay;
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
    this.perfOverlay = new PerformanceOverlay(this);
    this.fx = new FxController(this);
    this.minimap = new Minimap(this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);

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
    this.pendingEnemyVisualSync = true;
    this.lastEnemyVisualSyncCenterX = Number.NaN;
    this.lastEnemyVisualSyncCenterY = Number.NaN;
    this.lastEnemyVisualSyncWidth = 0;
    this.lastEnemyVisualSyncHeight = 0;
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
    this.destroyEnemyPools();
    this.enemySnapshotsById.clear();
    this.enemyKindsById.clear();
    this.clearEnemySnapshotIndex();
    this.bossSnapshotsById.clear();

    useGameStore.getState().setLocalPlayer(null);
    useGameStore.getState().setBoss(null);
  }

  private handleSnapshotDelta(msg: SnapshotDeltaMessage): void {
    if (this.currentInstanceId !== msg.instanceId) {
      return;
    }

    this.applyPlayerDelta(msg.players, msg.removedPlayerIds || []);
    this.applyEnemyDelta(
      msg.enemies || [],
      msg.enemyTransforms || [],
      msg.enemyStates || [],
      msg.removedEnemyIds || []
    );
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
    const seenEnemyIds = new Set<string>();
    this.clearEnemySnapshotIndex();
    this.dirtyEnemyVisualIds.clear();

    for (const enemy of enemies) {
      seenEnemyIds.add(enemy.id);
      this.upsertEnemySnapshot(enemy, false);
    }

    for (const [id] of this.enemySnapshotsById) {
      if (!seenEnemyIds.has(id)) {
        this.removeEnemySnapshot(id);
      }
    }

    this.pendingEnemyVisualSync = true;
  }

  private applyEnemyDelta(
    enemies: EnemySnapshot[],
    enemyTransforms: EnemyTransformSnapshot[],
    enemyStates: EnemyStateDelta[],
    removedEnemyIds: string[]
  ): void {
    for (const enemy of enemies) {
      this.upsertEnemySnapshot(enemy);
    }

    for (const transform of enemyTransforms) {
      this.applyEnemyTransform(transform);
    }

    for (const state of enemyStates) {
      this.applyEnemyStateDelta(state);
    }

    for (const enemyId of removedEnemyIds) {
      this.removeEnemySnapshot(enemyId);
    }
  }

  private applyEnemyTransform(transform: EnemyTransformSnapshot): void {
    const snapshot = this.enemySnapshotsById.get(transform.id);
    if (!snapshot) {
      return;
    }

    const prevX = snapshot.x;
    const prevY = snapshot.y;
    snapshot.x = transform.x;
    snapshot.y = transform.y;
    this.moveIndexedEnemySnapshot(snapshot, prevX, prevY);

    this.dirtyEnemyVisualIds.add(snapshot.id);
  }

  private applyEnemyStateDelta(state: EnemyStateDelta): void {
    const snapshot = this.enemySnapshotsById.get(state.id);
    if (!snapshot) {
      return;
    }

    snapshot.hp = state.hp;
    snapshot.maxHp = state.maxHp;
    snapshot.state = state.state;

    this.dirtyEnemyVisualIds.add(snapshot.id);
  }

  private upsertEnemySnapshot(enemy: EnemySnapshot, schedulePresenceSync: boolean = true): void {
    const previousSnapshot = this.enemySnapshotsById.get(enemy.id);
    const previousKind = this.enemyKindsById.get(enemy.id);
    if (previousKind && previousKind !== enemy.kind) {
      this.releaseEnemyVisual(enemy.id, previousKind);
    }

    this.enemyKindsById.set(enemy.id, enemy.kind);
    this.enemySnapshotsById.set(enemy.id, enemy);

    if (previousSnapshot) {
      this.moveIndexedEnemySnapshot(enemy, previousSnapshot.x, previousSnapshot.y);
    } else {
      this.indexEnemySnapshot(enemy);
    }

    if (schedulePresenceSync) {
      this.dirtyEnemyVisualIds.add(enemy.id);
    }
  }

  private hasEnemyVisual(enemy: EnemySnapshot): boolean {
    if (enemy.kind === ENEMY_KINDS.BLOB) {
      return this.blobEntities.has(enemy.id);
    }

    if (enemy.kind === ENEMY_KINDS.SLIME) {
      return this.slimeEntities.has(enemy.id);
    }

    if (enemy.kind === ENEMY_KINDS.HAND) {
      return this.handEntities.has(enemy.id);
    }

    const variant = enemy.variant ?? PACMAN_GHOST_VARIANTS.RED;
    const entity = this.pacmanGhostEntities.get(enemy.id);
    return !!entity && entity.variant === variant;
  }

  private updateExistingEnemyVisual(enemy: EnemySnapshot): void {
    if (enemy.kind === ENEMY_KINDS.BLOB) {
      this.blobEntities
        .get(enemy.id)
        ?.updateFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state);
      return;
    }

    if (enemy.kind === ENEMY_KINDS.SLIME) {
      this.slimeEntities
        .get(enemy.id)
        ?.updateFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state);
      return;
    }

    if (enemy.kind === ENEMY_KINDS.HAND) {
      this.handEntities
        .get(enemy.id)
        ?.updateFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state);
      return;
    }

    const variant = enemy.variant ?? PACMAN_GHOST_VARIANTS.RED;
    const entity = this.pacmanGhostEntities.get(enemy.id);
    if (!entity || entity.variant !== variant) {
      return;
    }

    entity.updateFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state);
  }

  private ensureEnemyVisual(enemy: EnemySnapshot): void {
    if (enemy.kind === ENEMY_KINDS.BLOB) {
      if (this.blobEntities.has(enemy.id)) {
        return;
      }

      const entity = this.acquirePooledEntity(
        this.blobEntityPool,
        () => new BlobEntity(this, enemy.x, enemy.y),
        (pooled) => pooled.restoreFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state)
      );
      this.blobEntities.set(enemy.id, entity);
      return;
    }

    if (enemy.kind === ENEMY_KINDS.SLIME) {
      if (this.slimeEntities.has(enemy.id)) {
        return;
      }

      const entity = this.acquirePooledEntity(
        this.slimeEntityPool,
        () => new SlimeEntity(this, enemy.x, enemy.y),
        (pooled) => pooled.restoreFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state)
      );
      this.slimeEntities.set(enemy.id, entity);
      return;
    }

    if (enemy.kind === ENEMY_KINDS.HAND) {
      if (this.handEntities.has(enemy.id)) {
        return;
      }

      const entity = this.acquirePooledEntity(
        this.handEntityPool,
        () => new HandEntity(this, enemy.x, enemy.y),
        (pooled) => pooled.restoreFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state)
      );
      this.handEntities.set(enemy.id, entity);
      return;
    }

    if (enemy.kind === ENEMY_KINDS.PACMAN_GHOST) {
      const variant = enemy.variant ?? PACMAN_GHOST_VARIANTS.RED;
      const existing = this.pacmanGhostEntities.get(enemy.id);
      if (existing && existing.variant !== variant) {
        this.releaseEnemyVisual(enemy.id, ENEMY_KINDS.PACMAN_GHOST);
      }

      if (this.pacmanGhostEntities.has(enemy.id)) {
        return;
      }

      const entity = this.acquirePooledEntity(
        this.getPacmanGhostEntityPool(variant),
        () => new PacmanGhostEntity(this, enemy.x, enemy.y, variant),
        (pooled) => pooled.restoreFromServer(enemy.x, enemy.y, enemy.hp, enemy.maxHp, enemy.state)
      );
      this.pacmanGhostEntities.set(enemy.id, entity);
    }
  }

  private removeEnemySnapshot(id: string, knownKind?: EnemySnapshot['kind']): void {
    this.releaseEnemyVisual(id, knownKind);
    this.removeIndexedEnemySnapshot(id);
    this.enemySnapshotsById.delete(id);
    this.enemyKindsById.delete(id);
  }

  private releaseEnemyVisual(id: string, knownKind?: EnemySnapshot['kind']): void {
    const kind = knownKind ?? this.enemyKindsById.get(id);
    if (!kind) {
      return;
    }

    if (kind === ENEMY_KINDS.BLOB) {
      const entity = this.blobEntities.get(id);
      if (entity) {
        this.blobEntities.delete(id);
        this.releaseToPoolOrDestroy(this.blobEntityPool, entity, MAX_COMMON_ENEMY_POOL_SIZE);
      }
    } else if (kind === ENEMY_KINDS.SLIME) {
      const entity = this.slimeEntities.get(id);
      if (entity) {
        this.slimeEntities.delete(id);
        this.releaseToPoolOrDestroy(this.slimeEntityPool, entity, MAX_COMMON_ENEMY_POOL_SIZE);
      }
    } else if (kind === ENEMY_KINDS.HAND) {
      const entity = this.handEntities.get(id);
      if (entity) {
        this.handEntities.delete(id);
        this.releaseToPoolOrDestroy(this.handEntityPool, entity, MAX_COMMON_ENEMY_POOL_SIZE);
      }
    } else if (kind === ENEMY_KINDS.PACMAN_GHOST) {
      const entity = this.pacmanGhostEntities.get(id);
      if (entity) {
        this.pacmanGhostEntities.delete(id);
        this.releaseToPoolOrDestroy(
          this.getPacmanGhostEntityPool(entity.variant),
          entity,
          MAX_PACMAN_GHOST_ENTITY_POOL_SIZE
        );
      }
    }
  }

  private clearEnemySnapshotIndex(): void {
    this.enemySnapshotBuckets.clear();
    this.enemySnapshotCellById.clear();
  }

  private getEnemySnapshotCellCoord(value: number): number {
    return Math.floor(value / ENEMY_SNAPSHOT_GRID_CELL_SIZE);
  }

  private getEnemySnapshotCellKey(x: number, y: number): string {
    return this.getEnemySnapshotCellKeyByCoords(
      this.getEnemySnapshotCellCoord(x),
      this.getEnemySnapshotCellCoord(y)
    );
  }

  private getEnemySnapshotCellKeyByCoords(cellX: number, cellY: number): string {
    return `${cellX},${cellY}`;
  }

  private indexEnemySnapshot(snapshot: EnemySnapshot): void {
    const nextCellKey = this.getEnemySnapshotCellKey(snapshot.x, snapshot.y);
    const previousCellKey = this.enemySnapshotCellById.get(snapshot.id);
    if (previousCellKey && previousCellKey !== nextCellKey) {
      this.removeIndexedEnemySnapshot(snapshot.id);
    }

    let bucket = this.enemySnapshotBuckets.get(nextCellKey);
    if (!bucket) {
      bucket = new Set();
      this.enemySnapshotBuckets.set(nextCellKey, bucket);
    }

    bucket.add(snapshot.id);
    this.enemySnapshotCellById.set(snapshot.id, nextCellKey);
  }

  private moveIndexedEnemySnapshot(snapshot: EnemySnapshot, prevX: number, prevY: number): void {
    const nextCellKey = this.getEnemySnapshotCellKey(snapshot.x, snapshot.y);
    const previousCellKey =
      this.enemySnapshotCellById.get(snapshot.id) ?? this.getEnemySnapshotCellKey(prevX, prevY);

    if (previousCellKey === nextCellKey) {
      if (!this.enemySnapshotCellById.has(snapshot.id)) {
        this.indexEnemySnapshot(snapshot);
      }
      return;
    }

    this.removeIndexedEnemySnapshot(snapshot.id);
    this.indexEnemySnapshot(snapshot);
  }

  private removeIndexedEnemySnapshot(id: string): void {
    const cellKey = this.enemySnapshotCellById.get(id);
    if (!cellKey) {
      return;
    }

    const bucket = this.enemySnapshotBuckets.get(cellKey);
    if (bucket) {
      bucket.delete(id);
      if (bucket.size === 0) {
        this.enemySnapshotBuckets.delete(cellKey);
      }
    }

    this.enemySnapshotCellById.delete(id);
  }

  private forEachEnemySnapshotInRect(
    view: Phaser.Geom.Rectangle,
    callback: (enemy: EnemySnapshot) => void
  ): void {
    const minCellX = this.getEnemySnapshotCellCoord(view.left);
    const maxCellX = this.getEnemySnapshotCellCoord(view.right);
    const minCellY = this.getEnemySnapshotCellCoord(view.top);
    const maxCellY = this.getEnemySnapshotCellCoord(view.bottom);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = this.enemySnapshotBuckets.get(
          this.getEnemySnapshotCellKeyByCoords(cellX, cellY)
        );
        if (!bucket) {
          continue;
        }

        for (const id of bucket) {
          const enemy = this.enemySnapshotsById.get(id);
          if (!enemy || !this.isEntityInView(view, enemy.x, enemy.y)) {
            continue;
          }

          callback(enemy);
        }
      }
    }
  }

  private forEachEnemySnapshotInRadius(
    x: number,
    y: number,
    radius: number,
    callback: (enemy: EnemySnapshot) => void
  ): void {
    const minCellX = this.getEnemySnapshotCellCoord(x - radius);
    const maxCellX = this.getEnemySnapshotCellCoord(x + radius);
    const minCellY = this.getEnemySnapshotCellCoord(y - radius);
    const maxCellY = this.getEnemySnapshotCellCoord(y + radius);
    const radiusSq = radius * radius;

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = this.enemySnapshotBuckets.get(
          this.getEnemySnapshotCellKeyByCoords(cellX, cellY)
        );
        if (!bucket) {
          continue;
        }

        for (const id of bucket) {
          const enemy = this.enemySnapshotsById.get(id);
          if (!enemy) {
            continue;
          }

          const dx = enemy.x - x;
          const dy = enemy.y - y;
          if (dx * dx + dy * dy > radiusSq) {
            continue;
          }

          callback(enemy);
        }
      }
    }
  }

  private getExpandedEnemyView(): Phaser.Geom.Rectangle {
    const worldView = this.cameras.main.worldView;
    this.expandedEnemyView.setTo(
      worldView.x - ENTITY_CULL_MARGIN_PX,
      worldView.y - ENTITY_CULL_MARGIN_PX,
      worldView.width + ENTITY_CULL_MARGIN_PX * 2,
      worldView.height + ENTITY_CULL_MARGIN_PX * 2
    );
    return this.expandedEnemyView;
  }

  private getPickupEntityView(): Phaser.Geom.Rectangle {
    const worldView = this.cameras.main.worldView;
    this.pickupEntityView.setTo(
      worldView.x - PICKUP_ENTITY_CULL_MARGIN_PX,
      worldView.y - PICKUP_ENTITY_CULL_MARGIN_PX,
      worldView.width + PICKUP_ENTITY_CULL_MARGIN_PX * 2,
      worldView.height + PICKUP_ENTITY_CULL_MARGIN_PX * 2
    );
    return this.pickupEntityView;
  }

  private getStaticEntityView(): Phaser.Geom.Rectangle {
    const worldView = this.cameras.main.worldView;
    this.staticEntityView.setTo(
      worldView.x - STATIC_ENTITY_CULL_MARGIN_PX,
      worldView.y - STATIC_ENTITY_CULL_MARGIN_PX,
      worldView.width + STATIC_ENTITY_CULL_MARGIN_PX * 2,
      worldView.height + STATIC_ENTITY_CULL_MARGIN_PX * 2
    );
    return this.staticEntityView;
  }

  private syncDirtyEnemyVisualPresence(view: Phaser.Geom.Rectangle): void {
    if (this.dirtyEnemyVisualIds.size === 0) {
      return;
    }

    for (const enemyId of this.dirtyEnemyVisualIds) {
      const enemy = this.enemySnapshotsById.get(enemyId);
      if (!enemy) {
        continue;
      }

      if (!this.isEntityInView(view, enemy.x, enemy.y)) {
        this.releaseEnemyVisual(enemy.id, enemy.kind);
        continue;
      }

      if (!this.hasEnemyVisual(enemy)) {
        this.ensureEnemyVisual(enemy);
        continue;
      }

      this.updateExistingEnemyVisual(enemy);
    }

    this.dirtyEnemyVisualIds.clear();
  }

  private shouldSyncEnemyVisuals(view: Phaser.Geom.Rectangle): boolean {
    if (this.pendingEnemyVisualSync) {
      return true;
    }

    if (
      Number.isNaN(this.lastEnemyVisualSyncCenterX) ||
      Number.isNaN(this.lastEnemyVisualSyncCenterY)
    ) {
      return true;
    }

    if (
      view.width !== this.lastEnemyVisualSyncWidth ||
      view.height !== this.lastEnemyVisualSyncHeight
    ) {
      return true;
    }

    const centerX = view.x + view.width / 2;
    const centerY = view.y + view.height / 2;
    const dx = centerX - this.lastEnemyVisualSyncCenterX;
    const dy = centerY - this.lastEnemyVisualSyncCenterY;
    return (
      dx * dx + dy * dy >
      ENEMY_VISUAL_SYNC_MOVEMENT_THRESHOLD_PX * ENEMY_VISUAL_SYNC_MOVEMENT_THRESHOLD_PX
    );
  }

  private rememberEnemyVisualSyncView(view: Phaser.Geom.Rectangle): void {
    this.lastEnemyVisualSyncCenterX = view.x + view.width / 2;
    this.lastEnemyVisualSyncCenterY = view.y + view.height / 2;
    this.lastEnemyVisualSyncWidth = view.width;
    this.lastEnemyVisualSyncHeight = view.height;
  }

  private syncVisibleEnemyEntities(view: Phaser.Geom.Rectangle): void {
    const visibleEnemyIds = new Set<string>();

    this.forEachEnemySnapshotInRect(view, (enemy) => {
      visibleEnemyIds.add(enemy.id);
      if (!this.hasEnemyVisual(enemy)) {
        this.ensureEnemyVisual(enemy);
        return;
      }

      this.updateExistingEnemyVisual(enemy);
    });

    this.destroyEnemyVisualsOutsideSet(this.blobEntities, visibleEnemyIds, ENEMY_KINDS.BLOB);
    this.destroyEnemyVisualsOutsideSet(this.slimeEntities, visibleEnemyIds, ENEMY_KINDS.SLIME);
    this.destroyEnemyVisualsOutsideSet(this.handEntities, visibleEnemyIds, ENEMY_KINDS.HAND);
    this.destroyEnemyVisualsOutsideSet(
      this.pacmanGhostEntities,
      visibleEnemyIds,
      ENEMY_KINDS.PACMAN_GHOST
    );
  }

  private destroyEnemyVisualsOutsideSet<T extends Destroyable>(
    entities: Map<string, T>,
    visibleEnemyIds: Set<string>,
    kind: EnemySnapshot['kind']
  ): void {
    for (const [id] of entities) {
      if (visibleEnemyIds.has(id)) {
        continue;
      }

      this.releaseEnemyVisual(id, kind);
    }
  }

  private acquirePooledEntity<T extends PooledEnemyEntity>(
    pool: T[],
    createEntity: () => T,
    prepareEntity: (entity: T) => void
  ): T {
    const entity = pool.pop() ?? createEntity();
    prepareEntity(entity);
    return entity;
  }

  private releaseToPoolOrDestroy<T extends PooledEnemyEntity>(
    pool: T[],
    entity: T,
    maxSize: number
  ): void {
    entity.setDormant();
    if (pool.length < maxSize) {
      pool.push(entity);
      return;
    }

    entity.destroy();
  }

  private getPacmanGhostEntityPool(variant: PacmanGhostVariant): PacmanGhostEntity[] {
    return this.pacmanGhostEntityPools[variant];
  }

  private destroyEnemyPools(): void {
    this.destroyEntityList(this.blobEntityPool);
    this.destroyEntityList(this.slimeEntityPool);
    this.destroyEntityList(this.handEntityPool);
    for (const pool of Object.values(this.pacmanGhostEntityPools)) {
      this.destroyEntityList(pool);
    }
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

    if (localEntity) {
      this.cameras.main.centerOn(localEntity.sprite.x, localEntity.sprite.y);
    }

    const expandedView = this.getExpandedEnemyView();
    const pickupView = this.getPickupEntityView();
    const staticEntityView = this.getStaticEntityView();

    const localX = localEntity?.sprite.x ?? this.cameras.main.midPoint.x;
    const localY = localEntity?.sprite.y ?? this.cameras.main.midPoint.y;

    if (this.shouldSyncEnemyVisuals(expandedView)) {
      this.syncVisibleEnemyEntities(expandedView);
      this.pendingEnemyVisualSync = false;
      this.dirtyEnemyVisualIds.clear();
      this.rememberEnemyVisualSyncView(expandedView);
    } else {
      this.syncDirtyEnemyVisualPresence(expandedView);
    }

    const visibleEnemyCount = this.countEnemySnapshotsInRect(this.cameras.main.worldView);
    const enemyVisualStats =
      visibleEnemyCount <= MAX_SMOOTH_VISIBLE_ENEMIES
        ? this.updateEnemyVisualsWithDistanceLod(
            localX,
            localY,
            expandedView,
            delta,
            visibleEnemyCount
          )
        : this.updateEnemyVisualsWithBudget(localX, localY, expandedView, delta, visibleEnemyCount);

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
      this.minimapAccumulatorMs += delta;
      if (this.minimapAccumulatorMs >= this.getMinimapUpdateInterval()) {
        this.minimapAccumulatorMs = 0;
        this.minimap.draw(
          localEntity.sprite.x,
          localEntity.sprite.y,
          this.playerEntities,
          (x, y, radius, callback) => this.forEachEnemySnapshotInRadius(x, y, radius, callback),
          this.bossEntities,
          this.portalEntities,
          this.localPlayerId
        );
      }
    }

    if (this.perfOverlay.isEnabled()) {
      this.perfOverlay.update(delta, {
        fps: this.game.loop.actualFps,
        frameMs: delta,
        enemySnapshots: this.enemySnapshotsById.size,
        visibleEnemies: enemyVisualStats.visibleCount,
        enemyVisuals:
          this.blobEntities.size +
          this.slimeEntities.size +
          this.handEntities.size +
          this.pacmanGhostEntities.size,
        pooledEnemyVisuals:
          this.blobEntityPool.length +
          this.slimeEntityPool.length +
          this.handEntityPool.length +
          this.pacmanGhostEntityPools[PACMAN_GHOST_VARIANTS.RED].length +
          this.pacmanGhostEntityPools[PACMAN_GHOST_VARIANTS.BLUE].length +
          this.pacmanGhostEntityPools[PACMAN_GHOST_VARIANTS.ORANGE].length +
          this.pacmanGhostEntityPools[PACMAN_GHOST_VARIANTS.PINK].length,
        enemyVisualMode: enemyVisualStats.usingBudget ? 'budget' : 'smooth',
        players: this.playerEntities.size,
        bosses: this.bossEntities.size,
        drops: this.dropEntities.size,
        portals: this.portalEntities.size,
        hazards: this.hazardEntities.size,
        displayObjects: this.children.list.length,
        enemyVisualLodNear: enemyVisualStats.nearCount,
        enemyVisualLodMid: enemyVisualStats.midCount,
        enemyVisualLodFar: enemyVisualStats.farCount,
        animatedEnemies: enemyVisualStats.animatedCount,
        network: getNetworkStats(),
      });
    }
  }

  shutdown(): void {
    this.removeMessageHandler?.();
    this.removeMessageHandler = null;
    this.removeErrorHandler?.();
    this.removeErrorHandler = null;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
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
    this.pendingEnemyVisualSync = true;
    this.lastEnemyVisualSyncCenterX = Number.NaN;
    this.lastEnemyVisualSyncCenterY = Number.NaN;
    this.lastEnemyVisualSyncWidth = 0;
    this.lastEnemyVisualSyncHeight = 0;

    this.destroyEntityMap(this.playerEntities);
    this.destroyEntityMap(this.blobEntities);
    this.destroyEntityMap(this.slimeEntities);
    this.destroyEntityMap(this.handEntities);
    this.destroyEntityMap(this.pacmanGhostEntities);
    this.destroyEntityMap(this.bossEntities);
    this.destroyEntityMap(this.dropEntities);
    this.destroyEntityMap(this.portalEntities);
    this.destroyEntityMap(this.hazardEntities);
    this.destroyEnemyPools();
    this.enemySnapshotsById.clear();
    this.enemyKindsById.clear();
    this.clearEnemySnapshotIndex();
    this.dirtyEnemyVisualIds.clear();
    this.bossSnapshotsById.clear();

    this.perfOverlay?.destroy();
    this.fx?.destroy();
    this.environmentRenderer?.destroy();
  }

  private handleScaleResize(): void {
    this.pendingEnemyVisualSync = true;
  }

  private isEntityInView(view: Phaser.Geom.Rectangle, x: number, y: number): boolean {
    return x >= view.left && x <= view.right && y >= view.top && y <= view.bottom;
  }

  private countEnemySnapshotsInRect(view: Phaser.Geom.Rectangle): number {
    let count = 0;
    this.forEachEnemySnapshotInRect(view, (enemy) => {
      if (enemy.state !== 'dead') {
        count += 1;
      }
    });
    return count;
  }

  private getEnemyVisualLodForDistance(distSq: number): EnemyVisualLod {
    if (distSq <= ENEMY_VISUAL_LOD_NEAR_DISTANCE_PX * ENEMY_VISUAL_LOD_NEAR_DISTANCE_PX) {
      return ENEMY_VISUAL_LOD_NEAR;
    }

    if (distSq <= ENEMY_VISUAL_LOD_MID_DISTANCE_PX * ENEMY_VISUAL_LOD_MID_DISTANCE_PX) {
      return ENEMY_VISUAL_LOD_MID;
    }

    return ENEMY_VISUAL_LOD_FAR;
  }

  private getBudgetedEnemyVisualLod(
    baseLod: EnemyVisualLod,
    priorityIndex: number
  ): EnemyVisualLod {
    if (priorityIndex < ENEMY_VISUAL_ANIMATION_BUDGET) {
      return baseLod;
    }

    return ENEMY_VISUAL_LOD_FAR;
  }

  private collectEnemyVisualCandidates<TEntity extends EnemyVisualUpdatable>(
    entities: Map<string, TEntity>,
    view: Phaser.Geom.Rectangle,
    originX: number,
    originY: number,
    getX: (entity: TEntity) => number,
    getY: (entity: TEntity) => number,
    candidates: EnemyVisualCandidate[]
  ): void {
    for (const [id, entity] of entities) {
      if (entity.serverState === 'dead') {
        continue;
      }

      const x = getX(entity);
      const y = getY(entity);
      if (!this.isEntityInView(view, x, y)) {
        continue;
      }

      const dx = x - originX;
      const dy = y - originY;
      const distSq = dx * dx + dy * dy;
      candidates.push({
        id,
        distSq,
        baseLod: this.getEnemyVisualLodForDistance(distSq),
      });
    }
  }

  private buildEnemyVisualBudget(
    originX: number,
    originY: number,
    view: Phaser.Geom.Rectangle
  ): EnemyVisualBudget {
    const candidates: EnemyVisualCandidate[] = [];
    this.collectEnemyVisualCandidates(
      this.blobEntities,
      view,
      originX,
      originY,
      (entity) => entity.sprite.x,
      (entity) => entity.sprite.y,
      candidates
    );
    this.collectEnemyVisualCandidates(
      this.slimeEntities,
      view,
      originX,
      originY,
      (entity) => entity.x,
      (entity) => entity.y,
      candidates
    );
    this.collectEnemyVisualCandidates(
      this.handEntities,
      view,
      originX,
      originY,
      (entity) => entity.x,
      (entity) => entity.y,
      candidates
    );
    this.collectEnemyVisualCandidates(
      this.pacmanGhostEntities,
      view,
      originX,
      originY,
      (entity) => entity.x,
      (entity) => entity.y,
      candidates
    );

    candidates.sort((a, b) => a.distSq - b.distSq);

    const lodById = new Map<string, EnemyVisualLod>();
    let nearCount = 0;
    let midCount = 0;
    let farCount = 0;
    let animatedCount = 0;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const lod = this.getBudgetedEnemyVisualLod(candidate.baseLod, index);
      lodById.set(candidate.id, lod);

      if (lod.tier === 'near') {
        nearCount += 1;
      } else if (lod.tier === 'mid') {
        midCount += 1;
      } else {
        farCount += 1;
      }

      if (lod.animate) {
        animatedCount += 1;
      }
    }

    return {
      lodById,
      nearCount,
      midCount,
      farCount,
      animatedCount,
    };
  }

  private createEnemyVisualStats(visibleCount: number, usingBudget: boolean): EnemyVisualStats {
    return {
      visibleCount,
      nearCount: 0,
      midCount: 0,
      farCount: 0,
      animatedCount: 0,
      usingBudget,
    };
  }

  private recordEnemyVisualStats(stats: EnemyVisualStats, lod: EnemyVisualLod): void {
    if (lod.tier === 'near') {
      stats.nearCount += 1;
    } else if (lod.tier === 'mid') {
      stats.midCount += 1;
    } else {
      stats.farCount += 1;
    }

    if (lod.animate) {
      stats.animatedCount += 1;
    }
  }

  private updateEnemyVisualEntitiesWithDistanceLod<TEntity extends EnemyVisualUpdatable>(
    entities: Map<string, TEntity>,
    view: Phaser.Geom.Rectangle,
    delta: number,
    originX: number,
    originY: number,
    getX: (entity: TEntity) => number,
    getY: (entity: TEntity) => number,
    stats: EnemyVisualStats
  ): void {
    for (const entity of entities.values()) {
      const x = getX(entity);
      const y = getY(entity);
      const inView = this.isEntityInView(view, x, y);

      let lod = ENEMY_VISUAL_LOD_FAR;
      if (inView && entity.serverState !== 'dead') {
        const dx = x - originX;
        const dy = y - originY;
        lod = this.getEnemyVisualLodForDistance(dx * dx + dy * dy);
        this.recordEnemyVisualStats(stats, lod);
      }

      entity.update(delta, inView, lod);
    }
  }

  private updateEnemyVisualsWithDistanceLod(
    originX: number,
    originY: number,
    view: Phaser.Geom.Rectangle,
    delta: number,
    visibleCount: number
  ): EnemyVisualStats {
    const stats = this.createEnemyVisualStats(visibleCount, false);

    this.updateEnemyVisualEntitiesWithDistanceLod(
      this.blobEntities,
      view,
      delta,
      originX,
      originY,
      (entity) => entity.sprite.x,
      (entity) => entity.sprite.y,
      stats
    );
    this.updateEnemyVisualEntitiesWithDistanceLod(
      this.slimeEntities,
      view,
      delta,
      originX,
      originY,
      (entity) => entity.x,
      (entity) => entity.y,
      stats
    );
    this.updateEnemyVisualEntitiesWithDistanceLod(
      this.handEntities,
      view,
      delta,
      originX,
      originY,
      (entity) => entity.x,
      (entity) => entity.y,
      stats
    );
    this.updateEnemyVisualEntitiesWithDistanceLod(
      this.pacmanGhostEntities,
      view,
      delta,
      originX,
      originY,
      (entity) => entity.x,
      (entity) => entity.y,
      stats
    );

    return stats;
  }

  private updateEnemyVisualsWithBudget(
    originX: number,
    originY: number,
    view: Phaser.Geom.Rectangle,
    delta: number,
    visibleCount: number
  ): EnemyVisualStats {
    const enemyVisualBudget = this.buildEnemyVisualBudget(originX, originY, view);

    this.updateEnemyVisualEntities(
      this.blobEntities,
      view,
      enemyVisualBudget.lodById,
      delta,
      (entity) => entity.sprite.x,
      (entity) => entity.sprite.y
    );
    this.updateEnemyVisualEntities(
      this.slimeEntities,
      view,
      enemyVisualBudget.lodById,
      delta,
      (entity) => entity.x,
      (entity) => entity.y
    );
    this.updateEnemyVisualEntities(
      this.handEntities,
      view,
      enemyVisualBudget.lodById,
      delta,
      (entity) => entity.x,
      (entity) => entity.y
    );
    this.updateEnemyVisualEntities(
      this.pacmanGhostEntities,
      view,
      enemyVisualBudget.lodById,
      delta,
      (entity) => entity.x,
      (entity) => entity.y
    );

    return {
      visibleCount,
      nearCount: enemyVisualBudget.nearCount,
      midCount: enemyVisualBudget.midCount,
      farCount: enemyVisualBudget.farCount,
      animatedCount: enemyVisualBudget.animatedCount,
      usingBudget: true,
    };
  }

  private updateEnemyVisualEntities<TEntity extends EnemyVisualUpdatable>(
    entities: Map<string, TEntity>,
    view: Phaser.Geom.Rectangle,
    lodById: ReadonlyMap<string, EnemyVisualLod>,
    delta: number,
    getX: (entity: TEntity) => number,
    getY: (entity: TEntity) => number
  ): void {
    for (const [id, entity] of entities) {
      const inView = this.isEntityInView(view, getX(entity), getY(entity));
      const lod = inView ? (lodById.get(id) ?? ENEMY_VISUAL_LOD_FAR) : ENEMY_VISUAL_LOD_FAR;
      entity.update(delta, inView, lod);
    }
  }

  private getMinimapUpdateInterval(): number {
    const baseInterval =
      this.currentInstanceId === INSTANCE_IDS.PHASE4
        ? PHASE4_MINIMAP_UPDATE_INTERVAL_MS
        : MINIMAP_UPDATE_INTERVAL_MS;

    if (this.enemySnapshotsById.size >= 1000) {
      return Math.max(baseInterval, 400);
    }

    if (this.enemySnapshotsById.size >= 800) {
      return Math.max(baseInterval, 300);
    }

    if (this.enemySnapshotsById.size >= 600) {
      return Math.max(baseInterval, 220);
    }

    if (this.enemySnapshotsById.size >= 400) {
      return Math.max(baseInterval, 150);
    }

    return baseInterval;
  }

  private destroyEntityMap<T extends Destroyable>(entities: Map<string, T>): void {
    for (const entity of entities.values()) {
      entity.destroy();
    }
    entities.clear();
  }

  private destroyEntityList<T extends Destroyable>(entities: T[]): void {
    for (const entity of entities) {
      entity.destroy();
    }
    entities.length = 0;
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
