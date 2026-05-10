// Package world hosts cross-cutting value objects and constants that mirror the
// shared TypeScript contract under client/src/shared/constants.ts.
//
// Constants here are duplicated from the client-shared contract on purpose:
// keeping a Go copy keeps the build graph free of Node tooling. A future generator can
// recreate this file from the TypeScript source if drift becomes a concern;
// the constant list is small enough that manual sync is currently safer.
package world

import "time"

// World geometry.
const (
	// SpawnX and SpawnY define the canonical hub spawn location.
	SpawnX float64 = 200
	SpawnY float64 = 200

	// SpawnSafeZoneRadius is the radius around the spawn within which players
	// are protected from enemy contact damage.
	SpawnSafeZoneRadius float64 = 150

	// CityOneSafeZoneRadius is the permanent safe city around the Phase 1 spawn.
	CityOneSafeZoneRadius float64 = 850

	// ViewRadius bounds the visibility used by the snapshot system to filter
	// distant entities for each player.
	ViewRadius float64 = 2000
)

// Tick rates and timing.
const (
	// SimTickRate is the deterministic simulation update frequency (Hz).
	SimTickRate = 60
	// NetTickRate is the snapshot broadcast frequency (Hz).
	NetTickRate = 20
	// LeaderboardTickRate is the leaderboard broadcast frequency (Hz).
	LeaderboardTickRate = 1

	// MaxFrameDelta caps the simulation step size when wall clock drifts.
	MaxFrameDelta = 250 * time.Millisecond

	// SimTickDuration is the wall-clock target between simulation ticks.
	SimTickDuration = time.Second / SimTickRate
	// NetTickDuration is the wall-clock target between snapshot broadcasts.
	NetTickDuration = time.Second / NetTickRate
)

// Network and protocol.
const (
	WSMaxPayloadBytes  = 1024
	WSMaxBufferedBytes = 512 * 1024

	ToastyKillThreshold = 20
)

// Snapshot quantization precision (10 -> two decimal positions kept).
const PositionPrecision float64 = 10

// InstanceID identifies one of the four authoritative phase worlds. A zero
// value is intentionally invalid to surface unset bugs.
type InstanceID string

// Authoritative instance identifiers, mirroring client/src/shared/types.ts.
const (
	InstancePhase1 InstanceID = "phase1"
	InstancePhase2 InstanceID = "phase2"
	InstancePhase3 InstanceID = "phase3"
	InstancePhase4 InstanceID = "phase4"
)

// AllInstances enumerates every authoritative instance in deterministic order.
func AllInstances() []InstanceID {
	return []InstanceID{InstancePhase1, InstancePhase2, InstancePhase3, InstancePhase4}
}

// IsValid reports whether the receiver is one of the canonical instances.
func (id InstanceID) IsValid() bool {
	switch id {
	case InstancePhase1, InstancePhase2, InstancePhase3, InstancePhase4:
		return true
	}
	return false
}

// Direction enumerates cardinal player facing directions.
type Direction string

// Cardinal directions used by player and projectile orientation.
const (
	DirectionUp    Direction = "up"
	DirectionDown  Direction = "down"
	DirectionLeft  Direction = "left"
	DirectionRight Direction = "right"
)
