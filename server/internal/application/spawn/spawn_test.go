package spawn

import (
	"strconv"
	"testing"

	"github.com/williamisnotdefined/zelda-proto/server/internal/application/registries"
	"github.com/williamisnotdefined/zelda-proto/server/internal/config"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

type counter struct{ n int }

func (c *counter) NewID(prefix string) string {
	c.n++
	return prefix + "_" + strconv.Itoa(c.n)
}

func cfgPhase1() registries.SpawnSystemConfig {
	return registries.SpawnSystemConfig{
		ChunkSize:       512,
		EnemiesPerChunk: config.DefaultBalancing.DefaultEnemiesPerChunk,
		ActiveRange:     1024,
		DespawnTimeMS:   30_000,
		EnemyPrefix:     "blob",
		EnemyKind:       enemy.KindBlob,
		EnemyConfig:     enemy.BlobConfig,
		DefaultDropKind: drop.KindFoodSmall,
	}
}

func TestSpawnPopulatesChunksAroundPlayer(t *testing.T) {
	sys := New(cfgPhase1(), &counter{})
	enemies := map[string]*enemy.Enemy{}
	added := 0
	add := func(*enemy.Enemy) { added++ }
	rem := func(string) {}
	p := player.New("p1", "p1", 0, 0)
	sys.Update(0, map[string]*player.Player{"p1": p}, enemies, add, rem)
	if added == 0 {
		t.Fatalf("expected enemies to spawn around player, got 0")
	}
	if len(enemies) != added {
		t.Fatalf("enemies map (%d) does not match added count (%d)", len(enemies), added)
	}
}

func TestSpawnDespawnsIdleChunks(t *testing.T) {
	sys := New(cfgPhase1(), &counter{})
	enemies := map[string]*enemy.Enemy{}
	add := func(*enemy.Enemy) {}
	rem := func(string) {}
	p := player.New("p1", "p1", 0, 0)
	sys.Update(0, map[string]*player.Player{"p1": p}, enemies, add, rem)
	originalIDs := make(map[string]struct{}, len(enemies))
	for id := range enemies {
		originalIDs[id] = struct{}{}
	}
	if len(originalIDs) == 0 {
		t.Fatalf("setup: expected enemies spawned")
	}
	// Move player far away and tick beyond despawn window.
	p.X = 1_000_000
	p.Y = 1_000_000
	sys.Update(31_000, map[string]*player.Player{"p1": p}, enemies, add, rem)
	for id := range enemies {
		if _, was := originalIDs[id]; was {
			t.Fatalf("expected original enemy %s to be despawned", id)
		}
	}
}

func TestSeededRandomDeterministic(t *testing.T) {
	a := seededRandom(3, 4, 5)
	b := seededRandom(3, 4, 5)
	if a != b {
		t.Fatalf("seededRandom not deterministic: %v != %v", a, b)
	}
	if a < 0 || a >= 1 {
		t.Fatalf("seededRandom out of [0,1): %v", a)
	}
}

func TestPopulateCreatesTwoElitesPerChunk(t *testing.T) {
	sys := New(cfgPhase1(), &counter{})
	enemies := map[string]*enemy.Enemy{}
	added := 0
	sys.populate(&chunk{cx: 0, cy: 0, enemyIDs: make(map[string]struct{})}, enemies, func(*enemy.Enemy) { added++ })

	eliteCount := 0
	for _, e := range enemies {
		if e.Elite {
			eliteCount++
		}
	}

	if added != len(enemies) {
		t.Fatalf("expected add hook count %d to match enemies %d", added, len(enemies))
	}
	if eliteCount != 2 {
		t.Fatalf("expected 2 elites per chunk, got %d", eliteCount)
	}
}

func TestPhase3PopulateUsesBalancedKnightSkeletonComposition(t *testing.T) {
	def := registries.All()[domworld.InstancePhase3]
	sys := New(def.SpawnSystem, &counter{})
	enemies := map[string]*enemy.Enemy{}
	sys.populate(&chunk{cx: 0, cy: 0, enemyIDs: make(map[string]struct{})}, enemies, func(*enemy.Enemy) {})

	elitesByKind := map[enemy.Kind]int{}
	countByKind := map[enemy.Kind]int{}
	for _, e := range enemies {
		countByKind[e.Kind]++
		if e.Elite {
			elitesByKind[e.Kind]++
		}
	}

	if len(enemies) != 9 {
		t.Fatalf("expected phase3 to spawn 9 enemies per chunk, got %d", len(enemies))
	}
	if countByKind[enemy.KindKnight] != 3 || countByKind[enemy.KindSkeleton] != 6 {
		t.Fatalf("expected 3 knights and 6 skeletons, got %+v", countByKind)
	}
	if elitesByKind[enemy.KindKnight] != 1 || elitesByKind[enemy.KindSkeleton] != 3 {
		t.Fatalf("expected 1 elite knight and 3 elite skeletons, got %+v", elitesByKind)
	}
}

func TestStarterEnemiesCreateTwoElites(t *testing.T) {
	sys := New(cfgPhase1(), &counter{})
	enemies := map[string]*enemy.Enemy{}
	sys.SpawnStarterEnemies(0, 0, 6, 120, enemies, func(*enemy.Enemy) {})

	eliteCount := 0
	for _, e := range enemies {
		if e.Elite {
			eliteCount++
		}
	}

	if eliteCount != 2 {
		t.Fatalf("expected 2 elite starters, got %d", eliteCount)
	}
}
