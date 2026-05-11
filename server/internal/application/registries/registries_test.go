package registries

import (
	"testing"

	"github.com/williamisnotdefined/zelda-proto/server/internal/config"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

func TestAllPhasesPresent(t *testing.T) {
	defs := All()
	for _, id := range domworld.AllInstances() {
		def, ok := defs[id]
		if !ok {
			t.Fatalf("phase %s missing from registries.All()", id)
		}
		if def.SpawnSystem.ChunkSize == 0 {
			t.Fatalf("phase %s missing SpawnSystem config", id)
		}
	}
}

func TestPhase1HasGelehkRegion(t *testing.T) {
	def := All()[domworld.InstancePhase1]
	if !def.BossRegion.Enabled {
		t.Fatalf("phase1 must have an enabled boss region (Gelehk)")
	}
	if def.SpawnSystem.EnemiesPerChunk != config.DefaultBalancing.Phase1EnemiesPerChunk {
		t.Fatalf("phase1 EnemiesPerChunk: got %d want %d",
			def.SpawnSystem.EnemiesPerChunk, config.DefaultBalancing.Phase1EnemiesPerChunk)
	}
	if def.BossDeathPortal == nil {
		t.Fatalf("phase1 must declare a boss-death portal to phase2")
	}
}

func TestPhase2UsesDedicatedSkeletonDensity(t *testing.T) {
	def := All()[domworld.InstancePhase2]
	if def.SpawnSystem.EnemiesPerChunk != config.DefaultBalancing.Phase2EnemiesPerChunk {
		t.Fatalf("phase2 EnemiesPerChunk: got %d want %d",
			def.SpawnSystem.EnemiesPerChunk, config.DefaultBalancing.Phase2EnemiesPerChunk)
	}
}

func TestPhase4UsesPacmanVariants(t *testing.T) {
	def := All()[domworld.InstancePhase4]
	if !def.SpawnSystem.PacmanVariants {
		t.Fatalf("phase4 spawner must use pacman variants")
	}
	if def.SpawnSystem.EnemiesPerChunk != config.DefaultBalancing.Phase4EnemiesPerChunk {
		t.Fatalf("phase4 EnemiesPerChunk: got %d want %d",
			def.SpawnSystem.EnemiesPerChunk, config.DefaultBalancing.Phase4EnemiesPerChunk)
	}
	if def.Phase4Boss == nil {
		t.Fatal("phase4 must seed Vanessa the Ruthless")
	}
}

func TestPhase3HasEntryBosses(t *testing.T) {
	def := All()[domworld.InstancePhase3]
	if len(def.Phase3EntryBosses) != 3 {
		t.Fatalf("phase3 must seed 3 entry bosses, got %d", len(def.Phase3EntryBosses))
	}
}

func TestPhase3UsesBalancedKnightSkeletonComposition(t *testing.T) {
	def := All()[domworld.InstancePhase3]
	wantKinds := []enemy.Kind{
		enemy.KindKnight,
		enemy.KindSkeleton,
		enemy.KindSkeleton,
		enemy.KindSkeleton,
		enemy.KindKnight,
		enemy.KindKnight,
		enemy.KindSkeleton,
		enemy.KindSkeleton,
		enemy.KindSkeleton,
	}
	if def.SpawnSystem.EnemiesPerChunk != len(wantKinds) {
		t.Fatalf("phase3 EnemiesPerChunk: got %d want %d", def.SpawnSystem.EnemiesPerChunk, len(wantKinds))
	}
	if def.SpawnSystem.EliteEnemiesPerChunk != 4 {
		t.Fatalf("phase3 EliteEnemiesPerChunk: got %d want 4", def.SpawnSystem.EliteEnemiesPerChunk)
	}
	if len(def.SpawnSystem.MixedEnemyConfigs) != len(wantKinds) {
		t.Fatalf("phase3 composition length: got %d want %d", len(def.SpawnSystem.MixedEnemyConfigs), len(wantKinds))
	}
	for i, want := range wantKinds {
		if got := def.SpawnSystem.MixedEnemyConfigs[i].Kind; got != want {
			t.Fatalf("phase3 composition index %d: got %s want %s", i, got, want)
		}
	}
}
