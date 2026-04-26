package enemy

import (
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/drop"
)

func aliveTarget(id string, x, y float64) PlayerView {
	return PlayerView{ID: id, X: x, Y: y, Alive: true}
}

func TestNewBlobDefaults(t *testing.T) {
	t.Parallel()

	e := New("e1", 0, 0, "0,0", BlobConfig, drop.KindHeartSmall)
	if e.HP != BlobConfig.MaxHP || e.State != StateIdle || e.Kind != KindBlob {
		t.Fatalf("unexpected init: %+v", e)
	}
}

func TestUpdateMovesTowardTarget(t *testing.T) {
	t.Parallel()

	e := New("e1", 0, 0, "0,0", BlobConfig, drop.KindHeartSmall)
	players := []PlayerView{aliveTarget("p1", 100, 0)}
	e.Update(time.Second, players, false, 0, 0, 0, nil)
	if e.X <= 0 {
		t.Fatalf("expected to move toward (100,0), got X=%v", e.X)
	}
	if e.State != StateChasing && e.State != StateAttacking {
		t.Fatalf("expected chasing/attacking, got %s", e.State)
	}
}

func TestUpdateAcquiresViaCallback(t *testing.T) {
	t.Parallel()

	e := New("e1", 0, 0, "0,0", BlobConfig, drop.KindHeartSmall)
	called := false
	find := func(x, y, r float64, pred func(PlayerView) bool) *PlayerView {
		called = true
		p := aliveTarget("p1", 50, 0)
		if pred(p) {
			return &p
		}
		return nil
	}
	e.Update(50*time.Millisecond, nil, false, 0, 0, 0, find)
	if !called {
		t.Fatal("expected callback to be invoked")
	}
}

func TestUpdateDeflectsFromSafeZone(t *testing.T) {
	t.Parallel()

	e := New("e1", 200, 50, "0,0", BlobConfig, drop.KindHeartSmall)
	players := []PlayerView{aliveTarget("p1", 200, 200)}
	for i := 0; i < 10; i++ {
		e.Update(50*time.Millisecond, players, true, 200, 200, 150, nil)
	}
	dx := e.X - 200
	dy := e.Y - 200
	if dx*dx+dy*dy < 150*150 {
		t.Fatalf("enemy entered safe zone: (%v, %v)", e.X, e.Y)
	}
}

func TestTakeDamageKillsAndStartsRespawn(t *testing.T) {
	t.Parallel()

	e := New("e1", 0, 0, "0,0", BlobConfig, drop.KindHeartSmall)
	e.TakeDamage(BlobConfig.MaxHP + 5)
	if e.State != StateDead {
		t.Fatalf("expected dead, got %s", e.State)
	}
	e.TakeDamage(10)
	if e.RespawnTimer != BlobConfig.RespawnTime {
		t.Fatalf("expected respawn timer reset, got %s", e.RespawnTimer)
	}
}

func TestTryRespawnRestoresState(t *testing.T) {
	t.Parallel()

	e := New("e1", 10, 10, "0,0", BlobConfig, drop.KindHeartSmall)
	e.X, e.Y = 99, 99
	e.TakeDamage(BlobConfig.MaxHP)
	if e.TryRespawn(BlobConfig.RespawnTime - time.Millisecond) {
		t.Fatal("expected respawn to wait for timer")
	}
	if !e.TryRespawn(2 * time.Millisecond) {
		t.Fatal("expected respawn after timer")
	}
	if e.X != 10 || e.Y != 10 || e.HP != BlobConfig.MaxHP || e.State != StateIdle {
		t.Fatalf("unexpected respawn state: %+v", e)
	}
}

func TestTryRespawnSkippedWhenDisabled(t *testing.T) {
	t.Parallel()

	e := New("e1", 0, 0, "0,0", BlobConfig, drop.KindHeartSmall)
	e.RespawnEnabled = false
	e.TakeDamage(BlobConfig.MaxHP)
	if e.TryRespawn(2 * BlobConfig.RespawnTime) {
		t.Fatal("expected disabled respawn to be skipped")
	}
}

func TestPacmanGhostVariantPropagated(t *testing.T) {
	t.Parallel()

	e := NewPacmanGhost("g1", 0, 0, "0,0", PacmanRed, drop.KindHeartPacman)
	snap := e.Snapshot()
	if snap.Variant != PacmanRed {
		t.Fatalf("expected variant %s, got %s", PacmanRed, snap.Variant)
	}
	if snap.Kind != KindPacmanGhost {
		t.Fatalf("expected kind pacman_ghost, got %s", snap.Kind)
	}
}

func TestSnapshotQuantization(t *testing.T) {
	t.Parallel()

	e := New("e1", 12.34, 56.78, "0,0", BlobConfig, drop.KindHeartSmall)
	snap := e.Snapshot()
	if snap.X != 12.3 || snap.Y != 56.8 {
		t.Fatalf("expected quantized (12.3, 56.8), got (%v, %v)", snap.X, snap.Y)
	}
}
