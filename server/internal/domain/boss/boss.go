// Package boss hosts the boss aggregates: DragonLord, Phase3 (with three
// kinds), and Gelehk (three-phase fight). Bosses share contact-damage and
// snapshot semantics; specialised AI lives in their dedicated methods.
package boss

import (
	"math"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/hazard"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
)

// Kind enumerates boss variants.
type Kind string

// Boss kinds.
const (
	KindDragonLord         Kind = "dragon_lord"
	KindGelehk             Kind = "gelehk"
	KindSilverbackWainer   Kind = "silverback_wainer"
	KindSlimMaioli         Kind = "slim_maioli"
	KindFranklyStein       Kind = "frankly_stein"
	KindVanessaTheRuthless Kind = "vanessa_the_ruthless"
)

// State enumerates boss FSM states across all variants.
type State string

// Canonical states.
const (
	StateIdle            State = "idle"
	StateChasing         State = "chasing"
	StateAttacking       State = "attacking"
	StateTargeting       State = "targeting"
	StateJumping         State = "jumping"
	StateCharging        State = "charging"
	StateWaveWindup      State = "wave_windup"
	StateSpawningMinions State = "spawning_minions"
	StateEnraged         State = "enraged"
	StateDead            State = "dead"
)

// PlayerView is the read-only player snapshot consumed by boss AI.
type PlayerView struct {
	ID        string
	X, Y      float64
	Alive     bool
	Protected bool
}

// FindNearestPlayer is supplied by the runtime to avoid O(N) scans.
type FindNearestPlayer func(x, y, radius float64, predicate func(PlayerView) bool) *PlayerView

// SpawnFireLine spawns a fire line hazard with normalized direction.
type SpawnFireLine func(x, y, dirX, dirY float64, kind hazard.Kind, tint uint32)

// SpawnPurpleField spawns a purple-field blast at (x, y).
type SpawnPurpleField func(x, y float64)

// SpawnFireBurst spawns an immediate clustered fire burst at (x, y).
type SpawnFireBurst func(x, y float64, kind hazard.Kind, tints []uint32)

// SpawnMinions spawns count minions at (x, y).
type SpawnMinions func(x, y float64, count int)

// DamagePlayer applies damage to a player by id.
type DamagePlayer func(id string, amount int)

// Snapshot is the wire projection.
type Snapshot struct {
	ID    string
	Kind  Kind
	X, Y  float64
	HP    int
	MaxHP int
	State State
	Phase int
}

func nearestAlive(players []PlayerView, x, y, radius float64, find FindNearestPlayer) *PlayerView {
	if find != nil {
		return find(x, y, radius, func(p PlayerView) bool { return p.Alive && !p.Protected })
	}
	bestSq := radius * radius
	var best *PlayerView
	for i := range players {
		if !players[i].Alive || players[i].Protected {
			continue
		}
		dsq := physics.DistanceSquared(x, y, players[i].X, players[i].Y)
		if dsq <= bestSq {
			bestSq = dsq
			best = &players[i]
		}
	}
	return best
}

func sign(v float64) float64 {
	if v > 0 {
		return 1
	}
	if v < 0 {
		return -1
	}
	return 0
}

func _unused() { _ = math.Pi; _ = time.Second }
