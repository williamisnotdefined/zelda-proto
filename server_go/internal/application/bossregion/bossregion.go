// Package bossregion ports the player-relative boss respawner from
// server/src/game/systems/BossRegionSystem.ts. A "region" is a regionSize
// grid cell; when a player is within ActiveRange of a cell center the boss
// for that region is spawned (or refreshed). Idle regions despawn after
// DespawnTimeMS while the boss is dead/idle.
//
// Phase3 / Phase4 worlds disable region spawning (they use static seeded
// bosses); the system still safely returns in that case.
package bossregion

import (
	"fmt"
	"math"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/application/registries"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/player"
)

// SpawnFn constructs a boss for the (id, x, y) tuple. Phase 1 returns a
// Gelehk-typed sentinel via Adopt callbacks; Phase 2 a DragonLord.
type SpawnFn func(id string, x, y float64)

// RemoveFn removes a boss by id from the world.
type RemoveFn func(id string)

// LookupBoss returns (state, kind) for a boss id; (StateDead, "") if missing.
type LookupBoss func(id string) (boss.State, boss.Kind, bool)

// region tracks one active grid cell and its associated boss id.
type region struct {
	key              string
	bossID           string
	lastPlayerActive int64
}

// System manages the per-region lifecycle.
type System struct {
	cfg     registries.BossRegionConfig
	regions map[string]*region
}

// New constructs a System.
func New(cfg registries.BossRegionConfig) *System {
	return &System{cfg: cfg, regions: make(map[string]*region)}
}

// Update sweeps the regions around live players, spawning fresh bosses and
// despawning idle ones. nowMs is wall time in ms.
func (s *System) Update(
	nowMs int64,
	players map[string]*player.Player,
	spawn SpawnFn,
	remove RemoveFn,
	lookup LookupBoss,
) {
	if !s.cfg.Enabled {
		return
	}
	active := make(map[string]struct{})

	for _, p := range players {
		if p.State == player.StateDead {
			continue
		}
		prx := int(floorDiv(p.X, s.cfg.RegionSize))
		pry := int(floorDiv(p.Y, s.cfg.RegionSize))
		for dx := -1; dx <= 1; dx++ {
			for dy := -1; dy <= 1; dy++ {
				rx := prx + dx
				ry := pry + dy
				key := fmt.Sprintf("%s_%d,%d", s.cfg.KeyPrefix, rx, ry)
				active[key] = struct{}{}
				cx := float64(rx)*s.cfg.RegionSize + s.cfg.RegionSize/2
				cy := float64(ry)*s.cfg.RegionSize + s.cfg.RegionSize/2
				if physics.DistanceSquared(p.X, p.Y, cx, cy) > s.cfg.ActiveRange*s.cfg.ActiveRange {
					continue
				}
				reg, ok := s.regions[key]
				if !ok {
					id := fmt.Sprintf("%s_%d_%d", s.cfg.BossPrefix, rx, ry)
					spawn(id, cx, cy)
					s.regions[key] = &region{key: key, bossID: id, lastPlayerActive: nowMs}
				} else {
					reg.lastPlayerActive = nowMs
				}
			}
		}
	}

	for key, reg := range s.regions {
		if _, ok := active[key]; ok {
			continue
		}
		if nowMs-reg.lastPlayerActive <= s.cfg.DespawnTimeMS {
			continue
		}
		state, _, exists := lookup(reg.bossID)
		if !exists {
			delete(s.regions, key)
			continue
		}
		if state == boss.StateIdle || state == boss.StateDead {
			remove(reg.bossID)
			delete(s.regions, key)
		}
	}
}

// SpawnKind exposes the configured boss kind to callers (used by Instance for
// dispatching to the right SpawnDragon/SpawnGelehk method).
func (s *System) SpawnKind() boss.Kind { return s.cfg.SpawnKind }

// Enabled mirrors the config field for callers.
func (s *System) Enabled() bool { return s.cfg.Enabled }

func floorDiv(v, size float64) float64 {
	return math.Floor(v / size)
}
