// Package drop defines pickup food that grants healing to players.
package drop

import "time"

// Kind identifies a drop variant.
type Kind string

// Food drop kind identifiers.
const (
	KindFoodSmall  Kind = "food_small"
	KindFoodLarge  Kind = "food_large"
	KindFoodPacman Kind = "food_pacman"
)

// HealAmount returns the HP healed by the kind. Unknown kinds return 0.
func (k Kind) HealAmount() int {
	switch k {
	case KindFoodSmall:
		return 25
	case KindFoodLarge:
		return 50
	case KindFoodPacman:
		return 25
	}
	return 0
}

// PickupRadius is the world-space distance at which a player picks up a drop.
const PickupRadius float64 = 24

// FoodDropChance is the probability that a slain normal monster drops food.
const FoodDropChance float64 = 0.1

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
