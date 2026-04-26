package world

import (
	"math/rand"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/player"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/portal"
	domworld "github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/world"
)

type counterIDs struct{ n atomic.Int64 }

func (c *counterIDs) NewID(prefix string) string {
	return prefix + "_" + strconv.FormatInt(c.n.Add(1), 10)
}

func newWorld(t *testing.T) *World {
	t.Helper()
	return New(Config{
		InstanceID: domworld.InstancePhase1,
		SpawnX:     200, SpawnY: 200,
		IDs:  &counterIDs{},
		Rand: rand.New(rand.NewSource(1)),
	})
}

func TestAddRemovePlayer(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	p := w.AddPlayer("p1", "Link", nil, nil)
	if p.X != 200 || p.Y != 200 {
		t.Fatalf("expected spawn position, got (%v,%v)", p.X, p.Y)
	}
	if w.RemovePlayer("p1") == nil {
		t.Fatal("expected removed player")
	}
	if w.RemovePlayer("ghost") != nil {
		t.Fatal("expected nil for missing player")
	}
}

func TestTickAdvancesPlayer(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	p := w.AddPlayer("p1", "Link", nil, nil)
	w.HandleInput("p1", player.Input{Seq: 1, Right: true})
	w.Tick(time.Second)
	if p.X <= 200 {
		t.Fatalf("expected x to increase, got %v", p.X)
	}
}

func TestEnemyContactDamagesPlayerOutsideSafeZone(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	x, y := 1000.0, 1000.0
	p := w.AddPlayer("p1", "Link", &x, &y)
	p.SafeZoneTimer = 0
	e := enemy.New("e1", 1000, 1000, "0,0", enemy.BlobConfig, drop.KindHeartSmall)
	w.SpawnEnemy(e)
	w.Tick(20 * time.Millisecond)
	if p.HP >= player.MaxHP {
		t.Fatalf("expected damage, got HP=%d", p.HP)
	}
}

func TestPlayerMeleeKillsEnemyAndCountsKill(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	x, y := 1000.0, 1000.0
	p := w.AddPlayer("p1", "Link", &x, &y)
	p.SafeZoneTimer = 0
	e := enemy.New("e1", 1015, 1000, "0,0", enemy.HandConfig, drop.KindHeartSmall)
	w.SpawnEnemy(e)
	w.HandleInput("p1", player.Input{Seq: 1, Right: true, Attack: true})
	for i := 0; i < 5; i++ {
		w.Tick(20 * time.Millisecond)
	}
	if e.State != enemy.StateDead {
		t.Fatalf("expected enemy dead, got %s hp=%d", e.State, e.HP)
	}
	if p.MonsterKills < 1 {
		t.Fatalf("expected kill counted, got %d", p.MonsterKills)
	}
}

func TestPortalQueuesTransferRequest(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	x, y := 500.0, 500.0
	w.AddPlayer("p1", "Link", &x, &y)
	w.SpawnPortal(&portal.Portal{
		ID: "pt1", X: 500, Y: 500, Kind: portal.Phase1ToPhase2,
		ToInstance: domworld.InstancePhase2,
		TargetX:    100, TargetY: 100,
		ActiveAt: time.Time{},
	})
	w.Tick(20 * time.Millisecond)
	reqs := w.ConsumeTransferRequests()
	if len(reqs) != 1 {
		t.Fatalf("expected 1 transfer, got %d", len(reqs))
	}
	if reqs[0].ToInstance != domworld.InstancePhase2 {
		t.Fatalf("wrong target")
	}
}

func TestDragonFiresHazardLine(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	x, y := 0.0, 0.0
	p := w.AddPlayer("p1", "Link", &x, &y)
	p.SafeZoneTimer = 0
	d := boss.NewDragonLord("d1", 200, 0)
	w.SpawnDragon(d)
	for i := 0; i < 10; i++ {
		w.Tick(50 * time.Millisecond)
	}
	if len(w.hazards) == 0 {
		t.Fatal("expected dragon to spawn hazards")
	}
}

func TestSnapshotIncludesEntities(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.AddPlayer("p1", "Link", nil, nil)
	w.SpawnEnemy(enemy.New("e1", 0, 0, "0,0", enemy.BlobConfig, drop.KindHeartSmall))
	w.SpawnDragon(boss.NewDragonLord("d1", 100, 100))
	w.SpawnGelehk(boss.NewGelehk("g1", 200, 200))
	w.Tick(10 * time.Millisecond)
	snap := w.Snapshot()
	if len(snap.Players) != 1 || len(snap.Enemies) != 1 || len(snap.Bosses) != 2 {
		t.Fatalf("unexpected snapshot: %+v", snap)
	}
}

func TestAdoptPlayer(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	p := player.New("p1", "Link", 0, 0)
	w.AdoptPlayer(p, 100, 100)
	if w.Players()["p1"] == nil {
		t.Fatal("expected adoption")
	}
}
