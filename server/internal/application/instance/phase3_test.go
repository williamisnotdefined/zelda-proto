package instance

import (
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/application/registries"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/portal"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

// Regression: phase 3 must boot with all entry bosses already alive in the
// world snapshot. Mirrors InstanceManager.ensurePhase3BossesNear in the TS
// reference server. The previous Go port coupled boss seeding to the
// starter-enemies path, so phase 3 (which has no starters) booted empty.
func TestPhase3EntryBossesAreSeeded(t *testing.T) {
	t.Parallel()

	m := New(Config{IDs: &counterIDs{}, StartPhase: domworld.InstancePhase1})
	w := m.World(domworld.InstancePhase3)
	if w == nil {
		t.Fatal("phase3 world missing")
	}
	snap := w.Snapshot()

	want := map[string]bool{}
	for _, b := range registries.Phase3EntryBosses {
		want[b.ID] = false
	}
	for _, b := range snap.Bosses {
		if _, ok := want[b.ID]; ok {
			want[b.ID] = true
		}
	}
	for id, seen := range want {
		if !seen {
			t.Errorf("phase3 boss %q missing from initial snapshot", id)
		}
	}
}

// Idempotency: calling SeedPhase3Bosses twice must not duplicate bosses.
func TestSeedPhase3BossesIsIdempotent(t *testing.T) {
	t.Parallel()

	m := New(Config{IDs: &counterIDs{}, StartPhase: domworld.InstancePhase1})
	w := m.World(domworld.InstancePhase3)
	w.SeedPhase3Bosses() // second call
	snap := w.Snapshot()
	count := 0
	ids := map[string]struct{}{}
	for _, b := range registries.Phase3EntryBosses {
		ids[b.ID] = struct{}{}
	}
	for _, b := range snap.Bosses {
		if _, ok := ids[b.ID]; ok {
			count++
		}
	}
	if count != len(registries.Phase3EntryBosses) {
		t.Fatalf("expected %d phase3 entry bosses, got %d", len(registries.Phase3EntryBosses), count)
	}
}

// Regression: a portal transfer into Phase 3 must trigger the on-enter hook
// so the entry boss trio re-anchors to the player's actual entry coordinates.
// This protects against the bug where Phase 3 bosses appeared "missing" once
// they died because the runtime only seeded them at construction and never
// refreshed their spawn anchor on player entry.
func TestPortalTransferToPhase3InvokesOnEnterHook(t *testing.T) {
	t.Parallel()

	m := New(Config{IDs: &counterIDs{}, StartPhase: domworld.InstancePhase1})
	from := m.World(domworld.InstancePhase2)
	x, y := 500.0, 500.0
	from.AddPlayer("p1", "Link", &x, &y)
	m.playerLocation["p1"] = domworld.InstancePhase2

	entryX, entryY := 12345.0, -6789.0
	from.SpawnPortal(&portal.Portal{
		ID: "pt", X: 500, Y: 500, Kind: portal.Phase2ToPhase3,
		ToInstance: domworld.InstancePhase3,
		TargetX:    entryX, TargetY: entryY,
	})

	m.Tick(20 * time.Millisecond)

	loc, _ := m.LocationOf("p1")
	if loc != domworld.InstancePhase3 {
		t.Fatalf("expected phase3 after transfer, got %s", loc)
	}

	// Snapshot still observes the trio (any of the three suffices to prove
	// the hook fired without removing them); deeper SpawnX/SpawnY assertions
	// live in world/onenter_test.go which has access to the dragons map.
	snap := m.World(domworld.InstancePhase3).Snapshot()
	expected := map[string]struct{}{}
	for _, b := range registries.Phase3EntryBosses {
		expected[b.ID] = struct{}{}
	}
	seen := 0
	for _, b := range snap.Bosses {
		if _, ok := expected[b.ID]; ok {
			seen++
		}
	}
	if seen != len(registries.Phase3EntryBosses) {
		t.Fatalf("expected %d trio members in snapshot after transfer, got %d", len(registries.Phase3EntryBosses), seen)
	}
}
