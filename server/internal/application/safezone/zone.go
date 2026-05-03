// Package safezone owns the spawn-area protection rules so every consumer
// (hazard ticking, contact damage, PvP, AI targeting) reads from a single
// authoritative source.
//
// The package intentionally has no dependency on the application/world
// package so it can be used by combat sub-systems without importing the
// orchestrator.
package safezone

import (
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
)

// Zone describes a circular spawn safezone.
type Zone struct {
	X, Y, Radius float64
}

// IsInside reports whether (x, y) lies within the zone radius.
func (z Zone) IsInside(x, y float64) bool {
	return physics.IsInSafeZone(x, y, z.X, z.Y, z.Radius)
}

// Protects reports whether the player is currently protected by this zone.
// The protection requires both the post-respawn timer to be active AND the
// player body to be inside the radius.
func (z Zone) Protects(p *player.Player) bool {
	if p == nil {
		return false
	}
	return p.IsProtected(z.X, z.Y, z.Radius)
}

// AnyProtected reports whether any of the supplied players is currently
// protected. Useful as the "safezone active" flag fed into enemy AI.
func (z Zone) AnyProtected(players map[string]*player.Player) bool {
	for _, p := range players {
		if z.Protects(p) {
			return true
		}
	}
	return false
}
