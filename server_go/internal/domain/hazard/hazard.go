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
	ID               string
	X, Y             float64
	Kind             Kind
	TTL              time.Duration
	Damage           int
	BurningTicks     int
	Tint             uint32
	SourcePlayerID   string
	HitsAllActors    bool
	HitActorKeys     map[string]struct{}
	IgnoredActorKeys map[string]struct{}
}

// New builds a hazard with default parameters for the kind.
func New(id string, x, y float64, kind Kind) *Hazard {
	return &Hazard{
		ID: id, X: x, Y: y, Kind: kind,
		TTL: TTLFor(kind), Damage: BurningTickDamage, BurningTicks: BurningTicks,
		HitActorKeys:     make(map[string]struct{}),
		IgnoredActorKeys: make(map[string]struct{}),
	}
}

// NewTinted builds a hazard with an optional sprite tint.
func NewTinted(id string, x, y float64, kind Kind, tint uint32) *Hazard {
	h := New(id, x, y, kind)
	h.Tint = tint
	return h
}

// Tick advances the hazard. Returns true when the TTL expires.
func (h *Hazard) Tick(dt time.Duration) bool {
	h.TTL -= dt
	return h.TTL <= 0
}

// MarkHit records an actor as hit to prevent multi-tick stacking.
func (h *Hazard) MarkHit(actorKey string) bool {
	if _, ignored := h.IgnoredActorKeys[actorKey]; ignored {
		return false
	}
	if _, hit := h.HitActorKeys[actorKey]; hit {
		return false
	}
	h.HitActorKeys[actorKey] = struct{}{}
	return true
}

// IgnoreActor prevents a hazard from affecting the supplied actor key.
func (h *Hazard) IgnoreActor(actorKey string) {
	h.IgnoredActorKeys[actorKey] = struct{}{}
}

// Snapshot is the wire projection.
type Snapshot struct {
	ID    string
	X, Y  float64
	Kind  Kind
	TTLMs int64
	Tint  uint32
}
