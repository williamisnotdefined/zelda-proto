package config

import (
	"reflect"
	"testing"
)

func TestLoadFromEnvDefaultsToDevelopment(t *testing.T) {
	t.Setenv("NODE_ENV", "")
	t.Setenv("PORT", "")

	cfg := LoadFromEnv()

	if cfg.Environment != "development" {
		t.Fatalf("expected development environment, got %q", cfg.Environment)
	}
	if cfg.Port != 3002 {
		t.Fatalf("expected port 3002, got %d", cfg.Port)
	}
	if !cfg.IsDevelopment() {
		t.Fatal("expected development mode")
	}
}

func TestLoadFromEnvUsesProductionDefaults(t *testing.T) {
	t.Setenv("NODE_ENV", "production")
	t.Setenv("PORT", "")
	t.Setenv("DEV_START_PHASE", "phase4")
	t.Setenv("DEV_STRESS_ENEMIES_PER_CHUNK", "8")

	cfg := LoadFromEnv()

	if cfg.Port != 3001 {
		t.Fatalf("expected port 3001, got %d", cfg.Port)
	}
	if cfg.DevStartPhase != "" {
		t.Fatalf("expected empty DEV_START_PHASE in production, got %q", cfg.DevStartPhase)
	}
	if cfg.DevStressEnemiesPerChunk != 0 {
		t.Fatalf("expected zero stress enemies in production, got %d", cfg.DevStressEnemiesPerChunk)
	}
}

func TestLoadFromEnvAppliesExplicitOverrides(t *testing.T) {
	t.Setenv("NODE_ENV", "development")
	t.Setenv("PORT", "4100")
	t.Setenv("TRUST_PROXY", "yes")
	t.Setenv("WS_ALLOWED_ORIGINS", " https://app.example.com, https://cdn.example.com, https://app.example.com ")
	t.Setenv("DEBUG_GAME_METRICS", "1")
	t.Setenv("DEV_START_PHASE", " Phase3 ")
	t.Setenv("DEV_STRESS_ENEMIES_PER_CHUNK", "40")

	cfg := LoadFromEnv()

	if cfg.Port != 4100 {
		t.Fatalf("expected port 4100, got %d", cfg.Port)
	}
	if !cfg.TrustProxy {
		t.Fatal("expected TRUST_PROXY to be true")
	}
	if !cfg.DebugGameMetrics {
		t.Fatal("expected DEBUG_GAME_METRICS to be true")
	}
	if cfg.DevStartPhase != "phase3" {
		t.Fatalf("expected DEV_START_PHASE phase3, got %q", cfg.DevStartPhase)
	}
	if cfg.DevStressEnemiesPerChunk != 40 {
		t.Fatalf("expected DEV_STRESS_ENEMIES_PER_CHUNK 40, got %d", cfg.DevStressEnemiesPerChunk)
	}

	expectedOrigins := []string{"https://app.example.com", "https://cdn.example.com"}
	if !reflect.DeepEqual(cfg.AllowedWSOrigins, expectedOrigins) {
		t.Fatalf("expected allowed origins %v, got %v", expectedOrigins, cfg.AllowedWSOrigins)
	}
}

func TestLoadFromEnvFallsBackForInvalidValues(t *testing.T) {
	t.Setenv("NODE_ENV", "development")
	t.Setenv("PORT", "99999")
	t.Setenv("TRUST_PROXY", "0")
	t.Setenv("DEV_STRESS_ENEMIES_PER_CHUNK", "999")

	cfg := LoadFromEnv()

	if cfg.Port != 3002 {
		t.Fatalf("expected default dev port, got %d", cfg.Port)
	}
	if cfg.TrustProxy {
		t.Fatal("expected TRUST_PROXY to be false")
	}
	if cfg.DevStressEnemiesPerChunk != 0 {
		t.Fatalf("expected fallback stress value 0, got %d", cfg.DevStressEnemiesPerChunk)
	}
}

func TestListenAddrUsesConfiguredPort(t *testing.T) {
	cfg := Config{Port: 3200}
	if cfg.ListenAddr() != ":3200" {
		t.Fatalf("expected :3200, got %q", cfg.ListenAddr())
	}
}
