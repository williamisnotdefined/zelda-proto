import { nanoid } from 'nanoid';
import { Player } from '../../entities/Player.js';
import type { BossKind, InstanceId, PortalKind } from '@gelehka/shared';
import type { BossActorEntity, Portal, PortalConfig, PortalTransferRequest } from '../World.js';

const PORTAL_RADIUS = 42;
const PORTAL_TRANSFER_COOLDOWN_MS = 600;

type PlayerRadiusQuery = (
  x: number,
  y: number,
  radius: number,
  callback: (player: Player) => void
) => void;

export interface BossDeathPortalConfig {
  kind: PortalKind;
  sourceBossKinds?: readonly BossKind[];
  toInstanceId: InstanceId;
  targetX: number;
  targetY: number;
  activationDelayMs?: number;
  durationMs: number;
}

export class PortalSystem {
  private transferRequests: PortalTransferRequest[] = [];
  private portalOverlapsByPlayer: Map<string, Set<string>> = new Map();
  private handledBossDeathIds: Set<string> = new Set();

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
    forEachPlayerInRadius: PlayerRadiusQuery,
    onBossDeathPortal?: BossDeathPortalConfig
  ): void {
    this.handleBossDeathPortals(now, portals, bosses, onBossDeathPortal);
    this.updatePortals(now, portals);
    this.resolvePortalTransfers(now, players, portals, forEachPlayerInRadius);
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
    const allowedBossKinds =
      onBossDeathPortal.sourceBossKinds && onBossDeathPortal.sourceBossKinds.length > 0
        ? new Set(onBossDeathPortal.sourceBossKinds)
        : null;

    for (const handledBossId of this.handledBossDeathIds) {
      const handledBoss = bosses.get(handledBossId);
      if (!handledBoss || handledBoss.state !== 'dead') {
        this.handledBossDeathIds.delete(handledBossId);
      }
    }

    for (const [portalId, portal] of portals) {
      if (portal.kind !== onBossDeathPortal.kind) continue;
      if (!portal.sourceBossId) {
        continue;
      }
      const sourceBoss = bosses.get(portal.sourceBossId);
      if (
        !sourceBoss ||
        sourceBoss.state !== 'dead' ||
        (allowedBossKinds && !allowedBossKinds.has(sourceBoss.kind))
      ) {
        portals.delete(portalId);
      }
    }

    for (const boss of bosses.values()) {
      if (boss.state !== 'dead') continue;
      if (allowedBossKinds && !allowedBossKinds.has(boss.kind)) continue;
      if (this.handledBossDeathIds.has(boss.id)) continue;

      this.handledBossDeathIds.add(boss.id);
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
    portals: Map<string, Portal>,
    forEachPlayerInRadius: PlayerRadiusQuery
  ): void {
    const portalRadiusSq = PORTAL_RADIUS * PORTAL_RADIUS;
    const nextPortalOverlapsByPlayer = new Map<string, Set<string>>();
    const transferredPlayerIds = new Set<string>();

    for (const portal of portals.values()) {
      if (now < portal.activeAtMs) continue;

      forEachPlayerInRadius(portal.x, portal.y, PORTAL_RADIUS, (player) => {
        if (player.state === 'dead') return;
        if (!players.has(player.id)) return;

        const dx = player.x - portal.x;
        const dy = player.y - portal.y;
        if (dx * dx + dy * dy > portalRadiusSq) return;

        let nextPortalOverlaps = nextPortalOverlapsByPlayer.get(player.id);
        if (!nextPortalOverlaps) {
          nextPortalOverlaps = new Set<string>();
          nextPortalOverlapsByPlayer.set(player.id, nextPortalOverlaps);
        }
        nextPortalOverlaps.add(portal.id);

        const prevOverlaps = this.portalOverlapsByPlayer.get(player.id);
        const justEntered = !prevOverlaps?.has(portal.id);
        if (!justEntered) return;
        if (player.phaseTransferCooldownMs > 0) return;
        if (transferredPlayerIds.has(player.id)) return;

        player.markPhaseTransferCooldown(PORTAL_TRANSFER_COOLDOWN_MS);
        this.transferRequests.push({
          playerId: player.id,
          toInstanceId: portal.toInstanceId,
          targetX: portal.targetX,
          targetY: portal.targetY,
        });
        transferredPlayerIds.add(player.id);
      });
    }

    this.portalOverlapsByPlayer = nextPortalOverlapsByPlayer;
  }
}
