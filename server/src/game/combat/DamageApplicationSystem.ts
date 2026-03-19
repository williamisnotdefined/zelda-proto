import type { CombatActorRole, PendingDamageEntry } from './components.js';
import { ActorStore } from '../stores/ActorStore.js';

interface DamageableTarget {
  id: string;
  hp: number;
  state: string;
  takeDamage(amount: number): void;
}

export class DamageApplicationSystem {
  update(actorStore: ActorStore): void {
    this.applyPendingDamage(actorStore, 'enemy');
    this.applyPendingDamage(actorStore, 'boss');
    this.applyPendingDamage(actorStore, 'player');
  }

  private applyPendingDamage(actorStore: ActorStore, targetRole: CombatActorRole): void {
    for (const target of this.getPendingDamageTargets(actorStore, targetRole)) {
      const entries = actorStore.drainPendingDamage(targetRole, target.id);
      for (const entry of entries) {
        this.applyDamageEntry(actorStore, targetRole, target, entry);
      }
    }
  }

  private applyDamageEntry(
    actorStore: ActorStore,
    targetRole: CombatActorRole,
    target: DamageableTarget,
    entry: PendingDamageEntry
  ): void {
    const wasAlive = target.state !== 'dead';
    target.takeDamage(entry.amount);

    if (!wasAlive || target.state !== 'dead' || entry.sourceRole !== 'player') {
      return;
    }

    const sourcePlayer = actorStore.getPlayerById(entry.sourceId);
    if (!sourcePlayer) {
      return;
    }

    if (entry.reason === 'player_attack' && (targetRole === 'enemy' || targetRole === 'boss')) {
      sourcePlayer.monsterKills += 1;
      sourcePlayer.recordMonsterKillInCurrentAttack();
      return;
    }

    if (entry.reason === 'pvp' && targetRole === 'player') {
      sourcePlayer.playerKills += 1;
    }
  }

  private getPendingDamageTargets(
    actorStore: ActorStore,
    targetRole: CombatActorRole
  ): DamageableTarget[] {
    if (targetRole === 'enemy') {
      return actorStore.getEnemiesWithPendingDamage();
    }

    if (targetRole === 'boss') {
      return actorStore.getBossesWithPendingDamage();
    }

    return actorStore.getPlayersWithPendingDamage();
  }
}
