package wsapi

import (
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/codec"
	"github.com/williamisnotdefined/zelda-proto/server/internal/protocol"
)

// TestPlayerActuallyMovesAndCasts is a regression guard for the migration
// bug where the player did not move, change direction, or cast on Go server.
func TestPlayerActuallyMovesAndCasts(t *testing.T) {
	t.Parallel()
	d, mgr, conn := newDispatcher(t)

	if err := d.HandleJoin("c1", protocol.JoinMessage{Nickname: "Link"}); err != nil {
		t.Fatal(err)
	}
	playerID := d.connections["c1"].playerID
	loc, _ := mgr.LocationOf(playerID)
	w := mgr.World(loc)
	startX := w.Players()[playerID].X
	startY := w.Players()[playerID].Y

	// Press right for ~30 ticks (480ms) — should move ~72px at 150 px/s.
	if err := d.HandleInput("c1", protocol.InputMessage{Seq: 1, Right: true}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 30; i++ {
		d.Sim(16 * time.Millisecond)
	}
	p := w.Players()[playerID]
	if p.X-startX < 50 {
		t.Fatalf("expected player to move right >50px after 30 ticks, got deltaX=%.1f", p.X-startX)
	}
	if string(p.Direction) != "right" {
		t.Fatalf("expected direction=right, got %q", p.Direction)
	}
	if p.Y != startY {
		t.Fatalf("expected Y unchanged, got %.1f vs %.1f", p.Y, startY)
	}

	// Press molotov — should spawn a hazard without entering an attacking state.
	if err := d.HandleInput("c1", protocol.InputMessage{Seq: 2, Molotov: true}); err != nil {
		t.Fatal(err)
	}
	d.Sim(16 * time.Millisecond)
	p = w.Players()[playerID]
	if string(p.State) == "attacking" {
		t.Fatalf("expected molotov cast to avoid attacking state, got %q", p.State)
	}
	foundMolotov := false
	for _, h := range w.Snapshot().Hazards {
		if string(h.Kind) == "molotov" {
			foundMolotov = true
			break
		}
	}
	if !foundMolotov {
		t.Fatal("expected molotov hazard after Molotov input")
	}

	// Direction change: press up.
	if err := d.HandleInput("c1", protocol.InputMessage{Seq: 3, Up: true}); err != nil {
		t.Fatal(err)
	}
	// Let the world advance a bit more before checking the next direction change.
	for i := 0; i < 25; i++ {
		d.Sim(16 * time.Millisecond)
	}
	p = w.Players()[playerID]
	if string(p.Direction) != "up" {
		t.Fatalf("expected direction=up after Up input, got %q", p.Direction)
	}

	// Sanity: at least one snapshot was sent.
	d.Broadcast()
	frames := conn.snapshot()
	if len(frames) < 2 {
		t.Fatalf("expected ≥2 frames (welcome + snapshot), got %d", len(frames))
	}
}

// TestEnemiesChasePlayer guards the AI bug where mobs stayed eternally idle.
func TestEnemiesChasePlayer(t *testing.T) {
	t.Parallel()
	d, mgr, _ := newDispatcher(t)
	if err := d.HandleJoin("c1", protocol.JoinMessage{Nickname: "Link"}); err != nil {
		t.Fatal(err)
	}
	playerID := d.connections["c1"].playerID
	loc, _ := mgr.LocationOf(playerID)
	w := mgr.World(loc)
	p := w.RemovePlayer(playerID)
	if p == nil {
		t.Fatal("expected joined player in world")
	}
	w.AdoptPlayer(p, 1000, 1000)
	p.SafeZoneTimer = 0

	// Place the player outside the permanent city so enemies can engage.
	for i := 0; i < 5; i++ {
		d.Sim(20 * time.Millisecond)
	}

	view := w.Snapshot()
	if len(view.Enemies) == 0 {
		t.Fatalf("expected enemies to spawn around player, got 0")
	}
	player := w.Players()[playerID]
	t.Logf("player at (%.1f,%.1f); %d enemies in view", player.X, player.Y, len(view.Enemies))

	before := make(map[string][2]float64, len(view.Enemies))
	for _, e := range view.Enemies {
		before[e.ID] = [2]float64{e.X, e.Y}
	}

	for i := 0; i < 60; i++ {
		d.Sim(16 * time.Millisecond)
	}
	view2 := w.Snapshot()
	moved := 0
	for _, e := range view2.Enemies {
		prev, ok := before[e.ID]
		if !ok {
			continue
		}
		if e.X != prev[0] || e.Y != prev[1] {
			moved++
		}
	}
	if moved == 0 {
		t.Fatalf("expected at least one enemy to move toward player; 0 of %d moved", len(view2.Enemies))
	}
}

// TestSnapshotDeltaIncludesEnemyMovements guards the wire-format regression
// where enemyTransforms was missing in subsequent ticks.
func TestSnapshotDeltaIncludesEnemyMovements(t *testing.T) {
	t.Parallel()
	d, mgr, conn := newDispatcher(t)
	if err := d.HandleJoin("c1", protocol.JoinMessage{Nickname: "Link"}); err != nil {
		t.Fatal(err)
	}
	playerID := d.connections["c1"].playerID
	loc, _ := mgr.LocationOf(playerID)
	w := mgr.World(loc)
	p := w.RemovePlayer(playerID)
	if p == nil {
		t.Fatal("expected joined player in world")
	}
	w.AdoptPlayer(p, 1000, 1000)
	p.SafeZoneTimer = 0

	// Place the player outside the permanent city, then accumulate enemy diffs.
	for i := 0; i < 5; i++ {
		d.Sim(20 * time.Millisecond)
	}
	d.Broadcast() // initial full
	for i := 0; i < 30; i++ {
		d.Sim(20 * time.Millisecond)
		d.Broadcast()
	}

	frames := conn.snapshot()
	if len(frames) < 3 {
		t.Fatalf("expected several snapshot frames, got %d", len(frames))
	}

	sawTransforms := false
	for _, f := range frames {
		v, err := codec.Decode(f)
		if err != nil {
			continue
		}
		obj, ok := v.(codec.Object)
		if !ok {
			continue
		}
		typ, _ := obj.Lookup("type")
		if typ != string(protocol.ServerMessageTypeSnapshotDelta) {
			continue
		}
		full, _ := obj.Lookup("full")
		if b, _ := full.(bool); b {
			continue
		}
		t2, _ := obj.Lookup("enemyTransforms")
		arr, _ := t2.([]any)
		if len(arr) > 0 {
			sawTransforms = true
			break
		}
	}
	if !sawTransforms {
		t.Fatalf("expected at least one delta with non-empty enemyTransforms; got 0 across %d frames", len(frames))
	}
}
