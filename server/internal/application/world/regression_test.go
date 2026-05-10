package world

import (
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/hazard"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
)

// Regression: a player parked inside the spawn safezone with the
// post-respawn invulnerability timer still active must NOT take fire-field
// hazard damage.
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
// respawning.
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

func TestDashBlueFlameDamagesAllActorKindsAndAwardsKills(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	sx, sy := 0.0, 0.0
	source := w.AddPlayer("src", "Link", &sx, &sy)
	source.SafeZoneTimer = 0

	px, py := 300.0, 300.0
	victim := w.AddPlayer("victim", "Zelda", &px, &py)
	victim.SafeZoneTimer = 0
	victim.HP = hazard.BurningTickDamage

	weakConfig := enemy.BlobConfig
	weakConfig.MaxHP = hazard.BurningTickDamage
	e := enemy.New("e1", 450, 300, "0,0", weakConfig, drop.KindFoodSmall)
	e.HP = hazard.BurningTickDamage
	w.SpawnEnemy(e)

	d := boss.NewDragonLord("d1", 600, 300)
	d.HP = hazard.BurningTickDamage
	w.SpawnDragon(d)

	spawnTrailHazard := func(id string, x, y float64) {
		h := hazard.New(id, x, y, hazard.KindBlueFlame)
		h.SourcePlayerID = source.ID
		h.HitsAllActors = true
		w.hazards[id] = h
		w.hazardIndex.Upsert(id, x, y)
	}

	spawnTrailHazard("hazard_player", victim.X, victim.Y)
	spawnTrailHazard("hazard_enemy", e.X, e.Y)
	spawnTrailHazard("hazard_boss", d.X, d.Y)

	w.Tick(20 * time.Millisecond)

	if victim.State != player.StateDead {
		t.Fatalf("expected player victim dead, got %s", victim.State)
	}
	if e.State != enemy.StateDead {
		t.Fatalf("expected enemy dead, got %s", e.State)
	}
	if d.State != boss.StateDead {
		t.Fatalf("expected boss dead, got %s", d.State)
	}
	if source.PlayerKills != 1 {
		t.Fatalf("expected 1 player kill from blue flame, got %d", source.PlayerKills)
	}
	if source.MonsterKills != 2 {
		t.Fatalf("expected 2 monster kills from blue flame, got %d", source.MonsterKills)
	}
}
