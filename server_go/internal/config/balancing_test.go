package config

import "testing"

func TestDefaultBalancingSanity(t *testing.T) {
	b := DefaultBalancing
	checks := []struct {
		name string
		ok   bool
	}{
		{"DefaultEnemiesPerChunk > 0", b.DefaultEnemiesPerChunk > 0},
		{"Phase4EnemiesPerChunk >= DefaultEnemiesPerChunk", b.Phase4EnemiesPerChunk >= b.DefaultEnemiesPerChunk},
		{"SpawnChunkSize > 0", b.SpawnChunkSize > 0},
		{"SpawnActiveRange > 0", b.SpawnActiveRange > 0},
		{"SpawnDespawnTimeMS > 0", b.SpawnDespawnTimeMS > 0},
		{"Phase2StarterSlimes > 0", b.Phase2StarterSlimes > 0},
		{"Phase2StarterSlimeRadius > 0", b.Phase2StarterSlimeRadius > 0},
		{"Phase4StarterPacmans > 0", b.Phase4StarterPacmans > 0},
		{"Phase4StarterPacmanRadius > 0", b.Phase4StarterPacmanRadius > 0},
		{"Phase1BossRegionSize > 0", b.Phase1BossRegionSize > 0},
		{"Phase1BossActiveRange > 0", b.Phase1BossActiveRange > 0},
		{"Phase2BossRegionSize > 0", b.Phase2BossRegionSize > 0},
		{"Phase2BossActiveRange > 0", b.Phase2BossActiveRange > 0},
		{"BossRegionDespawnTimeMS > 0", b.BossRegionDespawnTimeMS > 0},
		{"PlayerRespawnTime > 0", b.PlayerRespawnTime > 0},
		{"SafeZoneDuration > 0", b.SafeZoneDuration > 0},
		{"SpawnSafeZoneRadius > 0", b.SpawnSafeZoneRadius > 0},
	}
	for _, c := range checks {
		if !c.ok {
			t.Errorf("balancing default invalid: %s", c.name)
		}
	}
}
