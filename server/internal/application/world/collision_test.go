package world

import (
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
)

func stationaryEnemyConfig(cfg enemy.Config) enemy.Config {
	cfg.Speed = 0
	return cfg
}

func TestEnemyContactDamageRepeatsEverySecondWhileTouching(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	x, y := 1000.0, 1000.0
	p := w.AddPlayer("p1", "Link", &x, &y)
	p.SafeZoneTimer = 0
	e := enemy.New("e1", 1000, 1000, "0,0", stationaryEnemyConfig(enemy.BlobConfig), drop.KindHeartSmall)
	w.SpawnEnemy(e)

	w.Tick(20 * time.Millisecond)
	if got, want := p.HP, player.MaxHP-e.Config.Damage; got != want {
		t.Fatalf("expected first contact hit HP=%d, got %d", want, got)
	}

	w.Tick(500 * time.Millisecond)
	if got, want := p.HP, player.MaxHP-e.Config.Damage; got != want {
		t.Fatalf("expected cooldown to block retrigger, want HP=%d got %d", want, got)
	}

	w.Tick(500 * time.Millisecond)
	if got, want := p.HP, player.MaxHP-(2*e.Config.Damage); got != want {
		t.Fatalf("expected repeated contact hit after 1s, want HP=%d got %d", want, got)
	}
}

func TestOverlappingEnemiesAreSeparated(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	e1 := enemy.New("e1", 1000, 1000, "0,0", stationaryEnemyConfig(enemy.BlobConfig), drop.KindHeartSmall)
	e2 := enemy.New("e2", 1000, 1000, "0,0", stationaryEnemyConfig(enemy.BlobConfig), drop.KindHeartSmall)
	w.SpawnEnemy(e1)
	w.SpawnEnemy(e2)

	w.Tick(20 * time.Millisecond)
	minDist := e1.CollisionRadius() + e2.CollisionRadius()
	if got := physics.Distance(e1.X, e1.Y, e2.X, e2.Y); got < minDist-0.01 {
		t.Fatalf("expected enemies separated by at least %.2f, got %.2f", minDist, got)
	}
}

func TestPlayersAreSeparatedOnJoin(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	x, y := 1000.0, 1000.0
	p1 := w.AddPlayer("p1", "Link", &x, &y)
	p2 := w.AddPlayer("p2", "Zelda", &x, &y)
	p1.SafeZoneTimer = 0
	p2.SafeZoneTimer = 0

	minDist := float64(player.Width)
	if got := physics.Distance(p1.X, p1.Y, p2.X, p2.Y); got < minDist-0.01 {
		t.Fatalf("expected players separated by at least %.2f, got %.2f", minDist, got)
	}
}

func TestPlayerDoesNotPassThroughEnemyBody(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	px, py := 1000.0, 1000.0
	p := w.AddPlayer("p1", "Link", &px, &py)
	p.SafeZoneTimer = 0
	ex := 1060.0
	e := enemy.New("e1", ex, py, "0,0", stationaryEnemyConfig(enemy.BlobConfig), drop.KindHeartSmall)
	w.SpawnEnemy(e)
	w.HandleInput("p1", player.Input{Seq: 1, Right: true})

	for i := 0; i < 60; i++ {
		w.Tick(20 * time.Millisecond)
	}

	minDist := e.CollisionRadius() + player.Width/2
	if got := physics.Distance(p.X, p.Y, e.X, e.Y); got < minDist-0.01 {
		t.Fatalf("expected player and enemy to remain separated by at least %.2f, got %.2f", minDist, got)
	}
	if p.X >= e.X {
		t.Fatalf("expected player to stay on the near side of the enemy, got player X=%.2f enemy X=%.2f", p.X, e.X)
	}
}

func TestGelehkChargeStopsOnSolidCollision(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	px, py := 1200.0, 1000.0
	p := w.AddPlayer("p1", "Link", &px, &py)
	p.SafeZoneTimer = 0

	g := boss.NewGelehk("g1", 1000, 1000)
	g.Active = true
	g.Phase = 2
	g.HP = g.MaxHP / 2
	w.SpawnGelehk(g)

	blocker := enemy.New("e1", 1065, 1000, "0,0", stationaryEnemyConfig(enemy.BlobConfig), drop.KindHeartSmall)
	w.SpawnEnemy(blocker)

	for i := 0; i < 26; i++ {
		w.Tick(20 * time.Millisecond)
	}

	if g.State != boss.StateIdle {
		t.Fatalf("expected charge to stop on body collision, got %s", g.State)
	}
	if g.AttackTimer != boss.GelehkPhase2Cooldown {
		t.Fatalf("expected charge cooldown after collision stop, got %s", g.AttackTimer)
	}
}
