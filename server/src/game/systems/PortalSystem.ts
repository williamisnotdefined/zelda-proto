import { nanoid } from 'nanoid';
import { BossGelehk } from '../../entities/BossGelehk.js';
import { Player } from '../../entities/Player.js';
import type { InstanceId, PortalKind } from '@gelehka/shared';
import type { BossActorEntity, Portal, PortalConfig, PortalTransferRequest } from '../World.js';

const PORTAL_RADIUS = 42;
const PORTAL_TRANSFER_COOLDOWN_MS = 600;

export interface BossDeathPortalConfig {
  kind: PortalKind;
  toInstanceId: InstanceId;
  targetX: number;
  targetY: number;
  activationDelayMs?: number;
  durationMs: number;
}

export class PortalSystem {
  private transferRequests: PortalTransferRequest[] = [];
  private portalOverlapsByPlayer: Map<string, Set<string>> = new Map();

  spawnPortal(portals: Map<string, Portal>, config: PortalConfig, now: number): Portal {
    const id = `portal_${nanoid(8)}`;
    const portal: Portal = {
      id,
      x: config.x,
      y: config.y,
      kind: config.kind,
      sourceBossId: config.sourceBossId,
      toInstanceId: config.toInstanceId,
      targetX: config.targetX,
      targetY: config.targetY,
      activeAtMs: now + (config.activationDelayMs ?? 0),
      expiresAtMs: config.durationMs !== undefined ? now + config.durationMs : null,
    };
    portals.set(id, portal);
    return portal;
  }

  update(
    now: number,
    players: Map<string, Player>,
    portals: Map<string, Portal>,
    bosses: Map<string, BossActorEntity>,
    onBossDeathPortal?: BossDeathPortalConfig
  ): void {
    this.handleBossDeathPortals(now, portals, bosses, onBossDeathPortal);
    this.updatePortals(now, portals);
    this.resolvePortalTransfers(now, players, portals);
  }

  removePlayer(id: string): void {
    this.portalOverlapsByPlayer.delete(id);
  }

  consumeTransferRequests(): PortalTransferRequest[] {
    const out = this.transferRequests;
    this.transferRequests = [];
    return out;
  }

  private handleBossDeathPortals(
    now: number,
    portals: Map<string, Portal>,
    bosses: Map<string, BossActorEntity>,
    onBossDeathPortal?: BossDeathPortalConfig
  ): void {
    if (!onBossDeathPortal) return;

    for (const [portalId, portal] of portals) {
      if (portal.kind !== onBossDeathPortal.kind) continue;
      if (!portal.sourceBossId) {
        portals.delete(portalId);
        continue;
      }
      const sourceBoss = bosses.get(portal.sourceBossId);
      if (!(sourceBoss instanceof BossGelehk) || sourceBoss.state !== 'dead') {
        portals.delete(portalId);
      }
    }

    for (const boss of bosses.values()) {
      if (!(boss instanceof BossGelehk)) continue;
      if (boss.state !== 'dead' || boss.deathHandled) continue;
      boss.deathHandled = true;
      this.spawnPortal(
        portals,
        {
          kind: onBossDeathPortal.kind,
          x: boss.x,
          y: boss.y,
          sourceBossId: boss.id,
          toInstanceId: onBossDeathPortal.toInstanceId,
          targetX: onBossDeathPortal.targetX,
          targetY: onBossDeathPortal.targetY,
          activationDelayMs: onBossDeathPortal.activationDelayMs,
          durationMs: onBossDeathPortal.durationMs,
        },
        now
      );
    }
  }

  private updatePortals(now: number, portals: Map<string, Portal>): void {
    for (const [portalId, portal] of portals) {
      if (portal.expiresAtMs !== null && now >= portal.expiresAtMs) {
        portals.delete(portalId);
      }
    }
  }

  private resolvePortalTransfers(
    now: number,
    players: Map<string, Player>,
    portals: Map<string, Portal>
  ): void {
    const portalRadiusSq = PORTAL_RADIUS * PORTAL_RADIUS;
    for (const player of players.values()) {
      const prevOverlaps = this.portalOverlapsByPlayer.get(player.id) ?? new Set<string>();
      const currOverlaps = new Set<string>();

      if (player.state !== 'dead') {
        for (const portal of portals.values()) {
          if (now < portal.activeAtMs) continue;
          const dx = player.x - portal.x;
          const dy = player.y - portal.y;
          const overlapping = dx * dx + dy * dy <= portalRadiusSq;
          if (!overlapping) continue;

          currOverlaps.add(portal.id);

          const justEntered = !prevOverlaps.has(portal.id);
          if (!justEntered) continue;
          if (player.phaseTransferCooldownMs > 0) continue;

          player.markPhaseTransferCooldown(PORTAL_TRANSFER_COOLDOWN_MS);
          this.transferRequests.push({
            playerId: player.id,
            toInstanceId: portal.toInstanceId,
            targetX: portal.targetX,
            targetY: portal.targetY,
          });
          break;
        }
      }

      this.portalOverlapsByPlayer.set(player.id, currOverlaps);
    }
  }
}
