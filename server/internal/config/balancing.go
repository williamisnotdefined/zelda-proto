// Package config exposes the central knobs for the Go server. The balancing
// table below is the SINGLE SOURCE OF TRUTH for tunables that affect
// gameplay feel: enemy density per phase, spawn ranges, safezone behavior,
// player respawn cooldown and hazard timings.
//
// To increase mob density on a given phase, edit the corresponding fields in
// DefaultBalancing and rebuild. There are no environment overrides on
// purpose — keeping a single edit surface avoids drifting tuning state
// between environments.
package config

import "time"

// Balancing aggregates every gameplay tunable consumed by the application
// layer. Domain packages keep their own physical constants (hitbox sizes,
// boss attack damage, etc.); only knobs that designers regularly tweak
// should live here.
type Balancing struct {
	// --- Per-phase enemy density ---------------------------------------
	// EnemiesPerChunk controls the chunk-based spawner population. Used by
	// phases 1, 2, and 3 (which all share DefaultEnemiesPerChunk).
	DefaultEnemiesPerChunk int
	// Phase4EnemiesPerChunk overrides DefaultEnemiesPerChunk for the pacman
	// ghost phase, which intentionally feels denser.
	Phase4EnemiesPerChunk int
	// SpawnChunkSize is the side length (in pixels) of a spawn chunk.
	SpawnChunkSize int
	// SpawnActiveRange is how far around a player chunks stay active.
	SpawnActiveRange float64
	// SpawnDespawnTimeMS is how long an idle chunk lingers before it is
	// torn down.
	SpawnDespawnTimeMS int64

	// Phase2StarterSlimes is the number of slimes seeded around the phase 2
	// spawn point on world boot.
	Phase2StarterSlimes int
	// Phase2StarterSlimeRadius is the seeding ring radius for phase 2.
	Phase2StarterSlimeRadius float64
	// Phase2NearbyRadius is the proximity radius used by the on-enter
	// repopulation hook to count nearby slimes around a player entry.
	Phase2NearbyRadius float64
	// Phase2MinNearbySlimes is the minimum slime count below which the
	// on-enter hook will reseed Phase2StarterSlimes around the entry.
	Phase2MinNearbySlimes int
	// Phase2DragonNearbyRadius is the proximity radius used to detect a
	// nearby Dragon Lord on entry; if absent, a seed dragon is spawned to
	// guarantee the boss fight is reachable before BossRegionSystem ticks.
	Phase2DragonNearbyRadius float64
	// Phase4StarterPacmans is the number of pacman ghosts seeded around the
	// phase 4 spawn point on world boot.
	Phase4StarterPacmans int
	// Phase4StarterPacmanRadius is the seeding ring radius for phase 4.
	Phase4StarterPacmanRadius float64
	// Phase4NearbyRadius is the proximity radius used by the on-enter
	// repopulation hook to count nearby pacman ghosts around a player entry.
	Phase4NearbyRadius float64
	// Phase4MinNearbyPacmans is the minimum pacman ghost count below which
	// the on-enter hook will reseed Phase4StarterPacmans around the entry.
	Phase4MinNearbyPacmans int

	// --- Boss region (player-relative respawner) -----------------------
	// Phase1BossRegionSize / ActiveRange control Gelehk respawn density.
	Phase1BossRegionSize  float64
	Phase1BossActiveRange float64
	// Phase2BossRegionSize / ActiveRange control DragonLord respawn density.
	Phase2BossRegionSize  float64
	Phase2BossActiveRange float64
	// BossRegionDespawnTimeMS is how long an idle boss region lingers.
	BossRegionDespawnTimeMS int64

	// --- Player ---------------------------------------------------------
	// PlayerRespawnTime is the post-death cooldown before a player can
	// respawn.
	PlayerRespawnTime time.Duration
	// SafeZoneDuration is the post-respawn invulnerability window inside
	// the spawn safe zone.
	SafeZoneDuration time.Duration
	// SpawnSafeZoneRadius is the protective bubble radius around each
	// phase's spawn point.
	SpawnSafeZoneRadius float64
	// HeartDropLifetime is how long heart drops may remain on the ground
	// before despawning.
	HeartDropLifetime time.Duration
}

// DefaultBalancing is the canonical gameplay tuning set. Tune here.
var DefaultBalancing = Balancing{
	DefaultEnemiesPerChunk: 4,
	Phase4EnemiesPerChunk:  7 * 3,
	SpawnChunkSize:         512,
	SpawnActiveRange:       1024,
	SpawnDespawnTimeMS:     30000,

	Phase2StarterSlimes:       8,
	Phase2StarterSlimeRadius:  240,
	Phase2NearbyRadius:        900,
	Phase2MinNearbySlimes:     4,
	Phase2DragonNearbyRadius:  1800,
	Phase4StarterPacmans:      14 * 3,
	Phase4StarterPacmanRadius: 600,
	Phase4NearbyRadius:        900,
	Phase4MinNearbyPacmans:    12 * 3,

	Phase1BossRegionSize:    2000,
	Phase1BossActiveRange:   2000,
	Phase2BossRegionSize:    2600,
	Phase2BossActiveRange:   2200,
	BossRegionDespawnTimeMS: 60000,

	PlayerRespawnTime:   1500 * time.Millisecond,
	SafeZoneDuration:    3000 * time.Millisecond,
	SpawnSafeZoneRadius: 150,
	HeartDropLifetime:   40 * time.Second,
}
