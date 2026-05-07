// Package registries defines the per-phase data tables describing primary enemy
// kind, boss-region wiring,
// initial portals, starter populations and chunk spawn parameters.
//
// The registry is intentionally a plain-data Go construct: no DI, no
// reflection. Instance.seed() and the world systems consume these tables
// directly.
package registries

import (
	"github.com/williamisnotdefined/zelda-proto/server/internal/config"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/portal"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

// Phase-specific constants (mirror instanceRegistry.ts).
//
// Tunable knobs (per-phase enemy density, starter populations, spawn ranges)
// live in internal/config.DefaultBalancing — see balancing.go. Constants
// here are non-tunable structural values (portal durations, return offsets).
const (
	Phase1PortalDurationMS = 30000
	Phase3ReturnPortalDX   = 240
	Phase4ReturnPortalDX   = 240
	Phase4BossOffsetX      = 520
	Phase4BossOffsetY      = 120
	BossDeathPortalDelayMS = 500
)

// SpawnPositions are the per-phase canonical entry points.
var SpawnPositions = map[domworld.InstanceID]struct{ X, Y float64 }{
	domworld.InstancePhase1: {X: domworld.SpawnX, Y: domworld.SpawnY},
	domworld.InstancePhase2: {X: domworld.SpawnX + 180, Y: domworld.SpawnY},
	domworld.InstancePhase3: {X: domworld.SpawnX + 360, Y: domworld.SpawnY},
	domworld.InstancePhase4: {X: domworld.SpawnX + 540, Y: domworld.SpawnY},
}

// Phase3EntryBoss describes one of the three Phase 3 entry bosses.
type Phase3EntryBoss struct {
	ID      string
	Kind    boss.Kind
	OffsetX float64
	OffsetY float64
}

// Phase4Boss describes the fixed Vanessa spawn for the pacman phase.
type Phase4Boss struct {
	ID      string
	Kind    boss.Kind
	OffsetX float64
	OffsetY float64
}

// Phase3EntryBosses is the canonical trio seeded around the Phase 3 spawn.
var Phase3EntryBosses = []Phase3EntryBoss{
	{ID: "phase3_boss_silverback_entry", Kind: boss.KindSilverbackWainer, OffsetX: 120, OffsetY: -90},
	{ID: "phase3_boss_slim_entry", Kind: boss.KindSlimMaioli, OffsetX: 160, OffsetY: 120},
	{ID: "phase3_boss_frankly_entry", Kind: boss.KindFranklyStein, OffsetX: -120, OffsetY: 30},
}

// Phase4BossDefinition is the canonical static Vanessa spawn.
var Phase4BossDefinition = Phase4Boss{
	ID:      "phase4_boss_vanessa",
	Kind:    boss.KindVanessaTheRuthless,
	OffsetX: Phase4BossOffsetX,
	OffsetY: Phase4BossOffsetY,
}

// SpawnSystemConfig configures the chunk-based monster spawner.
type SpawnSystemConfig struct {
	ChunkSize       int
	EnemiesPerChunk int
	ActiveRange     float64
	DespawnTimeMS   int64
	EnemyPrefix     string
	EnemyKind       enemy.Kind
	EnemyConfig     enemy.Config
	DefaultDropKind drop.Kind
	PacmanVariants  bool
}

// BossRegionConfig configures the player-relative boss respawner.
type BossRegionConfig struct {
	Enabled       bool
	RegionSize    float64
	ActiveRange   float64
	DespawnTimeMS int64
	KeyPrefix     string
	BossPrefix    string
	SpawnKind     boss.Kind
}

// BossDeathPortalConfig spawns a forward portal at the corpse of an allowed
// boss.
type BossDeathPortalConfig struct {
	Kind              portal.Kind
	SourceBossKinds   []boss.Kind
	ToInstance        domworld.InstanceID
	TargetX           float64
	TargetY           float64
	ActivationDelayMS int64
	DurationMS        int64
}

// InitialPortalConfig is a portal seeded at world construction.
type InitialPortalConfig struct {
	Kind       portal.Kind
	X, Y       float64
	ToInstance domworld.InstanceID
	TargetX    float64
	TargetY    float64
}

// InstanceDefinition aggregates everything Instance.seed() needs per phase.
type InstanceDefinition struct {
	InstanceID         domworld.InstanceID
	SpawnX, SpawnY     float64
	SpawnSystem        SpawnSystemConfig
	BossRegion         BossRegionConfig
	BossDeathPortal    *BossDeathPortalConfig
	InitialPortals     []InitialPortalConfig
	StarterEnemies     int
	StarterEnemyRadius float64
	Phase3EntryBosses  []Phase3EntryBoss
	Phase4Boss         *Phase4Boss
}

// All returns the canonical per-phase definitions in deterministic order
// (matches AllInstances()). Tunable values are pulled from
// config.DefaultBalancing so density adjustments live in a single place.
func All() map[domworld.InstanceID]InstanceDefinition {
	return allFrom(config.DefaultBalancing)
}

// allFrom is the testable variant that builds the registry from an explicit
// balancing table.
func allFrom(b config.Balancing) map[domworld.InstanceID]InstanceDefinition {
	p1 := SpawnPositions[domworld.InstancePhase1]
	p2 := SpawnPositions[domworld.InstancePhase2]
	p3 := SpawnPositions[domworld.InstancePhase3]
	p4 := SpawnPositions[domworld.InstancePhase4]

	return map[domworld.InstanceID]InstanceDefinition{
		domworld.InstancePhase1: {
			InstanceID: domworld.InstancePhase1,
			SpawnX:     p1.X, SpawnY: p1.Y,
			SpawnSystem: SpawnSystemConfig{
				ChunkSize: b.SpawnChunkSize, EnemiesPerChunk: b.Phase1EnemiesPerChunk,
				ActiveRange: b.SpawnActiveRange, DespawnTimeMS: b.SpawnDespawnTimeMS,
				EnemyPrefix: "blob",
				EnemyKind:   enemy.KindBlob, EnemyConfig: enemy.BlobConfig,
				DefaultDropKind: drop.KindHeartSmall,
			},
			BossRegion: BossRegionConfig{
				Enabled: true, RegionSize: b.Phase1BossRegionSize, ActiveRange: b.Phase1BossActiveRange,
				DespawnTimeMS: b.BossRegionDespawnTimeMS,
				KeyPrefix:     "gelehk_region", BossPrefix: "gelehk",
				SpawnKind: boss.KindGelehk,
			},
			BossDeathPortal: &BossDeathPortalConfig{
				Kind:            portal.Phase1ToPhase2,
				SourceBossKinds: []boss.Kind{boss.KindGelehk},
				ToInstance:      domworld.InstancePhase2,
				TargetX:         p2.X, TargetY: p2.Y,
				ActivationDelayMS: BossDeathPortalDelayMS,
				DurationMS:        Phase1PortalDurationMS,
			},
		},
		domworld.InstancePhase2: {
			InstanceID: domworld.InstancePhase2,
			SpawnX:     p2.X, SpawnY: p2.Y,
			SpawnSystem: SpawnSystemConfig{
				ChunkSize: b.SpawnChunkSize, EnemiesPerChunk: b.Phase2EnemiesPerChunk,
				ActiveRange: b.SpawnActiveRange, DespawnTimeMS: b.SpawnDespawnTimeMS,
				EnemyPrefix: "slime",
				EnemyKind:   enemy.KindSlime, EnemyConfig: enemy.SlimeConfig,
				DefaultDropKind: drop.KindHeartLarge,
			},
			BossRegion: BossRegionConfig{
				Enabled: true, RegionSize: b.Phase2BossRegionSize, ActiveRange: b.Phase2BossActiveRange,
				DespawnTimeMS: b.BossRegionDespawnTimeMS,
				KeyPrefix:     "dragon_region", BossPrefix: "dragon_lord",
				SpawnKind: boss.KindDragonLord,
			},
			BossDeathPortal: &BossDeathPortalConfig{
				Kind:            portal.Phase2ToPhase3,
				SourceBossKinds: []boss.Kind{boss.KindDragonLord},
				ToInstance:      domworld.InstancePhase3,
				TargetX:         p3.X, TargetY: p3.Y,
				ActivationDelayMS: BossDeathPortalDelayMS,
				DurationMS:        Phase1PortalDurationMS,
			},
			InitialPortals: []InitialPortalConfig{{
				Kind: portal.Phase2ToPhase1,
				X:    domworld.SpawnX, Y: domworld.SpawnY,
				ToInstance: domworld.InstancePhase1,
				TargetX:    domworld.SpawnX, TargetY: domworld.SpawnY,
			}},
			StarterEnemies:     b.Phase2StarterSlimes,
			StarterEnemyRadius: b.Phase2StarterSlimeRadius,
		},
		domworld.InstancePhase3: {
			InstanceID: domworld.InstancePhase3,
			SpawnX:     p3.X, SpawnY: p3.Y,
			SpawnSystem: SpawnSystemConfig{
				ChunkSize: b.SpawnChunkSize, EnemiesPerChunk: b.DefaultEnemiesPerChunk,
				ActiveRange: b.SpawnActiveRange, DespawnTimeMS: b.SpawnDespawnTimeMS,
				EnemyPrefix: "hand",
				EnemyKind:   enemy.KindHand, EnemyConfig: enemy.HandConfig,
				DefaultDropKind: drop.KindHeartLarge,
			},
			BossRegion: BossRegionConfig{
				Enabled: false, RegionSize: 2600, ActiveRange: 2200,
				DespawnTimeMS: 60000,
				KeyPrefix:     "phase3_boss_region", BossPrefix: "phase3_boss",
				SpawnKind: boss.KindSilverbackWainer,
			},
			BossDeathPortal: &BossDeathPortalConfig{
				Kind:            portal.Phase3ToPhase4,
				SourceBossKinds: []boss.Kind{boss.KindSilverbackWainer, boss.KindSlimMaioli, boss.KindFranklyStein},
				ToInstance:      domworld.InstancePhase4,
				TargetX:         p4.X, TargetY: p4.Y,
				ActivationDelayMS: BossDeathPortalDelayMS,
				DurationMS:        Phase1PortalDurationMS,
			},
			InitialPortals: []InitialPortalConfig{{
				Kind: portal.Phase3ToPhase2,
				X:    p3.X + Phase3ReturnPortalDX, Y: p3.Y,
				ToInstance: domworld.InstancePhase2,
				TargetX:    p2.X, TargetY: p2.Y,
			}},
			Phase3EntryBosses: Phase3EntryBosses,
		},
		domworld.InstancePhase4: {
			InstanceID: domworld.InstancePhase4,
			SpawnX:     p4.X, SpawnY: p4.Y,
			SpawnSystem: SpawnSystemConfig{
				ChunkSize: b.SpawnChunkSize, EnemiesPerChunk: b.Phase4EnemiesPerChunk,
				ActiveRange: b.SpawnActiveRange, DespawnTimeMS: b.SpawnDespawnTimeMS,
				EnemyPrefix: "pacman_ghost",
				EnemyKind:   enemy.KindPacmanGhost, EnemyConfig: enemy.PacmanGhostConfig,
				DefaultDropKind: drop.KindHeartPacman,
				PacmanVariants:  true,
			},
			BossRegion: BossRegionConfig{
				Enabled: false, RegionSize: b.Phase2BossRegionSize, ActiveRange: b.Phase2BossActiveRange,
				DespawnTimeMS: b.BossRegionDespawnTimeMS,
				KeyPrefix:     "phase4_boss_region", BossPrefix: "phase4_boss",
				SpawnKind: boss.KindVanessaTheRuthless,
			},
			InitialPortals: []InitialPortalConfig{{
				Kind: portal.Phase4ToPhase3,
				X:    p4.X + Phase4ReturnPortalDX, Y: p4.Y,
				ToInstance: domworld.InstancePhase3,
				TargetX:    p3.X, TargetY: p3.Y,
			}},
			StarterEnemies:     b.Phase4StarterPacmans,
			StarterEnemyRadius: b.Phase4StarterPacmanRadius,
			Phase4Boss:         &Phase4BossDefinition,
		},
	}
}
