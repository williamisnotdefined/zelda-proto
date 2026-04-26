// Package physics provides geometric primitives shared by the simulation
// systems: axis-aligned bounding boxes, circles, distance helpers, and the
// snapshot quantization rule.
package physics

import (
	"math"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/world"
)

// AABB is an axis-aligned bounding box anchored at its top-left corner.
type AABB struct {
	X, Y, W, H float64
}

// Circle is a 2D circle defined by its center and radius.
type Circle struct {
	X, Y, R float64
}

// EntityAABB returns the bounding box centered on (x, y) with size w x h.
func EntityAABB(x, y, w, h float64) AABB {
	return AABB{X: x - w/2, Y: y - h/2, W: w, H: h}
}

// EntityCircle returns a circle centered on (x, y) with radius r.
func EntityCircle(x, y, r float64) Circle {
	return Circle{X: x, Y: y, R: r}
}

// AABBOverlap reports whether two AABBs overlap (open intervals on both axes).
func AABBOverlap(a, b AABB) bool {
	return a.X < b.X+b.W && a.X+a.W > b.X && a.Y < b.Y+b.H && a.Y+a.H > b.Y
}

// CircleOverlap reports whether two circles overlap.
func CircleOverlap(a, b Circle) bool {
	dx := b.X - a.X
	dy := b.Y - a.Y
	rr := a.R + b.R
	return dx*dx+dy*dy <= rr*rr
}

// CircleAABBOverlap reports whether circle c overlaps box b.
func CircleAABBOverlap(c Circle, b AABB) bool {
	nearestX := Clamp(c.X, b.X, b.X+b.W)
	nearestY := Clamp(c.Y, b.Y, b.Y+b.H)
	dx := c.X - nearestX
	dy := c.Y - nearestY
	return dx*dx+dy*dy <= c.R*c.R
}

// DistanceSquared returns the squared Euclidean distance between two points.
func DistanceSquared(x1, y1, x2, y2 float64) float64 {
	dx := x2 - x1
	dy := y2 - y1
	return dx*dx + dy*dy
}

// Distance returns the Euclidean distance between two points.
func Distance(x1, y1, x2, y2 float64) float64 {
	return math.Sqrt(DistanceSquared(x1, y1, x2, y2))
}

// Clamp restricts value to the inclusive range [min, max]. When min > max the
// behaviour is undefined; callers must validate inputs.
func Clamp(value, minimum, maximum float64) float64 {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}
	return value
}

// IsInSafeZone reports whether (x, y) lies within the spawn safe zone defined
// by (spawnX, spawnY, safeRadius).
func IsInSafeZone(x, y, spawnX, spawnY, safeRadius float64) bool {
	return DistanceSquared(x, y, spawnX, spawnY) <= safeRadius*safeRadius
}

// QuantizePosition rounds a world-space coordinate to the snapshot precision
// used by both server and client (matches the legacy TS implementation).
func QuantizePosition(value float64) float64 {
	return math.Round(value*world.PositionPrecision) / world.PositionPrecision
}
