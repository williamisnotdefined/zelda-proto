package world

import (
	"math"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

const cityOnePlayerCollisionRadius = 16.0

type cityOneColliderKind int

const (
	cityOneColliderCircle cityOneColliderKind = iota
	cityOneColliderRect
)

type cityOneCollider struct {
	kind         cityOneColliderKind
	x, y         float64
	radius       float64
	halfW, halfH float64
}

var cityOneColliders = []cityOneCollider{
	// Lake body, split to match the visible water tiles while keeping bridge/landing walkable.
	{kind: cityOneColliderRect, x: -368, y: 80, halfW: 160, halfH: 64},
	{kind: cityOneColliderRect, x: -448, y: 208, halfW: 80, halfH: 64},
	{kind: cityOneColliderRect, x: -368, y: 304, halfW: 160, halfH: 32},
	{kind: cityOneColliderRect, x: -256, y: 160, halfW: 80, halfH: 16},
	{kind: cityOneColliderRect, x: -304, y: 336, halfW: 128, halfH: 64},

	// Outer and inner fences.
	{kind: cityOneColliderRect, x: -180, y: -260, halfW: 112, halfH: 12},
	{kind: cityOneColliderRect, x: 290, y: -260, halfW: 126, halfH: 12},
	{kind: cityOneColliderRect, x: -180, y: 500, halfW: 112, halfH: 12},
	{kind: cityOneColliderRect, x: 290, y: 500, halfW: 126, halfH: 12},
	{kind: cityOneColliderRect, x: -292, y: -57, halfW: 12, halfH: 155},
	{kind: cityOneColliderRect, x: -292, y: 379, halfW: 12, halfH: 121},
	{kind: cityOneColliderRect, x: 548, y: -57, halfW: 12, halfH: 155},
	{kind: cityOneColliderRect, x: 548, y: 379, halfW: 12, halfH: 121},
	{kind: cityOneColliderRect, x: -34, y: -228, halfW: 146, halfH: 12},
	{kind: cityOneColliderRect, x: 246, y: 112, halfW: 28, halfH: 12},
	{kind: cityOneColliderRect, x: 294, y: 112, halfW: 28, halfH: 12},
	{kind: cityOneColliderRect, x: 390, y: 112, halfW: 28, halfH: 12},

	// Trees use trunk/base collision, not the full canopy.
	{kind: cityOneColliderCircle, x: -290, y: -170, radius: 25},
	{kind: cityOneColliderCircle, x: -135, y: -225, radius: 24},
	{kind: cityOneColliderCircle, x: 60, y: -252, radius: 24},
	{kind: cityOneColliderCircle, x: 310, y: -215, radius: 24},
	{kind: cityOneColliderCircle, x: 510, y: -90, radius: 25},
	{kind: cityOneColliderCircle, x: 560, y: 175, radius: 24},
	{kind: cityOneColliderCircle, x: 500, y: 460, radius: 24},
	{kind: cityOneColliderCircle, x: 240, y: 570, radius: 25},
	{kind: cityOneColliderCircle, x: -70, y: 555, radius: 24},
	{kind: cityOneColliderCircle, x: -335, y: 435, radius: 24},
	{kind: cityOneColliderCircle, x: -395, y: 125, radius: 25},
	{kind: cityOneColliderCircle, x: -360, y: -55, radius: 24},

	// Large rocks.
	{kind: cityOneColliderCircle, x: -270, y: -170, radius: 24},
	{kind: cityOneColliderCircle, x: 228, y: -238, radius: 24},
	{kind: cityOneColliderCircle, x: 468, y: -192, radius: 24},
	{kind: cityOneColliderRect, x: 520, y: 28, halfW: 24, halfH: 16},
	{kind: cityOneColliderCircle, x: 452, y: 330, radius: 24},
	{kind: cityOneColliderCircle, x: -122, y: 442, radius: 24},
	{kind: cityOneColliderCircle, x: -338, y: 280, radius: 24},

	// Crates, barrels, chests and campfire.
	{kind: cityOneColliderRect, x: -100, y: -188, halfW: 27, halfH: 27},
	{kind: cityOneColliderRect, x: -72, y: -220, halfW: 17, halfH: 17},
	{kind: cityOneColliderCircle, x: -36, y: -190, radius: 17},
	{kind: cityOneColliderRect, x: 84, y: -188, halfW: 27, halfH: 27},
	{kind: cityOneColliderRect, x: 122, y: -220, halfW: 17, halfH: 17},
	{kind: cityOneColliderCircle, x: 158, y: -190, radius: 17},
	{kind: cityOneColliderRect, x: 360, y: -50, halfW: 17, halfH: 27},
	{kind: cityOneColliderRect, x: 396, y: -22, halfW: 27, halfH: 27},
	{kind: cityOneColliderCircle, x: 438, y: -34, radius: 17},
	{kind: cityOneColliderRect, x: 405, y: 72, halfW: 27, halfH: 22},
	{kind: cityOneColliderRect, x: 460, y: 104, halfW: 17, halfH: 17},
	{kind: cityOneColliderCircle, x: 344, y: 118, radius: 17},
	{kind: cityOneColliderRect, x: 24, y: 354, halfW: 18, halfH: 18},
	{kind: cityOneColliderCircle, x: -24, y: 360, radius: 17},
	{kind: cityOneColliderRect, x: 76, y: 382, halfW: 27, halfH: 27},
	{kind: cityOneColliderRect, x: -216, y: -90, halfW: 17, halfH: 17},
	{kind: cityOneColliderCircle, x: -258, y: -56, radius: 17},
	{kind: cityOneColliderRect, x: -208, y: -42, halfW: 17, halfH: 27},
	{kind: cityOneColliderRect, x: -224, y: 420, halfW: 27, halfH: 22},
	{kind: cityOneColliderCircle, x: -172, y: 422, radius: 17},
	{kind: cityOneColliderCircle, x: -30, y: 305, radius: 22},
}

func (w *World) resolvePlayersStaticCollisionsLocked() bool {
	if !w.hasCityOneStaticCollisions() {
		return false
	}
	moved := false
	for _, p := range w.players {
		if w.resolvePlayerStaticCollisionsLocked(p) {
			moved = true
		}
	}
	return moved
}

func (w *World) resolvePlayerStaticCollisionsLocked(p *player.Player) bool {
	if p == nil || p.State == player.StateDead || !w.hasCityOneStaticCollisions() {
		return false
	}
	movedAny := false
	for iteration := 0; iteration < 4; iteration++ {
		moved := false
		for _, collider := range cityOneColliders {
			if resolveCityOneCollider(&p.X, &p.Y, cityOnePlayerCollisionRadius, collider) {
				moved = true
				movedAny = true
			}
		}
		if !moved {
			break
		}
	}
	return movedAny
}

func (w *World) hasCityOneStaticCollisions() bool {
	return w.cfg.InstanceID == domworld.InstancePhase1
}

func resolveCityOneCollider(px, py *float64, playerRadius float64, collider cityOneCollider) bool {
	switch collider.kind {
	case cityOneColliderCircle:
		return resolveCityOneCircleCollider(px, py, playerRadius, collider)
	case cityOneColliderRect:
		return resolveCityOneRectCollider(px, py, playerRadius, collider)
	default:
		return false
	}
}

func resolveCityOneCircleCollider(px, py *float64, playerRadius float64, collider cityOneCollider) bool {
	cx := domworld.SpawnX + collider.x
	cy := domworld.SpawnY + collider.y
	minDistance := playerRadius + collider.radius
	dx := *px - cx
	dy := *py - cy
	distanceSq := dx*dx + dy*dy
	if distanceSq >= minDistance*minDistance {
		return false
	}
	if distanceSq == 0 {
		*px = cx + minDistance
		*py = cy
		return true
	}
	distance := math.Sqrt(distanceSq)
	overlap := minDistance - distance
	*px += (dx / distance) * overlap
	*py += (dy / distance) * overlap
	return true
}

func resolveCityOneRectCollider(px, py *float64, playerRadius float64, collider cityOneCollider) bool {
	cx := domworld.SpawnX + collider.x
	cy := domworld.SpawnY + collider.y
	minX := cx - collider.halfW
	maxX := cx + collider.halfW
	minY := cy - collider.halfH
	maxY := cy + collider.halfH
	nearestX := math.Max(minX, math.Min(*px, maxX))
	nearestY := math.Max(minY, math.Min(*py, maxY))
	dx := *px - nearestX
	dy := *py - nearestY
	distanceSq := dx*dx + dy*dy
	if distanceSq >= playerRadius*playerRadius {
		return false
	}

	if distanceSq == 0 {
		exitLeft := math.Abs(*px - minX)
		exitRight := math.Abs(maxX - *px)
		exitTop := math.Abs(*py - minY)
		exitBottom := math.Abs(maxY - *py)
		minExit := math.Min(math.Min(exitLeft, exitRight), math.Min(exitTop, exitBottom))

		switch minExit {
		case exitLeft:
			*px = minX - playerRadius
		case exitRight:
			*px = maxX + playerRadius
		case exitTop:
			*py = minY - playerRadius
		default:
			*py = maxY + playerRadius
		}
		return true
	}

	distance := math.Sqrt(distanceSq)
	overlap := playerRadius - distance
	*px += (dx / distance) * overlap
	*py += (dy / distance) * overlap
	return true
}
