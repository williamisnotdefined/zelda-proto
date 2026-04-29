package combat

import (
	"testing"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/application/safezone"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/player"
)

func newPlayerOutsideSafezone(id string, x, y float64) *player.Player {
	p := player.New(id, "n", x, y)
	p.SafeZoneTimer = 0
	return p
}

func TestContactDamageRespectsSafezone(t *testing.T) {
	t.Parallel()
	zone := safezone.Zone{X: 100, Y: 100, Radius: 200}
	// Protected: inside zone with timer active.
	protected := player.New("p1", "n", 100, 100)
	// Unprotected: outside zone.
	unprotected := newPlayerOutsideSafezone("p2", 1000, 1000)
	players := map[string]*player.Player{
		"p1": protected,
		"p2": unprotected,
	}
	enemies := map[string]*enemy.Enemy{
		"e1": enemy.New("e1", 100, 100, "0,0", enemy.BlobConfig, drop.KindHeartSmall),
		"e2": enemy.New("e2", 1000, 1000, "0,0", enemy.BlobConfig, drop.KindHeartSmall),
	}

	ContactDamageSystem{}.Resolve(players, enemies, nil, nil, zone)

	if protected.HP != player.MaxHP {
		t.Errorf("safezone-protected player took contact damage: %d", protected.HP)
	}
	if unprotected.HP >= player.MaxHP {
		t.Errorf("unprotected player must have taken contact damage, got HP=%d", unprotected.HP)
	}
}

func TestGelehkContactDamageRepeatsEverySecondWhileTouching(t *testing.T) {
	t.Parallel()

	zone := safezone.Zone{X: 100, Y: 100, Radius: 10}
	target := newPlayerOutsideSafezone("p1", 0, 0)
	players := map[string]*player.Player{"p1": target}
	gelehks := map[string]*boss.Gelehk{"g1": boss.NewGelehk("g1", 0, 0)}

	ContactDamageSystem{}.Resolve(players, nil, nil, gelehks, zone)
	if got, want := target.HP, player.MaxHP-boss.GelehkContactDamage; got != want {
		t.Fatalf("expected first body-contact hit HP=%d, got %d", want, got)
	}

	ContactDamageSystem{}.Resolve(players, nil, nil, gelehks, zone)
	if got, want := target.HP, player.MaxHP-boss.GelehkContactDamage; got != want {
		t.Fatalf("expected cooldown to block immediate retrigger, want HP=%d got %d", want, got)
	}

	gelehks["g1"].Update(boss.GelehkContactCD, nil, nil, nil, nil, nil)
	ContactDamageSystem{}.Resolve(players, nil, nil, gelehks, zone)
	if got, want := target.HP, player.MaxHP-(2*boss.GelehkContactDamage); got != want {
		t.Fatalf("expected repeated body-contact hit after 1s, want HP=%d got %d", want, got)
	}
}

func TestPvPSystemRespectsSafezoneOnAttackerAndTarget(t *testing.T) {
	t.Parallel()
	zone := safezone.Zone{X: 0, Y: 0, Radius: 100}

	// attacker is unprotected and attacking right; target is right next to
	// attacker, but inside the safezone — must NOT take damage.
	attacker := newPlayerOutsideSafezone("att", 500, 0)
	attacker.ApplyInput(player.Input{Seq: 1, Right: true, Attack: true})
	attacker.Update(50_000_000, 1) // 50ms — enters StateAttacking
	target := player.New("tgt", "n", 510, 0)
	// move the target into the zone
	target.X, target.Y = 0, 0
	players := map[string]*player.Player{"att": attacker, "tgt": target}

	PvPSystem{}.Resolve(players, zone)
	if target.HP != player.MaxHP {
		t.Errorf("PvP must not damage safezone-protected target, got %d", target.HP)
	}

	// Now attacker is protected, target is not — still no damage.
	attacker.X, attacker.Y = 0, 0
	attacker.SafeZoneTimer = player.SafeZoneDuration
	target.X, target.Y = 10, 0
	target.SafeZoneTimer = 0
	target.HP = player.MaxHP
	PvPSystem{}.Resolve(players, zone)
	if target.HP != player.MaxHP {
		t.Errorf("safezone-protected attacker must not deal PvP damage, got target HP=%d", target.HP)
	}
}

func TestPlayerMeleeKillsCountForMonsterStats(t *testing.T) {
	t.Parallel()
	attacker := newPlayerOutsideSafezone("att", 0, 0)
	attacker.ApplyInput(player.Input{Seq: 1, Right: true, Attack: true})
	attacker.Update(50_000_000, 1)
	weakConfig := enemy.BlobConfig
	weakConfig.MaxHP = 1
	e := enemy.New("e1", 20, 0, "0,0", weakConfig, drop.KindHeartSmall)
	players := map[string]*player.Player{"att": attacker}
	enemies := map[string]*enemy.Enemy{"e1": e}
	PlayerMeleeSystem{}.Resolve(players, enemies, nil, nil)
	if e.State != enemy.StateDead {
		t.Fatalf("expected enemy dead, got %s HP=%d", e.State, e.HP)
	}
	if attacker.MonsterKills != 1 {
		t.Fatalf("expected MonsterKills=1, got %d", attacker.MonsterKills)
	}
}

// nil maps for boss collections must be tolerated (helps test ergonomics).
func TestPlayerMeleeNilBossMapsAreSafe(t *testing.T) {
	t.Parallel()
	players := map[string]*player.Player{}
	enemies := map[string]*enemy.Enemy{}
	var dragons map[string]*boss.DragonLord
	var gelehks map[string]*boss.Gelehk
	PlayerMeleeSystem{}.Resolve(players, enemies, dragons, gelehks)
}
