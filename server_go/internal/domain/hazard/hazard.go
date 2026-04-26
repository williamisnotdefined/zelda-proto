// Package hazard defines area-effect hazards: fire, purple, and blue fields.
package hazard

import "time"

// Kind enumerates the hazard variants.
type Kind string

// Canonical hazard kinds.
const (
	KindFireField   Kind = "fire_field"
	KindPurpleField Kind = "purple_field"
	KindBlueFlame   Kind = "blue_flame"
)

// Tick parameters.
const (
	BurningTickDamage   = 4
	BurningTicks        = 3
	BurningTickInterval = 1000 * time.Millisecond
	HitRadius           = 18
	FireFieldSegments   = 7
	FireFieldSpacing    = 36
	FireFieldInterval   = 40 * time.Millisecond
	PurpleBlastRadius   = 80
	PurpleTileStep      = 34
	DefaultTTL          = 1800 * time.Millisecond
	PurpleTTL           = 3000 * time.Millisecond
)

// Effect identifies the status effect applied by a hazard.
type Effect string

// Effect identifiers.
const (
	EffectBurning       Effect = "burning"
	EffectPurpleBurning Effect = "purpleBurning"
	EffectBlueBurning   Effect = "blueBurning"
)

// EffectFor returns the player status effect kind triggered by hazard kind.
func EffectFor(k Kind) Effect {
	switch k {
	case KindPurpleField:
		return EffectPurpleBurning
	case KindBlueFlame:
		return EffectBlueBurning
	}
	return EffectBurning
}

// TTLFor returns the default time-to-live for a hazard kind.
func TTLFor(k Kind) time.Duration {
	if k == KindPurpleField {
		return PurpleTTL
	}
	return DefaultTTL
}

// Hazard is the runtime entity.
type Hazard struct {
	ID            string
	X, Y          float64
	Kind          Kind
	TTL           time.Duration
	Damage        int
	BurningTicks  int
	HitPlayerIDs  map[string]struct{}
}

// New builds a hazard with default parameters for the kind.
func New(id string, x, y float64, kind Kind) *Hazard {
	return &Hazard{
		ID: id, X: x, Y: y, Kind: kind,
		TTL: TTLFor(kind), Damage: BurningTickDamage, BurningTicks: BurningTicks,
		HitPlayerIDs: make(map[string]struct{}),
	}
}

// Tick advances the hazard. Returns true when the TTL expires.
func (h *Hazard) Tick(dt time.Duration) bool {
	h.TTL -= dt
	return h.TTL <= 0
}

// MarkHit records a player as hit to prevent multi-tick stacking.
func (h *Hazard) MarkHit(playerID string) bool {
	if _, hit := h.HitPlayerIDs[playerID]; hit {
		return false
	}
	h.HitPlayerIDs[playerID] = struct{}{}
	return true
}

// Snapshot is the wire projection.
type Snapshot struct {
	ID    string
	X, Y  float64
	Kind  Kind
	TTLMs int64
}
