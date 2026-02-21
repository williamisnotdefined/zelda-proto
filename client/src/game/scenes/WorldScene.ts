import Phaser from 'phaser';
import { connect, send, onMessage } from '../../network/socket';
import { PlayerEntity } from '../../entities/Player';
import { SlimeEntity } from '../../entities/Slime';
import { BossGelehkEntity } from '../../entities/BossGelehk';
import { DropEntity } from '../../entities/DropEntity';
import { useGameStore } from '../../ui/store';

interface PlayerSnapshot {
  id: string;
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

export class WorldScene extends Phaser.Scene {
  private localPlayerId: string | null = null;
  private playerEntities: Map<string, PlayerEntity> = new Map();
  private slimeEntities: Map<string, SlimeEntity> = new Map();
  private bossEntity: BossGelehkEntity | null = null;
  private dropEntities: Map<string, DropEntity> = new Map();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private mapWidth = 1280;
  private mapHeight = 1280;
  private prevAttack = false;
  private removeMessageHandler: (() => void) | null = null;

  constructor() {
    super({ key: 'WorldScene' });
  }

  create(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.drawMap();

    connect();

    this.removeMessageHandler = onMessage((msg) => {
      switch (msg.type) {
        case 'welcome':
          this.localPlayerId = msg.id as string;
          this.mapWidth = (msg.mapWidth as number) || 1280;
          this.mapHeight = (msg.mapHeight as number) || 1280;
          useGameStore.getState().setLocalPlayerId(msg.id as string);
          useGameStore.getState().setConnected(true);
          break;
        case 'snapshot':
          this.handleSnapshot(msg);
          break;
      }
    });
  }

  private drawMap(): void {
    let hasMap = false;
    try {
      const map = this.make.tilemap({ key: 'map' });
      if (map && map.tilesets.length > 0) {
        const tileset = map.addTilesetImage('grass', 'grass');
        if (tileset) {
          map.createLayer('ground', tileset);
          const obstacleLayer = map.createLayer('obstacles', tileset);
          if (obstacleLayer) {
            obstacleLayer.setDepth(1);
          }
          hasMap = true;
        }
      }
    } catch {
      // tilemap not available, use fallback
    }

    if (!hasMap) {
      const tileSize = 32;
      const cols = Math.ceil(this.mapWidth / tileSize);
      const rows = Math.ceil(this.mapHeight / tileSize);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const shade = ((r + c) % 2 === 0) ? 0x3a7d44 : 0x357a3f;
          this.add.rectangle(
            c * tileSize + tileSize / 2,
            r * tileSize + tileSize / 2,
            tileSize,
            tileSize,
            shade
          ).setDepth(0);
        }
      }

      const obstacles = [
        { x: 160, y: 400, w: 64, h: 64 },
        { x: 400, y: 160, w: 96, h: 32 },
        { x: 800, y: 300, w: 32, h: 96 },
        { x: 1000, y: 800, w: 64, h: 64 },
        { x: 300, y: 1000, w: 128, h: 32 },
      ];

      for (const ob of obstacles) {
        this.add.rectangle(ob.x, ob.y, ob.w, ob.h, 0x665544).setDepth(1);
      }

      // Boss arena marker
      this.add.circle(640, 640, 200, 0x444466, 0.15).setDepth(0);
      this.add.circle(640, 640, 200).setStrokeStyle(2, 0x6666aa, 0.3).setDepth(0);
    }

    this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight);
  }

  private handleSnapshot(msg: Record<string, unknown>): void {
    const players = msg.players as PlayerSnapshot[];
    const enemies = msg.enemies as SlimeSnapshot[];
    const boss = msg.boss as BossSnapshot | null;
    const drops = (msg.drops as DropSnapshot[]) || [];
    const iceZones = (msg.iceZones as IceZone[]) || [];
    const aoeIndicators = (msg.aoeIndicators as AoeIndicator[]) || [];

    useGameStore.getState().setPlayerCount(players.length);

    const seenPlayerIds = new Set<string>();
    for (const p of players) {
      seenPlayerIds.add(p.id);
      let entity = this.playerEntities.get(p.id);
      if (!entity) {
        entity = new PlayerEntity(this, p.x, p.y, p.id === this.localPlayerId, p.id);
        this.playerEntities.set(p.id, entity);
      }
      entity.updateFromServer(p.x, p.y, p.hp, p.maxHp, p.state, p.direction);

      if (p.id === this.localPlayerId) {
        useGameStore.getState().setLocalPlayer({
          id: p.id,
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

    if (boss) {
      if (!this.bossEntity) {
        this.bossEntity = new BossGelehkEntity(this, boss.x, boss.y);
      }
      this.bossEntity.updateFromServer(
        boss.x, boss.y, boss.hp, boss.maxHp,
        boss.state, boss.phase, iceZones, aoeIndicators
      );
      useGameStore.getState().setBoss({
        id: boss.id,
        x: boss.x,
        y: boss.y,
        hp: boss.hp,
        maxHp: boss.maxHp,
        state: boss.state,
        phase: boss.phase,
      });
    } else {
      if (this.bossEntity) {
        this.bossEntity.destroy();
        this.bossEntity = null;
      }
      useGameStore.getState().setBoss(null);
    }

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

    if (this.bossEntity) {
      this.bossEntity.update();
    }

    const localEntity = this.playerEntities.get(this.localPlayerId);
    if (localEntity) {
      this.cameras.main.centerOn(localEntity.sprite.x, localEntity.sprite.y);
    }
  }

  shutdown(): void {
    this.removeMessageHandler?.();
  }
}
