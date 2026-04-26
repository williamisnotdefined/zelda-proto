// Package combat defines the value objects exchanged by the combat
// pipeline: roles, reasons, hit intents, and resolved damage entries.
package combat

// ActorRole tags the side of a damage source/target.
type ActorRole string

// Canonical roles.
const (
	RolePlayer ActorRole = "player"
	RoleEnemy  ActorRole = "enemy"
	RoleBoss   ActorRole = "boss"
)

// DamageReason classifies why damage was dealt.
type DamageReason string

// Canonical reasons.
const (
	ReasonContact      DamageReason = "contact"
	ReasonPlayerAttack DamageReason = "player_attack"
	ReasonPVP          DamageReason = "pvp"
)

// HitIntent is a queued melee hit awaiting damage resolution.
type HitIntent struct {
	Amount     int
	SourceID   string
	SourceRole ActorRole
	TargetID   string
	TargetRole ActorRole
	Reason     DamageReason
}

// PendingDamage is a damage entry awaiting application.
type PendingDamage = HitIntent

// PVPDamage is the damage dealt by a player melee against another player.
const PVPDamage = 25
