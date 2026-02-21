import { nanoid } from 'nanoid';
import { InputMessage, SnapshotMessage, DropSnapshot } from '../network/MessageTypes.js';
import { Player } from './Player.js';
import { Slime } from './Slime.js';
import { BossGelehk, ICE_ZONE_SLOW } from './BossGelehk.js';
import { resolvePlayerAttacks, resolveEnemyContactDamage } from './Combat.js';

export const MAP_WIDTH = 1280;
export const MAP_HEIGHT = 1280;
const PLAYER_SPAWN_X = 200;
const PLAYER_SPAWN_Y = 200;
const PLAYER_RESPAWN_TIME = 3000;

const SLIME_SPAWN_POSITIONS = [
  { x: 400, y: 300 },
  { x: 500, y: 500 },
  { x: 700, y: 200 },
  { x: 300, y: 700 },
  { x: 850, y: 400 },
  { x: 600, y: 800 },
  { x: 900, y: 600 },
  { x: 150, y: 500 },
];

export interface Drop {
  id: string;
  x: number;
  y: number;
  kind: 'heal';
}

export class World {
  players: Map<string, Player>;
  slimes: Map<string, Slime>;
  boss: BossGelehk;
  drops: Map<string, Drop>;

  constructor() {
    this.players = new Map();
    this.slimes = new Map();
    this.boss = new BossGelehk();
    this.drops = new Map();

    for (const pos of SLIME_SPAWN_POSITIONS) {
      const id = `slime_${nanoid(8)}`;
      this.slimes.set(id, new Slime(id, pos.x, pos.y));
    }
  }

  addPlayer(id: string): Player {
    const player = new Player(id, PLAYER_SPAWN_X, PLAYER_SPAWN_Y);
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  handleInput(playerId: string, input: InputMessage): void {
    const player = this.players.get(playerId);
    if (player) {
      player.applyInput(input);
    }
  }

  update(dt: number): void {
    for (const player of this.players.values()) {
      let speedMult = 1;
      if (this.boss.active && this.boss.state !== 'dead' && this.boss.isInIceZone(player.x, player.y)) {
        speedMult = ICE_ZONE_SLOW;
      }
      player.update(dt, MAP_WIDTH, MAP_HEIGHT, speedMult);
    }

    for (const player of this.players.values()) {
      if (player.state === 'dead') {
        player.respawnTimer += dt;
        if (player.respawnTimer >= PLAYER_RESPAWN_TIME) {
          player.respawn(PLAYER_SPAWN_X, PLAYER_SPAWN_Y);
        }
      }
    }

    for (const slime of this.slimes.values()) {
      slime.update(dt, this.players);
      slime.tryRespawn(dt);
    }

    this.boss.update(dt, this.players, (x, y, count) => {
      this.spawnMinions(x, y, count);
    });

    resolvePlayerAttacks(this.players, this.slimes, this.boss);
    resolveEnemyContactDamage(this.slimes, this.players);

    this.handleDropPickup();
    this.handleEnemyDrops();
  }

  private spawnMinions(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const id = `minion_${nanoid(8)}`;
      const angle = (Math.PI * 2 * i) / count;
      const sx = x + Math.cos(angle) * 60;
      const sy = y + Math.sin(angle) * 60;
      this.slimes.set(id, new Slime(id, sx, sy));
    }
  }

  private handleEnemyDrops(): void {
    for (const slime of this.slimes.values()) {
      if (slime.state === 'dead' && slime.respawnTimer >= 9900) {
        if (Math.random() < 0.5) {
          const dropId = `drop_${nanoid(8)}`;
          this.drops.set(dropId, {
            id: dropId,
            x: slime.x,
            y: slime.y,
            kind: 'heal',
          });
        }
      }
    }
  }

  private handleDropPickup(): void {
    for (const [dropId, drop] of this.drops) {
      for (const player of this.players.values()) {
        if (player.state === 'dead') continue;
        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        if (Math.sqrt(dx * dx + dy * dy) < 24) {
          if (drop.kind === 'heal') {
            player.hp = Math.min(player.hp + 20, player.maxHp);
          }
          this.drops.delete(dropId);
          break;
        }
      }
    }
  }

  getSnapshot(): SnapshotMessage {
    return {
      type: 'snapshot',
      players: Array.from(this.players.values()).map((p) => p.toSnapshot()),
      enemies: Array.from(this.slimes.values())
        .filter((s) => s.state !== 'dead')
        .map((s) => s.toSnapshot()),
      boss: this.boss.active ? this.boss.toSnapshot() : null,
      iceZones: this.boss.iceZones,
      aoeIndicators: this.boss.aoeIndicators.map((a) => ({
        x: Math.round(a.x),
        y: Math.round(a.y),
        radius: a.radius,
        timer: Math.round(a.timer),
      })),
      drops: Array.from(this.drops.values()),
    };
  }
}
