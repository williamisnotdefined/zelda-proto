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

func TestPhase3MixesHandsAndKnights(t *testing.T) {
	def := All()[domworld.InstancePhase3]
	if len(def.SpawnSystem.MixedEnemyConfigs) != 2 {
		t.Fatalf("phase3 must mix hand and knight configs, got %d", len(def.SpawnSystem.MixedEnemyConfigs))
	}
	if def.SpawnSystem.MixedEnemyConfigs[0].Kind != enemy.KindHand || def.SpawnSystem.MixedEnemyConfigs[1].Kind != enemy.KindKnight {
		t.Fatalf("phase3 mix mismatch: %+v", def.SpawnSystem.MixedEnemyConfigs)
	}
}
