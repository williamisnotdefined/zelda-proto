// Package portal defines inter-instance teleporters.
package portal

import (
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/world"
)

// Kind enumerates the portal directions.
type Kind string

// Portal kinds.
const (
	Phase1ToPhase2 Kind = "phase1_to_phase2"
	Phase2ToPhase1 Kind = "phase2_to_phase1"
	Phase2ToPhase3 Kind = "phase2_to_phase3"
	Phase3ToPhase2 Kind = "phase3_to_phase2"
	Phase3ToPhase4 Kind = "phase3_to_phase4"
	Phase4ToPhase3 Kind = "phase4_to_phase3"
)

// PortalRadius is the activation range.
const PortalRadius float64 = 42

// TransferCooldown bounds how often a player can hop instances.
const TransferCooldown = 600 * time.Millisecond

// Portal is the runtime entity.
type Portal struct {
	ID           string
	X, Y         float64
	Kind         Kind
	SourceBossID string
	ToInstance   world.InstanceID
	TargetX      float64
	TargetY      float64
	ActiveAt     time.Time
	ExpiresAt    *time.Time
}

// Snapshot is the wire projection.
type Snapshot struct {
	ID   string
	X, Y float64
	Kind Kind
}

// Active reports whether the portal is currently usable.
func (p *Portal) Active(now time.Time) bool {
	if now.Before(p.ActiveAt) {
		return false
	}
	if p.ExpiresAt != nil && !now.Before(*p.ExpiresAt) {
		return false
	}
	return true
}

// TransferRequest captures a player→instance hop requested by the system.
type TransferRequest struct {
	PlayerID   string
	ToInstance world.InstanceID
	TargetX    float64
	TargetY    float64
}
