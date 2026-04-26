package physics

import (
	"math"
	"testing"
)

func TestEntityAABBCentersOnPoint(t *testing.T) {
	t.Parallel()

	box := EntityAABB(10, 20, 4, 6)
	if box.X != 8 || box.Y != 17 || box.W != 4 || box.H != 6 {
		t.Fatalf("unexpected box %+v", box)
	}
}

func TestEntityCircle(t *testing.T) {
	t.Parallel()

	c := EntityCircle(1, 2, 3)
	if c.X != 1 || c.Y != 2 || c.R != 3 {
		t.Fatalf("unexpected circle %+v", c)
	}
}

func TestAABBOverlap(t *testing.T) {
	t.Parallel()

	a := AABB{X: 0, Y: 0, W: 10, H: 10}
	b := AABB{X: 5, Y: 5, W: 10, H: 10}
	if !AABBOverlap(a, b) {
		t.Fatal("expected overlap")
	}

	c := AABB{X: 20, Y: 20, W: 5, H: 5}
	if AABBOverlap(a, c) {
		t.Fatal("expected no overlap")
	}

	touching := AABB{X: 10, Y: 0, W: 5, H: 5}
	if AABBOverlap(a, touching) {
		t.Fatal("expected touching boxes to not overlap (open interval)")
	}
}

func TestCircleOverlap(t *testing.T) {
	t.Parallel()

	if !CircleOverlap(Circle{0, 0, 5}, Circle{4, 0, 2}) {
		t.Fatal("expected overlap")
	}
	if CircleOverlap(Circle{0, 0, 1}, Circle{10, 0, 1}) {
		t.Fatal("expected no overlap")
	}
	if !CircleOverlap(Circle{0, 0, 1}, Circle{2, 0, 1}) {
		t.Fatal("expected exact-touch to count as overlap")
	}
}

func TestCircleAABBOverlap(t *testing.T) {
	t.Parallel()

	box := AABB{X: 0, Y: 0, W: 10, H: 10}
	if !CircleAABBOverlap(Circle{5, 5, 1}, box) {
		t.Fatal("expected center-inside circle to overlap")
	}
	if !CircleAABBOverlap(Circle{-1, 5, 2}, box) {
		t.Fatal("expected edge-touching circle to overlap")
	}
	if CircleAABBOverlap(Circle{-5, 5, 2}, box) {
		t.Fatal("expected far-circle to miss")
	}
	if !CircleAABBOverlap(Circle{12, 12, 5}, box) {
		t.Fatal("expected diagonal overlap via corner")
	}
}

func TestDistanceAndDistanceSquared(t *testing.T) {
	t.Parallel()

	if got := DistanceSquared(0, 0, 3, 4); got != 25 {
		t.Fatalf("expected 25, got %v", got)
	}
	if got := Distance(0, 0, 3, 4); math.Abs(got-5) > 1e-9 {
		t.Fatalf("expected 5, got %v", got)
	}
}

func TestClampWithinBounds(t *testing.T) {
	t.Parallel()

	if Clamp(5, 0, 10) != 5 {
		t.Fatal("expected mid-range value to be returned untouched")
	}
	if Clamp(-1, 0, 10) != 0 {
		t.Fatal("expected lower bound")
	}
	if Clamp(11, 0, 10) != 10 {
		t.Fatal("expected upper bound")
	}
}

func TestIsInSafeZone(t *testing.T) {
	t.Parallel()

	if !IsInSafeZone(200, 200, 200, 200, 150) {
		t.Fatal("center should be inside")
	}
	if !IsInSafeZone(310, 200, 200, 200, 150) {
		t.Fatal("edge should be inside")
	}
	if IsInSafeZone(400, 200, 200, 200, 150) {
		t.Fatal("far point should be outside")
	}
}

func TestQuantizePositionRoundsToPrecision(t *testing.T) {
	t.Parallel()

	cases := []struct {
		input    float64
		expected float64
	}{
		{12.34, 12.3},
		{12.35, 12.4},
		{-3.44, -3.4},
		{0, 0},
	}
	for _, tc := range cases {
		if got := QuantizePosition(tc.input); math.Abs(got-tc.expected) > 1e-9 {
			t.Fatalf("QuantizePosition(%v)=%v, expected %v", tc.input, got, tc.expected)
		}
	}
}
