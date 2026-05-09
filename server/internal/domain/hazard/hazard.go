// Package hazard defines area-effect hazards: fire, purple, and blue fields.
package hazard

import (
	"time"

	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

// Kind enumerates the hazard variants.
type Kind string

// Canonical hazard kinds.
const (
	KindFireField         Kind = "fire_field"
	KindPurpleField       Kind = "purple_field"
	KindBlueFlame         Kind = "blue_flame"
	KindGrenade           Kind = "grenade"
	KindMolotov           Kind = "molotov"
	KindLandmine          Kind = "landmine"
	KindLandmineExplosion Kind = "landmine_explosion"
)

// Tick parameters.
const (
	BurningTickDamage       = 8
	BurningTicks            = 3
	BurningTickInterval     = 1000 * time.Millisecond
	HitRadius               = 18
	FireFieldSegments       = 7
	FireFieldSpacing        = 36
	FireFieldInterval       = 40 * time.Millisecond
	PurpleBlastRadius       = 80
	PurpleTileStep          = 34
	DefaultTTL              = 1800 * time.Millisecond
	PurpleTTL               = 3000 * time.Millisecond
	GrenadeTTL              = 300 * time.Millisecond
	MolotovTTL              = GrenadeTTL
	LandmineTTL             = 30 * time.Second
	LandmineExplosionTTL    = 420 * time.Millisecond
	LandmineExplosionRadius = 180
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
	switch k {
	case KindPurpleField:
		return PurpleTTL
	case KindGrenade:
		return GrenadeTTL
	case KindMolotov:
		return MolotovTTL
	case KindLandmine:
		return LandmineTTL
	case KindLandmineExplosion:
		return LandmineExplosionTTL
	}
	return DefaultTTL
}

// Hazard is the runtime entity.
type Hazard struct {
	ID                string
	X, Y              float64
	Kind              Kind
	TTL               time.Duration
	Damage            int
	PlayerDamage      int
	BurningTicks      int
	HitRadius         float64
	Tint              uint32
	Direction         domworld.Direction
	Speed             float64
	RemainingDistance float64
	SourcePlayerID    string
	SourceCastID      uint64
	HitsAllActors     bool
	HitsPlayers       bool
	HitActorKeys      map[string]struct{}
	IgnoredActorKeys  map[string]struct{}
}

// New builds a hazard with default parameters for the kind.
func New(id string, x, y float64, kind Kind) *Hazard {
	return &Hazard{
		ID: id, X: x, Y: y, Kind: kind,
		TTL: TTLFor(kind), Damage: BurningTickDamage, BurningTicks: BurningTicks,
		HitRadius:        HitRadius,
		HitActorKeys:     make(map[string]struct{}),
		IgnoredActorKeys: make(map[string]struct{}),
	}
}

// NewGrenade builds a moving player grenade that only deals damage on landing.
func NewGrenade(id string, x, y float64, direction domworld.Direction) *Hazard {
	h := New(id, x, y, KindGrenade)
	h.TTL = GrenadeTTL
	h.BurningTicks = 0
	h.Direction = direction
	return h
}

// NewMolotov builds a moving player molotov that only deals damage on landing.
func NewMolotov(id string, x, y float64, direction domworld.Direction) *Hazard {
	h := New(id, x, y, KindMolotov)
	h.TTL = MolotovTTL
	h.BurningTicks = 0
	h.Direction = direction
	return h
}

// NewLandmine builds a stationary player landmine.
func NewLandmine(id string, x, y float64) *Hazard {
	h := New(id, x, y, KindLandmine)
	h.TTL = LandmineTTL
	h.BurningTicks = 0
	return h
}

// NewLandmineExplosion builds the short-lived visual explosion for a landmine.
func NewLandmineExplosion(id string, x, y float64) *Hazard {
	h := New(id, x, y, KindLandmineExplosion)
	h.TTL = LandmineExplosionTTL
	h.Damage = 0
	h.BurningTicks = 0
	h.HitRadius = LandmineExplosionRadius
	return h
}

// NewTinted builds a hazard with an optional sprite tint.
func NewTinted(id string, x, y float64, kind Kind, tint uint32) *Hazard {
	h := New(id, x, y, kind)
	h.Tint = tint
	return h
}

// Tick advances the hazard. Returns true when the TTL expires.
func (h *Hazard) Tick(dt time.Duration) bool {
	if h.Speed > 0 && h.RemainingDistance > 0 {
		dx, dy := hazardDirectionVector(h.Direction)
		travel := h.Speed * dt.Seconds()
		if travel > h.RemainingDistance {
			travel = h.RemainingDistance
		}
		h.X += dx * travel
		h.Y += dy * travel
		h.RemainingDistance -= travel
	}
	h.TTL -= dt
	return h.TTL <= 0 || (h.Speed > 0 && h.RemainingDistance <= 0)
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
	ID        string
	X, Y      float64
	Kind      Kind
	TTLMs     int64
	Tint      uint32
	Direction domworld.Direction
}

func hazardDirectionVector(direction domworld.Direction) (float64, float64) {
	switch direction {
	case domworld.DirectionUp:
		return 0, -1
	case domworld.DirectionDown:
		return 0, 1
	case domworld.DirectionLeft:
		return -1, 0
	case domworld.DirectionRight:
		return 1, 0
	default:
		return 0, 0
	}
}
