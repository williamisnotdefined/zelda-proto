package world

import (
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/hazard"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/player"
)

// Regression: a player parked inside the spawn safezone with the
// post-respawn invulnerability timer still active must NOT take fire-field
// hazard damage. Mirrors HazardSystem.ts L184 in the TS reference server.
func TestSafeZoneBlocksHazardDamage(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	// Place player at spawn (200, 200) so the safezone applies. Keep the
	// default SafeZoneTimer (3s) supplied by player.New.
	p := w.AddPlayer("p1", "Link", nil, nil)
	if p.SafeZoneTimer <= 0 {
		t.Fatalf("freshly spawned player must have a positive safezone timer")
	}

	// Drop a fire hazard right on top of the player.
	h := hazard.New("h1", p.X, p.Y, hazard.KindFireField)
	w.hazards[h.ID] = h
	w.hazardIndex.Upsert(h.ID, h.X, h.Y)

	startHP := p.HP
	w.Tick(20 * time.Millisecond)
	if p.HP != startHP {
		t.Fatalf("safezone-protected player took hazard damage: HP %d -> %d", startHP, p.HP)
	}
}

// Once the safezone timer expires, the same hazard must hurt the player.
func TestHazardDamagesPlayerWhenSafezoneExpires(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	p := w.AddPlayer("p1", "Link", nil, nil)
	p.SafeZoneTimer = 0 // simulate expired protection
	h := hazard.New("h1", p.X, p.Y, hazard.KindFireField)
	w.hazards[h.ID] = h
	w.hazardIndex.Upsert(h.ID, h.X, h.Y)
	startHP := p.HP
	w.Tick(20 * time.Millisecond)
	if p.HP >= startHP {
		t.Fatalf("expected hazard damage outside safezone, HP unchanged at %d", p.HP)
	}
}

// Regression: a dead player must wait at least PlayerRespawnTime before
// respawning. Mirrors PLAYER_RESPAWN_TIME (1500ms) in the TS reference.
func TestPlayerRespawnRequiresCooldown(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	p := w.AddPlayer("p1", "Link", nil, nil)
	p.SafeZoneTimer = 0
	p.HP = 0
	// Force dead state via TakeDamage path.
	p.TakeDamage(1)
	if p.State != player.StateDead {
		t.Fatalf("expected dead state, got %s", p.State)
	}

	// One tick at 1.4s — still under cooldown, must not respawn.
	w.Tick(1400 * time.Millisecond)
	if p.State != player.StateDead {
		t.Fatalf("player respawned before cooldown elapsed")
	}

	// Next tick pushes total elapsed time past 1.5s — must respawn.
	w.Tick(200 * time.Millisecond)
	if p.State == player.StateDead {
		t.Fatalf("player should have respawned after cooldown")
	}
	if p.RespawnTimer != 0 {
		t.Fatalf("respawn timer should reset to 0 after respawn, got %v", p.RespawnTimer)
	}
}
