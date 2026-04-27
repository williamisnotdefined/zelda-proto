package instance

import (
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/player"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/portal"
	domworld "github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/world"
)

type counterIDs struct{ n atomic.Int64 }

func (c *counterIDs) NewID(prefix string) string {
	return prefix + "_" + strconv.FormatInt(c.n.Add(1), 10)
}

func TestManagerSeedsAllInstances(t *testing.T) {
	t.Parallel()

	m := New(Config{IDs: &counterIDs{}, StartPhase: domworld.InstancePhase1})
	for _, id := range domworld.AllInstances() {
		if m.World(id) == nil {
			t.Fatalf("missing world for %s", id)
		}
	}
}

func TestManagerInvalidStartPhaseFallsBack(t *testing.T) {
	t.Parallel()

	m := New(Config{IDs: &counterIDs{}, StartPhase: domworld.InstanceID("invalid")})
	if _, loc := m.AddPlayer("p1", "Link"); loc != domworld.InstancePhase1 {
		t.Fatalf("expected phase1 default, got %s", loc)
	}
}

func TestAddRemoveRoutesPlayer(t *testing.T) {
	t.Parallel()

	m := New(Config{IDs: &counterIDs{}, StartPhase: domworld.InstancePhase1})
	_, loc := m.AddPlayer("p1", "Link")
	if loc != domworld.InstancePhase1 {
		t.Fatalf("expected phase1, got %s", loc)
	}
	if l, ok := m.LocationOf("p1"); !ok || l != domworld.InstancePhase1 {
		t.Fatal("expected location tracked")
	}
	m.RemovePlayer("p1")
	if _, ok := m.LocationOf("p1"); ok {
		t.Fatal("expected location removed")
	}
	m.RemovePlayer("ghost") // no-op
}

func TestTickResolvesPortalTransfer(t *testing.T) {
	t.Parallel()

	m := New(Config{IDs: &counterIDs{}, StartPhase: domworld.InstancePhase1})
	x, y := 500.0, 500.0
	w := m.World(domworld.InstancePhase1)
	p := w.AddPlayer("p1", "Link", &x, &y)
	p.SafeZoneTimer = 0
	m.playerLocation["p1"] = domworld.InstancePhase1
	w.SpawnPortal(&portal.Portal{
		ID: "pt", X: 500, Y: 500, Kind: portal.Phase1ToPhase2,
		ToInstance: domworld.InstancePhase2,
		TargetX:    100, TargetY: 100,
	})
	m.Tick(20 * time.Millisecond)
	loc, _ := m.LocationOf("p1")
	if loc != domworld.InstancePhase2 {
		t.Fatalf("expected phase2 after transfer, got %s", loc)
	}
	if w.Players()["p1"] != nil {
		t.Fatal("expected removal from origin world")
	}
	if m.World(domworld.InstancePhase2).Players()["p1"] != p {
		t.Fatal("expected adoption at destination")
	}
	if p.SafeZoneTimer != player.SafeZoneDuration {
		t.Fatalf("expected safezone rearmed on transfer, got %s", p.SafeZoneTimer)
	}
	if p.PhaseTransferCooldown != 800*time.Millisecond {
		t.Fatalf("expected 800ms post-transfer cooldown, got %s", p.PhaseTransferCooldown)
	}
}

func TestHandleInputForwardsToHostingWorld(t *testing.T) {
	t.Parallel()

	m := New(Config{IDs: &counterIDs{}, StartPhase: domworld.InstancePhase1})
	p, _ := m.AddPlayer("p1", "Link")
	m.HandleInput("p1", player.Input{Seq: 1, Right: true})
	m.Tick(time.Second)
	if p.X <= domworld.SpawnX {
		t.Fatalf("expected motion right, got %v", p.X)
	}
	m.HandleInput("ghost", player.Input{Seq: 1, Right: true}) // no-op
}
