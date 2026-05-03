package safezone

import (
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
)

func TestZoneProtects(t *testing.T) {
	z := Zone{X: 100, Y: 100, Radius: 50}
	p := player.New("p1", "n", 110, 100) // inside radius
	if !z.Protects(p) {
		t.Fatalf("expected freshly spawned player inside zone to be protected")
	}
	// Timer expires
	for i := 0; i < 1000; i++ {
		p.Update(10*time.Millisecond, 1)
	}
	if z.Protects(p) {
		t.Fatalf("expected protection to expire once SafeZoneTimer reaches 0")
	}
}

func TestZoneProtectsRequiresInside(t *testing.T) {
	z := Zone{X: 0, Y: 0, Radius: 50}
	p := player.New("p2", "n", 200, 0) // outside radius
	if z.Protects(p) {
		t.Fatalf("player outside radius must not be protected even with timer active")
	}
}

func TestAnyProtected(t *testing.T) {
	z := Zone{X: 0, Y: 0, Radius: 50}
	players := map[string]*player.Player{
		"a": player.New("a", "n", 500, 0), // outside
		"b": player.New("b", "n", 10, 0),  // inside
	}
	if !z.AnyProtected(players) {
		t.Fatalf("expected at least one player to be protected")
	}
	delete(players, "b")
	if z.AnyProtected(players) {
		t.Fatalf("no player inside zone, expected AnyProtected=false")
	}
}
