import { getExponentialInterpolationFactor } from '@/game-core/interpolation';
import type { BossWaveIndicator, PlayerStatusSnapshot } from '@/shared';
import Phaser from 'phaser';
import { PlayerAnimationController } from './player/PlayerAnimationController';
import { PlayerAttackTelegraph } from './player/PlayerAttackTelegraph';
import { PlayerPresentation } from './player/PlayerPresentation';
import { PlayerStatusOverlays } from './player/PlayerStatusOverlays';
import { PlayerWaveIndicator } from './player/PlayerWaveIndicator';
import {
  LOCAL_LERP_BASE,
  MAX_LERP_DT_MS,
  REMOTE_LERP_BASE,
  SNAP_THRESHOLD,
  SPRITE_Y_OFFSET,
} from './player/playerVisualConfig';

export class PlayerEntity {
  sprite: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  nicknameLabel: Phaser.GameObjects.Text;
  isLocal: boolean;
  targetX: number;
  targetY: number;
  serverState: string;
  serverDirection: string;
  hp: number;
  maxHp: number;
  nickname: string;
  statusEffects: PlayerStatusSnapshot;

  private readonly presentation: PlayerPresentation;
  private readonly statusOverlays: PlayerStatusOverlays;
  private readonly attackTelegraph: PlayerAttackTelegraph;
  private readonly animationController: PlayerAnimationController;
  private readonly waveIndicator: PlayerWaveIndicator;

  constructor(scene: Phaser.Scene, x: number, y: number, isLocal: boolean, nickname: string) {
    this.isLocal = isLocal;
    this.targetX = x;
    this.targetY = y;
    this.serverState = 'idle';
    this.serverDirection = 'down';
    this.hp = 100;
    this.maxHp = 100;
    this.nickname = nickname;
    this.statusEffects = {};
    this.animationController = new PlayerAnimationController();
    this.sprite = scene.add.sprite(x, y + SPRITE_Y_OFFSET, 'player');
    this.sprite.setScale(2);
    this.sprite.setDepth(10);
    this.presentation = new PlayerPresentation(scene, x, y, nickname);
    this.statusOverlays = new PlayerStatusOverlays(scene, x, y);
    this.attackTelegraph = new PlayerAttackTelegraph(scene, x, y);
    this.waveIndicator = new PlayerWaveIndicator(scene);
    this.hpBar = this.presentation.hpBar;
    this.hpBarBg = this.presentation.hpBarBg;
    this.nicknameLabel = this.presentation.nicknameLabel;

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
    direction: string,
    statusEffects: PlayerStatusSnapshot = {}
  ): void {
    const targetSpriteY = y + SPRITE_Y_OFFSET;

    if (this.isLocal) {
      const dx = x - this.sprite.x;
      const dy = targetSpriteY - this.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > SNAP_THRESHOLD) {
        this.sprite.x = x;
        this.sprite.y = targetSpriteY;
      }
    }

    this.targetX = x;
    this.targetY = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.serverState = state;
    this.serverDirection = direction;
    this.statusEffects = statusEffects;
  }

  update(dt: number): void {
    const dtMs = Math.min(dt, MAX_LERP_DT_MS);
    const lerpBase = this.isLocal ? LOCAL_LERP_BASE : REMOTE_LERP_BASE;
    const factor = getExponentialInterpolationFactor(lerpBase, dtMs);
    this.sprite.x += (this.targetX - this.sprite.x) * factor;
    this.sprite.y += (this.targetY + SPRITE_Y_OFFSET - this.sprite.y) * factor;

    this.presentation.sync(
      this.sprite.x,
      this.sprite.y,
      this.hp,
      this.maxHp,
      this.serverState !== 'dead'
    );
    this.statusOverlays.sync(this.sprite.x, this.sprite.y, this.statusEffects);
    this.attackTelegraph.sync(
      this.sprite.x,
      this.sprite.y - SPRITE_Y_OFFSET,
      this.serverState,
      this.serverDirection
    );
    this.waveIndicator.update(dt);
    this.animationController.update(this.sprite, this.serverState, this.serverDirection);
  }

  syncWaveIndicator(
    wave: Pick<BossWaveIndicator, 'x' | 'y' | 'radius' | 'state' | 'kind'> | null
  ): void {
    this.waveIndicator.sync(wave);
  }

  setNickname(nickname: string): void {
    if (this.nickname === nickname) return;
    this.nickname = nickname;
    this.presentation.setNickname(nickname);
  }

  destroy(): void {
    this.sprite.destroy();
    this.presentation.destroy();
    this.attackTelegraph.destroy();
    this.statusOverlays.destroy();
    this.waveIndicator.destroy();
  }
}
