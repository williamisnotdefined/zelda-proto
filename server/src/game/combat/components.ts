import type { BossKind, EnemyKind } from '@gelehka/shared';

export type CombatActorRole = 'player' | 'enemy' | 'boss';
export type CombatDamageReason = 'contact' | 'player_attack' | 'pvp';

export const COMBAT_COMPONENTS = {
  DAMAGEABLE: 'combat_damageable',
  CONTACT_DAMAGE: 'combat_contact_damage',
  MELEE_HIT_INTENT: 'combat_melee_hit_intent',
  PENDING_DAMAGE: 'combat_pending_damage',
  SAFE_ZONE_PROTECTED: 'combat_safe_zone_protected',
} as const;

export interface CombatDamageableComponent {
  actorRole: CombatActorRole;
}

export interface ContactDamageComponent {
  actorRole: 'enemy' | 'boss';
  actorKind: EnemyKind | BossKind;
  radius: number;
  damage: number;
}

export interface MeleeHitIntentEntry {
  amount: number;
  sourceId: string;
  sourceRole: 'player';
  targetId: string;
  targetRole: CombatActorRole;
  reason: 'player_attack' | 'pvp';
}

export interface MeleeHitIntentComponent {
  entries: MeleeHitIntentEntry[];
}

export interface PendingDamageEntry {
  amount: number;
  sourceId: string;
  sourceRole: CombatActorRole;
  targetId: string;
  targetRole: CombatActorRole;
  reason: CombatDamageReason;
}

export interface PendingDamageComponent {
  entries: PendingDamageEntry[];
}

export interface SafeZoneProtectedComponent {
  active: true;
}

export interface SafeZoneArea {
  x: number;
  y: number;
  radius: number;
}
