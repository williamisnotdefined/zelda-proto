package world

import (
	"math/rand"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/application/registries"
	"github.com/williamisnotdefined/zelda-proto/server/internal/config"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

// onEnterIDs is a deterministic IDFactory used by the on-enter hook tests.
type onEnterIDs struct{ n atomic.Int64 }

func (c *onEnterIDs) NewID(prefix string) string {
	return prefix + "_" + strconv.FormatInt(c.n.Add(1), 10)
}

func newPhaseWorld(t *testing.T, instanceID domworld.InstanceID) *World {
	t.Helper()
	def := registries.All()[instanceID]
	return New(Config{
		InstanceID: instanceID,
		SpawnX:     def.SpawnX,
		SpawnY:     def.SpawnY,
		IDs:        &onEnterIDs{},
		Rand:       rand.New(rand.NewSource(1)),
		Definition: &def,
	})
}

// EnsurePhase3BossesNear must (re)anchor the trio to the player's entry
// coordinates after the bosses die, so the per-frame TryRespawn lands them
// next to the new entry instead of the registry default. In the scenario
// where a player re-enters Phase 3 while the trio is dead must not leave
// the world empty after the respawn timer elapses.
func TestEnsurePhase3BossesNear_RecreatesTrioAtNewEntry(t *testing.T) {
	t.Parallel()

	w := newPhaseWorld(t, domworld.InstancePhase3)
	w.SeedPhase3Bosses()

	// Kill the trio.
	for _, d := range w.dragons {
		d.TakeDamage(d.MaxHP)
	}

	entryX, entryY := 9000.0, -4500.0
	w.EnsurePhase3BossesNear(entryX, entryY)

	if got := len(w.dragons); got != len(registries.Phase3EntryBosses) {
		t.Fatalf("expected %d dragons after re-seed, got %d", len(registries.Phase3EntryBosses), got)
	}
	for _, b := range registries.Phase3EntryBosses {
		d, ok := w.dragons[b.ID]
		if !ok {
			t.Fatalf("expected dragon %q, missing", b.ID)
		}
		if d.Kind() != b.Kind {
			t.Fatalf("dragon %q wrong kind: got %s want %s", b.ID, d.Kind(), b.Kind)
		}
		wantX, wantY := entryX+b.OffsetX, entryY+b.OffsetY
		if d.SpawnX != wantX || d.SpawnY != wantY {
			t.Errorf("dragon %q spawn anchor: got (%v,%v) want (%v,%v)", b.ID, d.SpawnX, d.SpawnY, wantX, wantY)
		}
	}

	// Drive TryRespawn past the cooldown; the trio must come back at the
	// refreshed entry coords, not the original construction position.
	w.Tick(boss.DragonLordRespawnTime + 100*time.Millisecond)
	for _, b := range registries.Phase3EntryBosses {
		d := w.dragons[b.ID]
		if d == nil {
			t.Fatalf("dragon %q missing after respawn", b.ID)
		}
		if d.State == boss.StateDead {
			t.Errorf("dragon %q still dead after respawn tick", b.ID)
		}
		wantX, wantY := entryX+b.OffsetX, entryY+b.OffsetY
		if d.X != wantX || d.Y != wantY {
			t.Errorf("dragon %q respawn position: got (%v,%v) want (%v,%v)", b.ID, d.X, d.Y, wantX, wantY)
		}
	}
}

// EnsurePhase3BossesNear must only refresh SpawnX/SpawnY when the trio is
// already alive — bosses must not teleport mid-fight. Mirrors the TS
// hasSpawnPoint(existing) branch.
func TestEnsurePhase3BossesNear_RefreshesSpawnAnchorWithoutTeleport(t *testing.T) {
	t.Parallel()

	w := newPhaseWorld(t, domworld.InstancePhase3)
	w.SeedPhase3Bosses()

	// Capture starting positions.
	original := make(map[string][2]float64, len(w.dragons))
	for id, d := range w.dragons {
		original[id] = [2]float64{d.X, d.Y}
	}

	entryX, entryY := 9000.0, -4500.0
	w.EnsurePhase3BossesNear(entryX, entryY)

	for _, b := range registries.Phase3EntryBosses {
		d := w.dragons[b.ID]
		if d == nil {
			t.Fatalf("dragon %q missing", b.ID)
		}
		startX, startY := original[b.ID][0], original[b.ID][1]
		if d.X != startX || d.Y != startY {
			t.Errorf("dragon %q teleported: got (%v,%v) want (%v,%v)", b.ID, d.X, d.Y, startX, startY)
		}
		wantSpawnX, wantSpawnY := entryX+b.OffsetX, entryY+b.OffsetY
		if d.SpawnX != wantSpawnX || d.SpawnY != wantSpawnY {
			t.Errorf("dragon %q spawn anchor: got (%v,%v) want (%v,%v)",
				b.ID, d.SpawnX, d.SpawnY, wantSpawnX, wantSpawnY)
		}
	}
}

// EnsurePhase3BossesNear must drop unexpected dragon ids (Phase 3 hosts only
// the trio; BossRegion is disabled, so any other dragon is stale state).
func TestEnsurePhase3BossesNear_RemovesUnexpectedDragons(t *testing.T) {
	t.Parallel()

	w := newPhaseWorld(t, domworld.InstancePhase3)
	w.SeedPhase3Bosses()

	stray := boss.NewDragonLord("stray_dragon", 0, 0)
	w.dragons[stray.ID] = stray
	w.bossIndex.Upsert(stray.ID, stray.X, stray.Y)

	w.EnsurePhase3BossesNear(w.def.SpawnX, w.def.SpawnY)

	if _, ok := w.dragons["stray_dragon"]; ok {
		t.Fatal("expected stray dragon to be removed")
	}
	if got := len(w.dragons); got != len(registries.Phase3EntryBosses) {
		t.Fatalf("expected %d dragons, got %d", len(registries.Phase3EntryBosses), got)
	}
}

// EnsurePhase2PopulationNear must top up skeletons and seed a Dragon Lord when
// none is in range. Mirrors InstanceManager.ensurePhase2PopulationNear.
func TestEnsurePhase2PopulationNear_TopsUpSkeletonsAndDragon(t *testing.T) {
	t.Parallel()

	w := newPhaseWorld(t, domworld.InstancePhase2)
	startSkeletons := 0
	for _, e := range w.enemies {
		if e.Kind == enemy.KindSkeleton {
			startSkeletons++
		}
	}
	startDragons := len(w.dragons)

	// Far entry: no nearby skeletons / dragons trigger both seeders.
	entryX, entryY := w.def.SpawnX+8000.0, w.def.SpawnY+8000.0
	w.EnsurePhase2PopulationNear(entryX, entryY)

	b := config.DefaultBalancing
	wantSkeletons := startSkeletons + b.Phase2StarterSkeletons
	gotSkeletons := 0
	for _, e := range w.enemies {
		if e.Kind == enemy.KindSkeleton {
			gotSkeletons++
		}
	}
	if gotSkeletons != wantSkeletons {
		t.Errorf("skeleton count: got %d want %d", gotSkeletons, wantSkeletons)
	}
	if got := len(w.dragons); got != startDragons+1 {
		t.Fatalf("expected one seed dragon, got dragons=%d (start=%d)", got, startDragons)
	}
}

// Idempotency: re-running EnsurePhase2PopulationNear with the same entry
// must be a no-op once the population thresholds are met.
func TestEnsurePhase2PopulationNear_IsIdempotentOnceSatisfied(t *testing.T) {
	t.Parallel()

	w := newPhaseWorld(t, domworld.InstancePhase2)
	entryX, entryY := w.def.SpawnX+8000.0, w.def.SpawnY+8000.0
	w.EnsurePhase2PopulationNear(entryX, entryY)
	skeletonsAfter1 := 0
	for _, e := range w.enemies {
		if e.Kind == enemy.KindSkeleton {
			skeletonsAfter1++
		}
	}
	dragonsAfter1 := len(w.dragons)

	w.EnsurePhase2PopulationNear(entryX, entryY)
	skeletonsAfter2 := 0
	for _, e := range w.enemies {
		if e.Kind == enemy.KindSkeleton {
			skeletonsAfter2++
		}
	}
	if skeletonsAfter2 != skeletonsAfter1 {
		t.Errorf("skeleton count drifted: %d -> %d", skeletonsAfter1, skeletonsAfter2)
	}
	if got := len(w.dragons); got != dragonsAfter1 {
		t.Errorf("dragon count drifted: %d -> %d", dragonsAfter1, got)
	}
}

// EnsurePhase2PopulationNear must no-op for non-Phase 2 instances.
func TestEnsurePhase2PopulationNear_NoOpOnOtherInstances(t *testing.T) {
	t.Parallel()

	w := newPhaseWorld(t, domworld.InstancePhase3)
	startEnemies := len(w.enemies)
	startDragons := len(w.dragons)
	w.EnsurePhase2PopulationNear(0, 0)
	if got := len(w.enemies); got != startEnemies {
		t.Errorf("enemies changed on non-phase-2 world: %d -> %d", startEnemies, got)
	}
	if got := len(w.dragons); got != startDragons {
		t.Errorf("dragons changed on non-phase-2 world: %d -> %d", startDragons, got)
	}
}

// EnsurePhase4PopulationNear must top up pacman ghosts when too few are
// near the entry. Mirrors InstanceManager.ensurePhase4PopulationNear.
func TestEnsurePhase4PopulationNear_TopsUpPacmanGhosts(t *testing.T) {
	t.Parallel()

	w := newPhaseWorld(t, domworld.InstancePhase4)
	startGhosts := 0
	for _, e := range w.enemies {
		if e.Kind == enemy.KindPacmanGhost {
			startGhosts++
		}
	}

	entryX, entryY := w.def.SpawnX+8000.0, w.def.SpawnY+8000.0
	w.EnsurePhase4PopulationNear(entryX, entryY)

	b := config.DefaultBalancing
	wantGhosts := startGhosts + b.Phase4StarterPacmans
	gotGhosts := 0
	for _, e := range w.enemies {
		if e.Kind == enemy.KindPacmanGhost {
			gotGhosts++
		}
	}
	if gotGhosts != wantGhosts {
		t.Errorf("pacman ghost count: got %d want %d", gotGhosts, wantGhosts)
	}
}

// Idempotency: re-running EnsurePhase4PopulationNear with the same entry
// must be a no-op once the population threshold is met.
func TestEnsurePhase4PopulationNear_IsIdempotentOnceSatisfied(t *testing.T) {
	t.Parallel()

	w := newPhaseWorld(t, domworld.InstancePhase4)
	entryX, entryY := w.def.SpawnX+8000.0, w.def.SpawnY+8000.0
	w.EnsurePhase4PopulationNear(entryX, entryY)
	count1 := 0
	for _, e := range w.enemies {
		if e.Kind == enemy.KindPacmanGhost {
			count1++
		}
	}
	w.EnsurePhase4PopulationNear(entryX, entryY)
	count2 := 0
	for _, e := range w.enemies {
		if e.Kind == enemy.KindPacmanGhost {
			count2++
		}
	}
	if count1 != count2 {
		t.Errorf("pacman ghost count drifted: %d -> %d", count1, count2)
	}
}
