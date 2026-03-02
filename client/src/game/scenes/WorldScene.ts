import type {
  AoeIndicator,
  BossSnapshot,
  DropSnapshot,
  EnemySnapshot,
  HazardSnapshot,
  InstanceId,
  IceZone,
  InputMessage,
  PortalSnapshot,
  PlayerSnapshot,
  ServerChatMessage,
  ServerMessage,
} from '@gelehka/shared';
import { CLIENT_MESSAGE_TYPES, INSTANCE_IDS, SERVER_MESSAGE_TYPES } from '@gelehka/shared';
import { WORLD_SPAWN_SAFE_ZONE_RADIUS } from '@gelehka/shared/constants';
import { seededRandom } from '@gelehka/shared/utils';
import Phaser from 'phaser';
import { BlobEntity } from '../../entities/Blob';
import { BossDragonLordEntity } from '../../entities/BossDragonLord';
import { BossGelehkEntity } from '../../entities/BossGelehk';
import { DropEntity } from '../../entities/DropEntity';
import { FireFieldHazardEntity } from '../../entities/FireFieldHazardEntity';
import { PlayerEntity } from '../../entities/Player';
import { PortalEntity } from '../../entities/PortalEntity';
import { SlimeEntity } from '../../entities/Slime';
import { onError, onMessage, send } from '../../network/socket';
import { useGameStore } from '../../ui/store';
import { Minimap } from '../Minimap';

const CHUNK_SIZE = 512;
const CHUNK_MARGIN = 1;
const DECOR_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19];
const PHASE1_DECOR_PER_CHUNK = 6;
const CUT_GRASS_MIN_PER_CHUNK = 2;
const CUT_GRASS_MAX_PER_CHUNK = 3;
const CUT_GRASS_DEPTH = 0;
const CUT_GRASS_COUNT_SEED = 4000;
const CUT_GRASS_POSITION_SEED = 5000;
const PHASE2_REMAINS_KEYS = [
  'humanoid_remains',
  'pile_of_bones_animal',
  'skull_animal',
  'pirate_remains',
] as const;
const PHASE2_REMAINS_MIN_PER_CHUNK = 5;
const PHASE2_REMAINS_MAX_PER_CHUNK = 10;
const PHASE2_REMAINS_COUNT_SEED = 6000;
const PHASE2_REMAINS_POSITION_SEED = 7000;
const PHASE2_REMAINS_VARIANT_SEED = 8000;
const PLAYER_PREDICT_SPEED = 150;
const PLAYER_ATTACK_SPEED_PENALTY = 0.5;
const INPUT_SEND_INTERVAL_MS = 33;
const MAX_PENDING_INPUTS = 128;
const MAX_PENDING_INPUT_AGE_MS = 1500;
const RECONCILE_SNAP_DISTANCE = 120;
const RECONCILE_MIN_BLEND = 0.08;
const RECONCILE_MAX_BLEND = 0.24;
const RECONCILE_BLEND_RAMP_DISTANCE = 40;
const RECONCILE_DEADZONE_DISTANCE = 0.75;
const BACKGROUND_MUSIC_VOLUME = 0.02;
const TOASTY_SFX_VOLUME = 0.8;
const TOASTY_MARGIN_TOP = 20;
const TOASTY_MARGIN_RIGHT = 20;
const TOASTY_OFFSCREEN_OFFSET_X = 220;
const TOASTY_SCALE = 0.42;
const TOASTY_DEPTH = 1000;
const TOASTY_SLIDE_IN_DURATION_MS = 120;
const TOASTY_HOLD_DURATION_MS = 550;
const TOASTY_SLIDE_OUT_DURATION_MS = 120;
const SAFE_ZONE_VISUAL_DURATION_MS = 3000;
const ENTITY_CULL_MARGIN_PX = 220;
const PICKUP_ENTITY_CULL_MARGIN_PX = 160;
const STATIC_ENTITY_CULL_MARGIN_PX = 260;
const MINIMAP_UPDATE_INTERVAL_MS = 100;
const ANIM_LOD_NEAR_DISTANCE_PX = 420;
const ANIM_LOD_MID_DISTANCE_PX = 860;
const ANIM_LOD_NEAR_TIME_SCALE = 1;
const ANIM_LOD_MID_TIME_SCALE = 0.75;
const ANIM_LOD_FAR_TIME_SCALE = 0.5;

interface PendingInput {
  input: InputMessage;
  dtMs: number;
  sentAtMs: number;
}

interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
}

type BossEntity = BossGelehkEntity | BossDragonLordEntity;
type Destroyable = { destroy: () => void };
type PositionSyncEntity = Destroyable & { updatePosition: (x: number, y: number) => void };

export class WorldScene extends Phaser.Scene {
  private localPlayerId: string | null = null;
  private previousLocalState: string | null = null;
  private playerEntities: Map<string, PlayerEntity> = new Map();
  private blobEntities: Map<string, BlobEntity> = new Map();
  private slimeEntities: Map<string, SlimeEntity> = new Map();
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

  private bgTileSprite!: Phaser.GameObjects.TileSprite;
  private activeChunks: Map<string, Phaser.GameObjects.Sprite[]> = new Map();
  private safeZoneCircle: Phaser.GameObjects.Arc | null = null;
  private safeZoneRing: Phaser.GameObjects.Arc | null = null;
  private safeZoneTimer: Phaser.Time.TimerEvent | null = null;
  private minimap!: Minimap;
  private backgroundMusic: Phaser.Sound.BaseSound | null = null;
  private toastyImage: Phaser.GameObjects.Image | null = null;
  private toastyHideTimer: Phaser.Time.TimerEvent | null = null;
  private toastyTween: Phaser.Tweens.Tween | null = null;
  private lastLocalToastyCount: number | null = null;
  private currentInstanceId: InstanceId | null = null;
  private pendingSafeZoneForLocalPlayer = false;
  private minimapAccumulatorMs = 0;

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

    this.createInfiniteBackground();
    this.minimap = new Minimap(this);

    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.startBackgroundMusic());
    } else {
      this.startBackgroundMusic();
    }

    // Connection is now initiated from NicknameModal after user enters nickname
    // Message handlers for 'welcome' are set up globally in BootScene
    // This handler is just for snapshot updates

    // Track connection attempts
    useGameStore.getState().setLastConnectionAttempt(Date.now());

    this.removeMessageHandler = onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case SERVER_MESSAGE_TYPES.WELCOME:
          this.localPlayerId = msg.id;
          this.nextInputSeq = 0;
          this.pendingInputs = [];
          this.inputSendAccumulatorMs = 0;
          this.lastSentInputState = null;
          this.lastLocalToastyCount = null;
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

  private createInfiniteBackground(): void {
    const cam = this.cameras.main;
    this.bgTileSprite = this.add.tileSprite(
      0,
      0,
      cam.width + 256,
      cam.height + 256,
      this.getBackgroundTextureKey(this.currentInstanceId)
    );
    this.bgTileSprite.setScrollFactor(0, 0);
    this.bgTileSprite.setOrigin(0.5, 0.5);
    this.bgTileSprite.setDepth(-1);
  }

  private createSafeZoneAt(
    x: number,
    y: number,
    radius: number = WORLD_SPAWN_SAFE_ZONE_RADIUS
  ): void {
    this.destroySafeZone();

    this.safeZoneCircle = this.add.circle(x, y, radius, 0x44ff44, 0.15);
    this.safeZoneCircle.setDepth(0);
    this.safeZoneCircle.setScrollFactor(1, 1);

    this.safeZoneRing = this.add.circle(x, y, radius);
    this.safeZoneRing.setStrokeStyle(3, 0x44ff44, 0.5);
    this.safeZoneRing.setDepth(0);
    this.safeZoneRing.setScrollFactor(1, 1);

    this.safeZoneTimer = this.time.delayedCall(SAFE_ZONE_VISUAL_DURATION_MS, () => {
      this.destroySafeZone();
    });
  }

  private destroySafeZone(): void {
    if (this.safeZoneCircle) {
      this.safeZoneCircle.destroy();
      this.safeZoneCircle = null;
    }
    if (this.safeZoneRing) {
      this.safeZoneRing.destroy();
      this.safeZoneRing = null;
    }
    if (this.safeZoneTimer) {
      this.safeZoneTimer.destroy();
      this.safeZoneTimer = null;
    }
  }

  private updateBackground(): void {
    const cam = this.cameras.main;
    this.bgTileSprite.x = cam.width / 2;
    this.bgTileSprite.y = cam.height / 2;
    this.bgTileSprite.tilePositionX = cam.scrollX;
    this.bgTileSprite.tilePositionY = cam.scrollY;
  }

  private getBackgroundTextureKey(instanceId: InstanceId | null): string {
    return instanceId === INSTANCE_IDS.PHASE2 ? 'stone_floor_bege_tile' : 'grass_tile';
  }

  private resetChunkDecor(): void {
    for (const sprites of this.activeChunks.values()) {
      for (const sprite of sprites) {
        sprite.destroy();
      }
    }
    this.activeChunks.clear();
  }

  private applyInstanceVisualTheme(instanceId: InstanceId): void {
    this.bgTileSprite.setTexture(this.getBackgroundTextureKey(instanceId));
    this.resetChunkDecor();
  }

  private getChunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private updateChunks(): void {
    const cam = this.cameras.main;
    const camCX = Math.floor((cam.scrollX + cam.width / 2) / CHUNK_SIZE);
    const camCY = Math.floor((cam.scrollY + cam.height / 2) / CHUNK_SIZE);

    const neededChunks = new Set<string>();

    for (let dx = -CHUNK_MARGIN; dx <= CHUNK_MARGIN; dx++) {
      for (let dy = -CHUNK_MARGIN; dy <= CHUNK_MARGIN; dy++) {
        const cx = camCX + dx;
        const cy = camCY + dy;
        const key = this.getChunkKey(cx, cy);
        neededChunks.add(key);

        if (!this.activeChunks.has(key)) {
          this.spawnChunkDecor(cx, cy, key);
        }
      }
    }

    for (const [key, sprites] of this.activeChunks) {
      if (!neededChunks.has(key)) {
        for (const s of sprites) s.destroy();
        this.activeChunks.delete(key);
      }
    }
  }

  private spawnChunkDecor(cx: number, cy: number, key: string): void {
    const sprites: Phaser.GameObjects.Sprite[] = [];
    const baseX = cx * CHUNK_SIZE;
    const baseY = cy * CHUNK_SIZE;

    if (this.currentInstanceId === INSTANCE_IDS.PHASE2) {
      const remainsCountRandom = seededRandom(cx, cy, PHASE2_REMAINS_COUNT_SEED);
      const remainsCountRange = PHASE2_REMAINS_MAX_PER_CHUNK - PHASE2_REMAINS_MIN_PER_CHUNK + 1;
      const remainsCount =
        PHASE2_REMAINS_MIN_PER_CHUNK + Math.floor(remainsCountRandom * remainsCountRange);

      for (let i = 0; i < remainsCount; i++) {
        const rx = seededRandom(cx, cy, PHASE2_REMAINS_POSITION_SEED + i * 2);
        const ry = seededRandom(cx, cy, PHASE2_REMAINS_POSITION_SEED + i * 2 + 1);
        const rv = seededRandom(cx, cy, PHASE2_REMAINS_VARIANT_SEED + i);
        const rs = seededRandom(cx, cy, PHASE2_REMAINS_VARIANT_SEED + 100 + i);
        const ra = seededRandom(cx, cy, PHASE2_REMAINS_VARIANT_SEED + 200 + i);

        const x = baseX + rx * CHUNK_SIZE;
        const y = baseY + ry * CHUNK_SIZE;
        const typeIndex = Math.min(
          PHASE2_REMAINS_KEYS.length - 1,
          Math.floor(rv * PHASE2_REMAINS_KEYS.length)
        );
        const remainsKey = PHASE2_REMAINS_KEYS[typeIndex];

        const sprite = this.add.sprite(x, y, remainsKey);
        sprite.setDepth(1);
        sprite.setAlpha(0.78);
        sprite.setScale(0.8 + rs * 0.35);
        sprite.setAngle((ra - 0.5) * 18);
        sprites.push(sprite);
      }

      this.activeChunks.set(key, sprites);
      return;
    }

    const count = Math.floor(seededRandom(cx, cy, 999) * PHASE1_DECOR_PER_CHUNK) + 2;

    for (let i = 0; i < count; i++) {
      const rx = seededRandom(cx, cy, i * 3);
      const ry = seededRandom(cx, cy, i * 3 + 1);
      const rf = seededRandom(cx, cy, i * 3 + 2);

      const x = baseX + rx * CHUNK_SIZE;
      const y = baseY + ry * CHUNK_SIZE;
      const frameIdx = Math.floor(rf * DECOR_FRAMES.length);
      const frame = DECOR_FRAMES[frameIdx];

      const sprite = this.add.sprite(x, y, 'decor', frame);
      sprite.setDepth(1);
      sprite.setAlpha(0.8);
      sprites.push(sprite);
    }

    const cutGrassCountRandom = seededRandom(cx, cy, CUT_GRASS_COUNT_SEED);
    const cutGrassCountRange = CUT_GRASS_MAX_PER_CHUNK - CUT_GRASS_MIN_PER_CHUNK + 1;
    const cutGrassCount =
      CUT_GRASS_MIN_PER_CHUNK + Math.floor(cutGrassCountRandom * cutGrassCountRange);

    for (let i = 0; i < cutGrassCount; i++) {
      const rx = seededRandom(cx, cy, CUT_GRASS_POSITION_SEED + i * 2);
      const ry = seededRandom(cx, cy, CUT_GRASS_POSITION_SEED + i * 2 + 1);

      const x = baseX + rx * CHUNK_SIZE;
      const y = baseY + ry * CHUNK_SIZE;

      const sprite = this.add.sprite(x, y, 'cut_grass_tile');
      sprite.setDepth(CUT_GRASS_DEPTH);
      sprites.push(sprite);
    }

    this.activeChunks.set(key, sprites);
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

    const players = msg.players;
    const enemies = msg.enemies;
    const bosses = msg.bosses || [];
    const drops = msg.drops || [];
    const portals = msg.portals || [];
    const hazards = msg.hazards || [];
    const iceZones = msg.iceZones || [];
    const aoeIndicators = msg.aoeIndicators || [];

    this.syncPlayers(players);
    this.syncBlobs(enemies);
    this.syncBosses(players, bosses, iceZones, aoeIndicators);
    this.syncDrops(drops);
    this.syncPortals(portals);
    this.syncHazards(hazards);
  }

  private handleInstanceChanged(nextInstanceId: InstanceId): void {
    this.currentInstanceId = nextInstanceId;
    this.applyInstanceVisualTheme(nextInstanceId);
    this.pendingSafeZoneForLocalPlayer = true;
    this.destroySafeZone();
    this.pendingInputs = [];
    this.inputSendAccumulatorMs = 0;
    this.lastSentInputState = null;
    this.minimapAccumulatorMs = 0;

    this.destroyEntityMap(this.playerEntities);
    this.destroyEntityMap(this.blobEntities);
    this.destroyEntityMap(this.slimeEntities);
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
          this.createSafeZoneAt(p.x, p.y);
          this.pendingSafeZoneForLocalPlayer = false;
        }

        this.reconcileLocalPrediction(p);
        this.handleLocalToastyCounter(p.toastyCount);
        if (this.previousLocalState === 'dead' && p.state !== 'dead') {
          this.createSafeZoneAt(p.x, p.y);
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
      this.lastLocalToastyCount = null;
      this.pendingSafeZoneForLocalPlayer = false;
      useGameStore.getState().setLocalPlayer(null);
    }
  }

  private syncBlobs(enemies: EnemySnapshot[]): void {
    const seenBlobIds = new Set<string>();
    const seenSlimeIds = new Set<string>();
    for (const b of enemies) {
      if (b.kind === 'blob') {
        seenBlobIds.add(b.id);
        let entity = this.blobEntities.get(b.id);
        if (!entity) {
          entity = new BlobEntity(this, b.x, b.y);
          this.blobEntities.set(b.id, entity);
        }
        entity.updateFromServer(b.x, b.y, b.hp, b.maxHp, b.state);
      } else {
        seenSlimeIds.add(b.id);
        let entity = this.slimeEntities.get(b.id);
        if (!entity) {
          entity = new SlimeEntity(this, b.x, b.y);
          this.slimeEntities.set(b.id, entity);
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
        entity =
          b.kind === 'gelehk'
            ? new BossGelehkEntity(this, b.x, b.y)
            : new BossDragonLordEntity(this, b.x, b.y);
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
    this.trimPendingInputs();

    this.updateBackground();
    this.updateChunks();

    if (!this.localPlayerId) return;

    const localEntity = this.playerEntities.get(this.localPlayerId);
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

    this.applyLocalPrediction(inputState, delta);

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
          this.bossEntities,
          this.localPlayerId
        );
      }
    }
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

  private trimPendingInputs(): void {
    if (this.pendingInputs.length > MAX_PENDING_INPUTS) {
      this.pendingInputs.splice(0, this.pendingInputs.length - MAX_PENDING_INPUTS);
    }
  }

  shutdown(): void {
    this.removeMessageHandler?.();
    this.removeErrorHandler?.();
    this.minimap?.destroy();
    this.destroySafeZone();
    this.pendingInputs = [];
    this.inputSendAccumulatorMs = 0;
    this.lastSentInputState = null;
    this.currentInstanceId = null;
    this.pendingSafeZoneForLocalPlayer = false;
    this.minimapAccumulatorMs = 0;

    this.destroyEntityMap(this.playerEntities);
    this.destroyEntityMap(this.blobEntities);
    this.destroyEntityMap(this.slimeEntities);
    this.destroyEntityMap(this.bossEntities);
    this.destroyEntityMap(this.dropEntities);
    this.destroyEntityMap(this.portalEntities);
    this.destroyEntityMap(this.hazardEntities);

    for (const sprites of this.activeChunks.values()) {
      for (const s of sprites) s.destroy();
    }
    this.activeChunks.clear();

    if (this.toastyTween) {
      this.toastyTween.stop();
      this.toastyTween = null;
    }
    if (this.toastyHideTimer) {
      this.toastyHideTimer.destroy();
      this.toastyHideTimer = null;
    }
    if (this.toastyImage) {
      this.toastyImage.destroy();
      this.toastyImage = null;
    }
    this.lastLocalToastyCount = null;

    this.bgTileSprite?.destroy();
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

  private applyLocalPrediction(input: InputState, dtMs: number): void {
    if (!this.localPlayerId) return;
    const entity = this.playerEntities.get(this.localPlayerId);
    if (!entity) return;
    if (entity.serverState === 'dead') return;

    let dx = 0;
    let dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;

    if (dx === 0 && dy === 0) return;

    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / len;
    const ny = dy / len;
    const dtSeconds = Math.min(dtMs, 50) / 1000;
    const speedPenalty = entity.serverState === 'attacking' ? PLAYER_ATTACK_SPEED_PENALTY : 1;

    entity.targetX += nx * PLAYER_PREDICT_SPEED * speedPenalty * dtSeconds;
    entity.targetY += ny * PLAYER_PREDICT_SPEED * speedPenalty * dtSeconds;
  }

  private handleLocalToastyCounter(toastyCount: number): void {
    if (this.lastLocalToastyCount === null) {
      this.lastLocalToastyCount = toastyCount;
      return;
    }

    if (toastyCount > this.lastLocalToastyCount) {
      this.playToastyEffect();
    }

    this.lastLocalToastyCount = toastyCount;
  }

  private playToastyEffect(): void {
    this.sound.play('toasty_sfx', { volume: TOASTY_SFX_VOLUME });

    const cam = this.cameras.main;
    const toastyVisibleX = cam.width - TOASTY_MARGIN_RIGHT;
    const toastyHiddenX = cam.width + TOASTY_OFFSCREEN_OFFSET_X;
    const toastyY = TOASTY_MARGIN_TOP;

    if (!this.toastyImage) {
      this.toastyImage = this.add.image(toastyHiddenX, toastyY, 'toasty');
      this.toastyImage.setScrollFactor(0, 0);
      this.toastyImage.setOrigin(1, 0);
      this.toastyImage.setDepth(TOASTY_DEPTH);
    }

    this.toastyImage.setPosition(toastyHiddenX, toastyY);
    this.toastyImage.setAlpha(1);
    this.toastyImage.setScale(TOASTY_SCALE);

    if (this.toastyTween) {
      this.toastyTween.stop();
      this.toastyTween = null;
    }

    if (this.toastyHideTimer) {
      this.toastyHideTimer.destroy();
      this.toastyHideTimer = null;
    }

    this.toastyTween = this.tweens.add({
      targets: this.toastyImage,
      x: toastyVisibleX,
      duration: TOASTY_SLIDE_IN_DURATION_MS,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.toastyTween = null;
      },
    });

    this.toastyHideTimer = this.time.delayedCall(TOASTY_HOLD_DURATION_MS, () => {
      if (!this.toastyImage) {
        this.toastyHideTimer = null;
        return;
      }

      this.toastyTween = this.tweens.add({
        targets: this.toastyImage,
        x: toastyHiddenX,
        duration: TOASTY_SLIDE_OUT_DURATION_MS,
        ease: 'Cubic.In',
        onComplete: () => {
          if (this.toastyImage) {
            this.toastyImage.destroy();
            this.toastyImage = null;
          }
          this.toastyTween = null;
        },
      });
      this.toastyHideTimer = null;
    });
  }

  private startBackgroundMusic(): void {
    if (!this.backgroundMusic) {
      this.backgroundMusic =
        this.sound.get('bg_music') ??
        this.sound.add('bg_music', {
          loop: true,
          volume: BACKGROUND_MUSIC_VOLUME,
        });
    }
    if (this.backgroundMusic && !this.backgroundMusic.isPlaying) {
      this.backgroundMusic.play();
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

  private reconcileLocalPrediction(serverPlayer: PlayerSnapshot): void {
    const nowMs = this.time.now;
    const acknowledged = serverPlayer.lastProcessedInputSeq;
    this.pendingInputs = this.pendingInputs.filter(
      (entry) =>
        entry.input.seq > acknowledged && nowMs - entry.sentAtMs <= MAX_PENDING_INPUT_AGE_MS
    );

    if (serverPlayer.state === 'dead') {
      this.pendingInputs = [];
      this.inputSendAccumulatorMs = 0;
    }

    let predictedX = serverPlayer.x;
    let predictedY = serverPlayer.y;

    for (const pending of this.pendingInputs) {
      let dx = 0;
      let dy = 0;
      if (pending.input.up) dy -= 1;
      if (pending.input.down) dy += 1;
      if (pending.input.left) dx -= 1;
      if (pending.input.right) dx += 1;

      if (dx === 0 && dy === 0) continue;

      const len = Math.sqrt(dx * dx + dy * dy);
      const dtSeconds = Math.min(pending.dtMs, 50) / 1000;
      predictedX += (dx / len) * PLAYER_PREDICT_SPEED * dtSeconds;
      predictedY += (dy / len) * PLAYER_PREDICT_SPEED * dtSeconds;
    }

    const localEntity = this.localPlayerId ? this.playerEntities.get(this.localPlayerId) : null;
    if (localEntity) {
      const errorX = predictedX - localEntity.targetX;
      const errorY = predictedY - localEntity.targetY;
      const errorDist = Math.sqrt(errorX * errorX + errorY * errorY);
      const shouldSnap = errorDist > RECONCILE_SNAP_DISTANCE;
      const shouldIgnoreTinyError = errorDist <= RECONCILE_DEADZONE_DISTANCE;

      const blendProgress = Phaser.Math.Clamp(errorDist / RECONCILE_BLEND_RAMP_DISTANCE, 0, 1);
      const blend = Phaser.Math.Linear(RECONCILE_MIN_BLEND, RECONCILE_MAX_BLEND, blendProgress);

      const correctedX = shouldSnap
        ? predictedX
        : shouldIgnoreTinyError
          ? localEntity.targetX
          : localEntity.targetX + (predictedX - localEntity.targetX) * blend;
      const correctedY = shouldSnap
        ? predictedY
        : shouldIgnoreTinyError
          ? localEntity.targetY
          : localEntity.targetY + (predictedY - localEntity.targetY) * blend;

      localEntity.updateFromServer(
        correctedX,
        correctedY,
        serverPlayer.hp,
        serverPlayer.maxHp,
        serverPlayer.state,
        serverPlayer.direction,
        serverPlayer.statusEffects
      );
    }
  }
}
