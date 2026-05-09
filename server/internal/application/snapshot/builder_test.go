package snapshot

import (
	"testing"

	appworld "github.com/williamisnotdefined/zelda-proto/server/internal/application/world"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

func TestBuildCullsByRadius(t *testing.T) {
	t.Parallel()

	p := player.New("p1", "Link", 0, 0)
	view := appworld.SnapshotView{
		Tick:    1,
		Players: []player.Snapshot{p.Snapshot(), {ID: "p2", X: 5000, Y: 5000}},
		Enemies: []enemy.Snapshot{{ID: "e1", X: 100, Y: 100}, {ID: "e2", X: 9000, Y: 9000}},
	}
	b := NewBuilder()
	snap := b.Build(view, p, domworld.InstancePhase1)
	if len(snap.Players) != 0 {
		t.Fatalf("far player must be culled (also self excluded), got %v", snap.Players)
	}
	if len(snap.Enemies) != 1 {
		t.Fatalf("expected 1 near enemy, got %d", len(snap.Enemies))
	}
}

func TestDiffFirstCallIsFullUpsert(t *testing.T) {
	t.Parallel()

	p := player.New("p1", "Link", 0, 0)
	view := appworld.SnapshotView{Enemies: []enemy.Snapshot{{ID: "e1", X: 0, Y: 0}}}
	b := NewBuilder()
	snap := b.Build(view, p, domworld.InstancePhase1)
	delta := b.Diff("p1", snap)
	if len(delta.EnemiesUpsert) != 1 {
		t.Fatalf("expected enemy upsert, got %v", delta.EnemiesUpsert)
	}
}

func TestDiffDetectsRemoval(t *testing.T) {
	t.Parallel()

	p := player.New("p1", "Link", 0, 0)
	b := NewBuilder()
	v1 := appworld.SnapshotView{Enemies: []enemy.Snapshot{{ID: "e1"}, {ID: "e2"}}}
	b.Diff("p1", b.Build(v1, p, domworld.InstancePhase1))
	v2 := appworld.SnapshotView{Enemies: []enemy.Snapshot{{ID: "e1"}}}
	delta := b.Diff("p1", b.Build(v2, p, domworld.InstancePhase1))
	if len(delta.EnemiesRemove) != 1 || delta.EnemiesRemove[0] != "e2" {
		t.Fatalf("expected e2 removed, got %v", delta.EnemiesRemove)
	}
}

func TestForgetClearsPreviousSnapshot(t *testing.T) {
	t.Parallel()

	p := player.New("p1", "Link", 0, 0)
	b := NewBuilder()
	b.Diff("p1", b.Build(appworld.SnapshotView{}, p, domworld.InstancePhase1))
	b.Forget("p1")
	if _, ok := b.previous["p1"]; ok {
		t.Fatal("expected forget to clear cache")
	}
}

func TestLeaderboardOrder(t *testing.T) {
	t.Parallel()

	a := player.New("a", "Aaron", 0, 0)
	a.MonsterKills = 5
	b := player.New("b", "Beth", 0, 0)
	b.MonsterKills = 5
	b.PlayerKills = 1
	c := player.New("c", "Carl", 0, 0)
	c.MonsterKills = 3
	out := Leaderboard([]*player.Player{a, b, c}, 0)
	if out[0].PlayerID != "b" || out[1].PlayerID != "a" || out[2].PlayerID != "c" {
		t.Fatalf("unexpected order: %+v", out)
	}
}

func TestLeaderboardTopLimit(t *testing.T) {
	t.Parallel()

	players := []*player.Player{}
	for i := 0; i < 15; i++ {
		players = append(players, player.New("p", "n", 0, 0))
	}
	out := Leaderboard(players, 5)
	if len(out) != 5 {
		t.Fatalf("expected 5, got %d", len(out))
	}
}

func TestDropsAndPortalsHazardsCulling(t *testing.T) {
	t.Parallel()

	p := player.New("p1", "Link", 0, 0)
	view := appworld.SnapshotView{
		Drops: []drop.Snapshot{{ID: "d1", X: 0, Y: 0}, {ID: "d2", X: 9000, Y: 9000}},
	}
	b := NewBuilder()
	snap := b.Build(view, p, domworld.InstancePhase1)
	if len(snap.Drops) != 1 {
		t.Fatalf("expected 1 near drop")
	}
}

func TestDiffEnemyEliteChangeBecomesUpsert(t *testing.T) {
	t.Parallel()

	upsert, transforms, states, remove := diffEnemiesDetailed(
		[]enemy.Snapshot{{ID: "e1", Kind: enemy.KindBlob, Elite: false, X: 10, Y: 10, HP: 30, MaxHP: 30, State: enemy.StateIdle}},
		[]enemy.Snapshot{{ID: "e1", Kind: enemy.KindBlob, Elite: true, X: 10, Y: 10, HP: 90, MaxHP: 90, State: enemy.StateIdle}},
	)

	if len(upsert) != 1 {
		t.Fatalf("expected elite change to force upsert, got %v", upsert)
	}
	if len(transforms) != 0 || len(states) != 0 || len(remove) != 0 {
		t.Fatalf("expected only upsert, got transforms=%v states=%v remove=%v", transforms, states, remove)
	}
}

func TestDiffEnemyBurningChangeBecomesStateDelta(t *testing.T) {
	t.Parallel()

	upsert, transforms, states, remove := diffEnemiesDetailed(
		[]enemy.Snapshot{{ID: "e1", Kind: enemy.KindBlob, X: 10, Y: 10, HP: 30, MaxHP: 30, State: enemy.StateIdle}},
		[]enemy.Snapshot{{ID: "e1", Kind: enemy.KindBlob, X: 10, Y: 10, HP: 30, MaxHP: 30, State: enemy.StateIdle, BurningTicksRemaining: 5}},
	)

	if len(states) != 1 || states[0].BurningTicksRemaining != 5 {
		t.Fatalf("expected burning state delta, got %v", states)
	}
	if len(upsert) != 0 || len(transforms) != 0 || len(remove) != 0 {
		t.Fatalf("expected only state delta, got upsert=%v transforms=%v remove=%v", upsert, transforms, remove)
	}
}
