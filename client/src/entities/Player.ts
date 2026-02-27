import Phaser from 'phaser';

const LERP_SPEED = 0.3;
const INTERP_DURATION = 50; // ms – smoothing window (~3 server ticks)
const SNAP_THRESHOLD = 200; // px – teleport/respawn threshold
// Offset the sprite DOWN so the character body visually centers on the server hitbox
const SPRITE_Y_OFFSET = -16;


export class PlayerEntity {
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  isLocal: boolean;
  targetX: number;
  targetY: number;
  serverState: string;
  serverDirection: string;
  hp: number;
  maxHp: number;
  nickname: string;

  private currentAnimKey: string;
  private deathPlayed: boolean;

  // Interpolation fields for local player
  private prevServerX: number;
  private prevServerY: number;
  private interpElapsed: number;

  constructor(scene: Phaser.Scene, x: number, y: number, isLocal: boolean, nickname: string) {
    this.isLocal = isLocal;
    this.targetX = x;
    this.targetY = y;
    this.serverState = 'idle';
    this.serverDirection = 'down';
    this.hp = 100;
    this.maxHp = 100;
    this.currentAnimKey = '';
    this.deathPlayed = false;
    this.nickname = nickname;
    this.prevServerX = x;
    this.prevServerY = y;
    this.interpElapsed = INTERP_DURATION;

    this.sprite = scene.add.sprite(x, y + SPRITE_Y_OFFSET, 'player');
    this.sprite.setScale(2);
    this.sprite.setDepth(10);

    this.hpBarBg = scene.add.rectangle(x, y - 26, 32, 4, 0x333333);
    this.hpBarBg.setDepth(11);

    this.hpBar = scene.add.rectangle(x, y - 26, 32, 4, 0x44ff44);
    this.hpBar.setDepth(12);

    const label = isLocal ? 'YOU' : nickname;
    this.nameText = scene.add.text(x, y - 34, label, {
      fontSize: '10px',
      color: '#ffffff',
      align: 'center',
    });
    this.nameText.setOrigin(0.5, 1);
    this.nameText.setDepth(13);

    if (isLocal) {
      this.sprite.setTint(0xaaffaa);
    }

  }

  updateFromServer(
    x: number,
    y: number,
    hp: number,
    maxHp: number,
    state: string,
    direction: string
  ): void {
    // For local player lerp: start interpolating from current visual position
    if (this.isLocal) {
      const dx = x - this.sprite.x;
      // Compare against server position (strip the visual offset)
      const dy = y - (this.sprite.y - SPRITE_Y_OFFSET);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > SNAP_THRESHOLD) {
        // Teleport / respawn – snap immediately
        this.prevServerX = x;
        this.prevServerY = y;
        this.interpElapsed = INTERP_DURATION;
      } else {
        this.prevServerX = this.sprite.x;
        // Store server position without the visual offset so the formula doesn't double-add it
        this.prevServerY = this.sprite.y - SPRITE_Y_OFFSET;
        this.interpElapsed = 0;
      }
    }
    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.serverDirection = direction;
  }

  update(_scene: Phaser.Scene, dt: number): void {
    if (this.isLocal) {
      // Time-based interpolation between last visual pos and server target
      this.interpElapsed += dt;
      const t = Math.min(this.interpElapsed / INTERP_DURATION, 1);
      this.sprite.x = this.prevServerX + (this.targetX - this.prevServerX) * t;
      this.sprite.y = this.prevServerY + (this.targetY - this.prevServerY) * t + SPRITE_Y_OFFSET;
    } else {
      // Remote players: time-based exponential lerp (frame-rate independent)
      const factor = 1 - Math.pow(1 - LERP_SPEED, dt / 16.667);
      this.sprite.x += (this.targetX - this.sprite.x) * factor;
      this.sprite.y += (this.targetY + SPRITE_Y_OFFSET - this.sprite.y) * factor;
    }

    this.hpBarBg.x = this.sprite.x;
    this.hpBarBg.y = this.sprite.y - 26;
    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBar.width = 32 * hpRatio;
    this.hpBar.x = this.sprite.x - (32 - this.hpBar.width) / 2;
    this.hpBar.y = this.sprite.y - 26;
    this.hpBar.fillColor = hpRatio > 0.5 ? 0x44ff44 : hpRatio > 0.25 ? 0xffaa00 : 0xff4444;

    this.nameText.x = this.sprite.x;
    this.nameText.y = this.sprite.y - 32;

    this.updateAnimation();
  }

  private updateAnimation(): void {
    const dir = this.serverDirection;
    const state = this.serverState;

    let animKey: string;
    let flipX = false;

    if (state === 'dead') {
      animKey = 'player_death';
      if (!this.deathPlayed) {
        this.sprite.setAlpha(1);
        this.sprite.play(animKey);
        this.deathPlayed = true;
        this.currentAnimKey = animKey;
      }
      return;
    }

    this.deathPlayed = false;
    this.sprite.setAlpha(1);

    const dirSuffix = dir === 'left' ? 'right' : dir;
    flipX = dir === 'left';

    if (state === 'attacking') {
      animKey = `player_attack_${dirSuffix}`;
      // Don't restart attack anim if already playing one
      if (this.currentAnimKey.startsWith('player_attack_') && this.sprite.anims.isPlaying) {
        this.sprite.setFlipX(flipX);
        return;
      }
    } else if (state === 'moving') {
      animKey = `player_move_${dirSuffix}`;
    } else {
      animKey = `player_idle_${dirSuffix}`;
    }

    this.sprite.setFlipX(flipX);

    if (this.currentAnimKey !== animKey) {
      this.sprite.play(animKey);
      this.currentAnimKey = animKey;
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameText.destroy();
    this.hpBar.destroy();
    this.hpBarBg.destroy();
  }
}
