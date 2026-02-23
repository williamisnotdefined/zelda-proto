import Phaser from 'phaser';
import { BossGelehkEntity } from '../../entities/BossGelehk';
import { DropEntity } from '../../entities/DropEntity';
import { PlayerEntity } from '../../entities/Player';
import { SlimeEntity } from '../../entities/Slime';
import { onMessage, send } from '../../network/socket';
import { useGameStore } from '../../ui/store';

interface PlayerSnapshot {
  id: string;
  nickname: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
  direction: string;
}

interface SlimeSnapshot {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
}

interface BossSnapshot {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
  phase: number;
}

interface DropSnapshot {
  id: string;
  x: number;
  y: number;
  kind: string;
}

interface IceZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AoeIndicator {
  x: number;
  y: number;
  radius: number;
  timer: number;
}

const CHUNK_SIZE = 512;
const CHUNK_MARGIN = 1;
const DECOR_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19];
const DECOR_PER_CHUNK = 6;

function seededRandom(cx: number, cy: number, index: number): number {
  let h = (cx * 374761393 + cy * 668265263 + index * 1013904223) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  h = (h ^ (h >> 16)) | 0;
  return (h >>> 0) / 4294967296;
}

export class WorldScene extends Phaser.Scene {
  private localPlayerId: string | null = null;
  private playerEntities: Map<string, PlayerEntity> = new Map();
  private slimeEntities: Map<string, SlimeEntity> = new Map();
  private bossEntities: Map<string, BossGelehkEntity> = new Map();
  private dropEntities: Map<string, DropEntity> = new Map();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private prevAttack = false;
  private removeMessageHandler: (() => void) | null = null;

  private bgTileSprite!: Phaser.GameObjects.TileSprite;
  private activeChunks: Map<string, Phaser.GameObjects.Sprite[]> = new Map();
  private bossArenas: Map<
    string,
    { circle: Phaser.GameObjects.Arc; ring: Phaser.GameObjects.Arc }
  > = new Map();
  private safeZoneCircle: Phaser.GameObjects.Arc | null = null;
  private safeZoneRing: Phaser.GameObjects.Arc | null = null;
  private safeZoneTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super({ key: 'WorldScene' });
  }

  create(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.createInfiniteBackground();

    // Connection is now initiated from NicknameModal after user enters nickname

    this.removeMessageHandler = onMessage((msg) => {
      switch (msg.type) {
        case 'welcome':
          this.localPlayerId = msg.id as string;
          useGameStore.getState().setLocalPlayerId(msg.id as string);
          useGameStore.getState().setConnected(true);
          // Create safe zone after player joins
          this.createSafeZone();
          break;
        case 'snapshot':
          this.handleSnapshot(msg);
          break;
      }
    });
  }

  private createInfiniteBackground(): void {
    const cam = this.cameras.main;
    this.bgTileSprite = this.add.tileSprite(0, 0, cam.width + 256, cam.height + 256, 'grass_tile');
    this.bgTileSprite.setDepth(-1);
  }

  private createSafeZone(): void {
    // Don't create if already exists
    if (this.safeZoneCircle || this.safeZoneRing) return;

    const spawnX = 200;
    const spawnY = 200;
    const radius = 150;

    // Semi-transparent green circle for the safe zone
    this.safeZoneCircle = this.add.circle(spawnX, spawnY, radius, 0x44ff44, 0.15);
    this.safeZoneCircle.setDepth(0);
    this.safeZoneCircle.setScrollFactor(1, 1); // Ensure it scrolls with the world

    // Green ring border
    this.safeZoneRing = this.add.circle(spawnX, spawnY, radius);
    this.safeZoneRing.setStrokeStyle(3, 0x44ff44, 0.5);
    this.safeZoneRing.setDepth(0);
    this.safeZoneRing.setScrollFactor(1, 1); // Ensure it scrolls with the world

    // Hide the safe zone after 3 seconds
    this.safeZoneTimer = this.time.delayedCall(3000, () => {
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

  private ensureBossArena(id: string, x: number, y: number): void {
    if (this.bossArenas.has(id)) return;
    const circle = this.add.circle(x, y, 200, 0x2a5a2a, 0.3);
    circle.setDepth(0);
    const ring = this.add.circle(x, y, 200);
    ring.setStrokeStyle(2, 0x998866, 0.4);
    ring.setDepth(0);
    this.bossArenas.set(id, { circle, ring });
  }

  private removeBossArena(id: string): void {
    const arena = this.bossArenas.get(id);
    if (arena) {
      arena.circle.destroy();
      arena.ring.destroy();
      this.bossArenas.delete(id);
    }
  }

  private updateBackground(): void {
    const cam = this.cameras.main;
    this.bgTileSprite.x = cam.scrollX + cam.width / 2;
    this.bgTileSprite.y = cam.scrollY + cam.height / 2;
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

    const count = Math.floor(seededRandom(cx, cy, 999) * DECOR_PER_CHUNK) + 2;

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

    this.activeChunks.set(key, sprites);
  }

  private handleSnapshot(msg: Record<string, unknown>): void {
    const players = msg.players as PlayerSnapshot[];
    const enemies = msg.enemies as SlimeSnapshot[];
    const bosses = (msg.bosses as BossSnapshot[]) || [];
    const drops = (msg.drops as DropSnapshot[]) || [];
    const iceZones = (msg.iceZones as IceZone[]) || [];
    const aoeIndicators = (msg.aoeIndicators as AoeIndicator[]) || [];

    useGameStore.getState().setPlayerCount(players.length);

    // --- Players ---
    const seenPlayerIds = new Set<string>();
    for (const p of players) {
      seenPlayerIds.add(p.id);
      let entity = this.playerEntities.get(p.id);
      if (!entity) {
        entity = new PlayerEntity(this, p.x, p.y, p.id === this.localPlayerId, p.nickname);
        this.playerEntities.set(p.id, entity);
      }
      entity.updateFromServer(p.x, p.y, p.hp, p.maxHp, p.state, p.direction);

      if (p.id === this.localPlayerId) {
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
      }
    }

    for (const [id, entity] of this.playerEntities) {
      if (!seenPlayerIds.has(id)) {
        entity.destroy();
        this.playerEntities.delete(id);
      }
    }

    // --- Slimes ---
    const seenSlimeIds = new Set<string>();
    for (const s of enemies) {
      seenSlimeIds.add(s.id);
      let entity = this.slimeEntities.get(s.id);
      if (!entity) {
        entity = new SlimeEntity(this, s.x, s.y);
        this.slimeEntities.set(s.id, entity);
      }
      entity.updateFromServer(s.x, s.y, s.hp, s.maxHp, s.state);
    }

    for (const [id, entity] of this.slimeEntities) {
      if (!seenSlimeIds.has(id)) {
        entity.destroy();
        this.slimeEntities.delete(id);
      }
    }

    // --- Bosses ---
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
        entity = new BossGelehkEntity(this, b.x, b.y);
        this.bossEntities.set(b.id, entity);
        this.ensureBossArena(b.id, b.x, b.y);
      }
      entity.updateFromServer(b.x, b.y, b.hp, b.maxHp, b.state, b.phase, iceZones, aoeIndicators);

      if (localPlayer) {
        const dx = localPlayer.x - b.x;
        const dy = localPlayer.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestBossDist) {
          nearestBossDist = dist;
          nearestBoss = b;
        }
      }
    }

    for (const [id, entity] of this.bossEntities) {
      if (!seenBossIds.has(id)) {
        entity.destroy();
        this.bossEntities.delete(id);
        this.removeBossArena(id);
      }
    }

    if (nearestBoss && nearestBoss.state !== 'dead') {
      useGameStore.getState().setBoss({
        id: nearestBoss.id,
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

    // --- Drops ---
    const seenDropIds = new Set<string>();
    for (const d of drops) {
      seenDropIds.add(d.id);
      let entity = this.dropEntities.get(d.id);
      if (!entity) {
        entity = new DropEntity(this, d.x, d.y, d.kind);
        this.dropEntities.set(d.id, entity);
      }
      entity.updatePosition(d.x, d.y);
    }

    for (const [id, entity] of this.dropEntities) {
      if (!seenDropIds.has(id)) {
        entity.destroy();
        this.dropEntities.delete(id);
      }
    }
  }

  update(_time: number, delta: number): void {
    if (!this.localPlayerId) return;

    const attack = this.attackKey.isDown && !this.prevAttack;
    this.prevAttack = this.attackKey.isDown;

    send({
      type: 'input',
      up: this.cursors.up.isDown,
      down: this.cursors.down.isDown,
      left: this.cursors.left.isDown,
      right: this.cursors.right.isDown,
      attack,
    });

    for (const entity of this.playerEntities.values()) {
      entity.update(this, delta);
    }

    for (const entity of this.slimeEntities.values()) {
      entity.update();
    }

    for (const entity of this.bossEntities.values()) {
      entity.update();
    }

    const localEntity = this.playerEntities.get(this.localPlayerId);
    if (localEntity) {
      this.cameras.main.centerOn(localEntity.sprite.x, localEntity.sprite.y);
    }

    this.updateBackground();
    this.updateChunks();
  }

  shutdown(): void {
    this.removeMessageHandler?.();
  }
}
