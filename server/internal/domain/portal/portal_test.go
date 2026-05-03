package portal

import (
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

func TestPortalActive(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	expires := now.Add(2 * time.Second)
	p := &Portal{
		ID: "p1", X: 0, Y: 0, Kind: Phase1ToPhase2,
		ToInstance: world.InstancePhase2,
		ActiveAt:   now.Add(time.Second),
		ExpiresAt:  &expires,
	}
	if p.Active(now) {
		t.Fatal("expected inactive before activation")
	}
	if !p.Active(now.Add(1500 * time.Millisecond)) {
		t.Fatal("expected active during window")
	}
	if p.Active(now.Add(3 * time.Second)) {
		t.Fatal("expected inactive after expiry")
	}
}

func TestPortalActiveWithoutExpiry(t *testing.T) {
	t.Parallel()

	now := time.Now()
	p := &Portal{ActiveAt: now.Add(-time.Second)}
	if !p.Active(now) {
		t.Fatal("expected active without expiry")
	}
}
