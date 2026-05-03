// Package drop defines pickup items that grant healing to players.
package drop

import "time"

// Kind identifies a drop variant.
type Kind string

// Drop kind identifiers.
const (
	KindHeartSmall  Kind = "heart_small"
	KindHeartLarge  Kind = "heart_large"
	KindHeartPacman Kind = "heart_pacman"
)

// HealAmount returns the HP healed by the kind. Unknown kinds return 0.
func (k Kind) HealAmount() int {
	switch k {
	case KindHeartSmall:
		return 25
	case KindHeartLarge:
		return 50
	case KindHeartPacman:
		return 25
	}
	return 0
}

// PickupRadius is the world-space distance at which a player picks up a drop.
const PickupRadius float64 = 24

// DropChance is the probability that a slain enemy drops an item.
const DropChance float64 = 0.5

// Drop is the runtime entity stored by the world.
type Drop struct {
	ID        string
	X         float64
	Y         float64
	Kind      Kind
	SpawnedAt time.Time
}

// Snapshot is the wire projection.
type Snapshot struct {
	ID   string
	X    float64
	Y    float64
	Kind Kind
}

// Snapshot returns the wire projection for this drop.
func (d *Drop) Snapshot() Snapshot {
	return Snapshot{ID: d.ID, X: d.X, Y: d.Y, Kind: d.Kind}
}
