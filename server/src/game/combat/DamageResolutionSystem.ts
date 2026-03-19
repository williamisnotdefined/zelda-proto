import type { CombatActorRole, MeleeHitIntentEntry } from './components.js';
import { ActorStore } from '../stores/ActorStore.js';

interface DamageableTarget {
  id: string;
  hp: number;
  state: string;
}

export class DamageResolutionSystem {
  update(actorStore: ActorStore): void {
    const virtualHpByTarget = new Map<string, number>();

    for (const player of actorStore.players.values()) {
      const playerKey = this.getTargetKey('player', player.id);
      const playerVirtualHp = virtualHpByTarget.get(playerKey) ?? player.hp;
      const intents = actorStore.drainPlayerMeleeHitIntents(player.id);
      if (player.state === 'dead' || playerVirtualHp <= 0 || intents.length === 0) {
        continue;
      }

      for (const intent of intents) {
        this.resolveIntent(actorStore, intent, virtualHpByTarget);
      }
    }
  }

  private resolveIntent(
    actorStore: ActorStore,
    intent: MeleeHitIntentEntry,
    virtualHpByTarget: Map<string, number>
  ): void {
    const target = this.resolveTarget(actorStore, intent.targetRole, intent.targetId);
    if (!target || target.state === 'dead') {
      return;
    }

    const targetKey = this.getTargetKey(intent.targetRole, intent.targetId);
    const targetVirtualHp = virtualHpByTarget.get(targetKey) ?? target.hp;
    if (targetVirtualHp <= 0) {
      return;
    }

    actorStore.queuePendingDamage(intent.targetRole, intent.targetId, {
      amount: intent.amount,
      sourceId: intent.sourceId,
      sourceRole: intent.sourceRole,
      targetId: intent.targetId,
      targetRole: intent.targetRole,
      reason: intent.reason,
    });
    virtualHpByTarget.set(targetKey, targetVirtualHp - intent.amount);
  }

  private resolveTarget(
    actorStore: ActorStore,
    targetRole: CombatActorRole,
    targetId: string
  ): DamageableTarget | null {
    if (targetRole === 'player') {
      return actorStore.getPlayerById(targetId);
    }

    if (targetRole === 'enemy') {
      return actorStore.getEnemyById(targetId);
    }

    return actorStore.getBossById(targetId);
  }

  private getTargetKey(targetRole: CombatActorRole, targetId: string): string {
    return `${targetRole}:${targetId}`;
  }
}
