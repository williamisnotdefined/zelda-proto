package combat

import (
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/application/safezone"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

func newPlayerOutsideSafezone(id string, x, y float64) *player.Player {
	p := player.New(id, "n", x, y)
	p.SafeZoneTimer = 0
	return p
}

func queuePlayerWaveRelease(p *player.Player, targets player.WaveTargets) {
	p.ApplyInput(player.Input{Seq: 1, Wave: true})
	p.Update(10*time.Millisecond, 1)
	p.ConsumeWaveStart()
	p.SetWaveTargets(targets)
	releaseAfter := player.WaveWindup + player.WaveExpandDuration()
	p.Update(releaseAfter, 1)
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

	ContactDamageSystem{}.Resolve(players, enemies, nil, nil, nil, zone)

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

	ContactDamageSystem{}.Resolve(players, nil, nil, gelehks, nil, zone)
	if got, want := target.HP, player.MaxHP-boss.GelehkContactDamage; got != want {
		t.Fatalf("expected first body-contact hit HP=%d, got %d", want, got)
	}

	ContactDamageSystem{}.Resolve(players, nil, nil, gelehks, nil, zone)
	if got, want := target.HP, player.MaxHP-boss.GelehkContactDamage; got != want {
		t.Fatalf("expected cooldown to block immediate retrigger, want HP=%d got %d", want, got)
	}

	gelehks["g1"].Update(boss.GelehkContactCD, nil, nil, nil, nil, nil)
	ContactDamageSystem{}.Resolve(players, nil, nil, gelehks, nil, zone)
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
	PlayerMeleeSystem{}.Resolve(players, enemies, nil, nil, nil)
	if e.State != enemy.StateDead {
		t.Fatalf("expected enemy dead, got %s HP=%d", e.State, e.HP)
	}
	if attacker.MonsterKills != 1 {
		t.Fatalf("expected MonsterKills=1, got %d", attacker.MonsterKills)
	}
}

func TestPlayerWaveDamagesAllSupportedTargetKinds(t *testing.T) {
	t.Parallel()

	zone := safezone.Zone{X: 1000, Y: 1000, Radius: 10}
	caster := newPlayerOutsideSafezone("att", 0, 0)
	caster.TakeDamage(20)
	target := newPlayerOutsideSafezone("tgt", 70, 40)
	e := enemy.New("e1", 40, 0, "0,0", enemy.BlobConfig, drop.KindHeartSmall)
	d := boss.NewDragonLord("d1", 0, 50)
	g := boss.NewGelehk("g1", -60, 0)
	v := boss.NewVanessaTheRuthless("v1", 0, -70)
	queuePlayerWaveRelease(caster, player.WaveTargets{
		EnemyIDs:   []string{"e1"},
		DragonIDs:  []string{"d1"},
		GelehkIDs:  []string{"g1"},
		VanessaIDs: []string{"v1"},
	})

	moved := PlayerWaveSystem{}.Resolve(
		map[string]*player.Player{"att": caster, "tgt": target},
		map[string]*enemy.Enemy{"e1": e},
		map[string]*boss.DragonLord{"d1": d},
		map[string]*boss.Gelehk{"g1": g},
		map[string]*boss.VanessaTheRuthless{"v1": v},
		zone,
	)
	if !moved {
		t.Fatal("expected wave knockback to move targets")
	}
	if e.HP != enemy.BlobConfig.MaxHP-player.WaveDamage {
		t.Fatalf("expected enemy HP=%d, got %d", enemy.BlobConfig.MaxHP-player.WaveDamage, e.HP)
	}
	if d.HP != boss.DragonLordMaxHP-player.WaveDamage {
		t.Fatalf("expected dragon HP=%d, got %d", boss.DragonLordMaxHP-player.WaveDamage, d.HP)
	}
	if g.HP != boss.GelehkMaxHP-player.WaveDamage {
		t.Fatalf("expected gelehk HP=%d, got %d", boss.GelehkMaxHP-player.WaveDamage, g.HP)
	}
	if v.HP != boss.VanessaMaxHP-player.WaveDamage {
		t.Fatalf("expected vanessa HP=%d, got %d", boss.VanessaMaxHP-player.WaveDamage, v.HP)
	}
	if target.HP != player.MaxHP-player.WaveDamage {
		t.Fatalf("expected target player HP=%d, got %d", player.MaxHP-player.WaveDamage, target.HP)
	}
	if got, want := caster.HP, player.MaxHP-17; got != want {
		t.Fatalf("expected caster HP=%d after wave life steal, got %d", want, got)
	}
	for name, pos := range map[string][2]float64{
		"enemy":   {e.X, e.Y},
		"dragon":  {d.X, d.Y},
		"gelehk":  {g.X, g.Y},
		"vanessa": {v.X, v.Y},
		"player":  {target.X, target.Y},
	} {
		if distSq := pos[0]*pos[0] + pos[1]*pos[1]; distSq <= player.WaveMaxRadius*player.WaveMaxRadius {
			t.Fatalf("expected %s to be pushed outside wave radius, got pos=(%.1f, %.1f)", name, pos[0], pos[1])
		}
	}
}

func TestPlayerWaveLifeStealUsesActualDamageAndRoundsUp(t *testing.T) {
	t.Parallel()

	zone := safezone.Zone{X: 1000, Y: 1000, Radius: 10}
	caster := newPlayerOutsideSafezone("att", 0, 0)
	caster.TakeDamage(60)
	weakConfig := enemy.BlobConfig
	weakConfig.MaxHP = 1
	e1 := enemy.New("e1", 40, 0, "0,0", weakConfig, drop.KindHeartSmall)
	e2 := enemy.New("e2", -40, 0, "0,0", weakConfig, drop.KindHeartSmall)
	target1 := newPlayerOutsideSafezone("tgt1", 0, 40)
	target1.TakeDamage(player.MaxHP - 1)
	target2 := newPlayerOutsideSafezone("tgt2", 0, -40)
	target2.TakeDamage(player.MaxHP - 1)
	queuePlayerWaveRelease(caster, player.WaveTargets{EnemyIDs: []string{"e1", "e2"}})

	PlayerWaveSystem{}.Resolve(
		map[string]*player.Player{"att": caster, "tgt1": target1, "tgt2": target2},
		map[string]*enemy.Enemy{"e1": e1, "e2": e2},
		nil,
		nil,
		nil,
		zone,
	)

	if got, want := caster.HP, 41; got != want {
		t.Fatalf("expected caster HP=%d when life steal uses actual damage, got %d", want, got)
	}
}

func TestPlayerWaveRespectsSafezoneForPvP(t *testing.T) {
	t.Parallel()

	zone := safezone.Zone{X: 0, Y: 0, Radius: 100}
	protectedCaster := player.New("att", "n", 0, 0)
	queuePlayerWaveRelease(protectedCaster, player.WaveTargets{})
	target := newPlayerOutsideSafezone("tgt", 80, 0)
	PlayerWaveSystem{}.Resolve(
		map[string]*player.Player{"att": protectedCaster, "tgt": target},
		nil,
		nil,
		nil,
		nil,
		zone,
	)
	if target.HP != player.MaxHP {
		t.Fatalf("expected protected caster to deal no PvP wave damage, got %d", target.HP)
	}

	unprotectedCaster := newPlayerOutsideSafezone("att2", 80, 0)
	queuePlayerWaveRelease(unprotectedCaster, player.WaveTargets{})
	protectedTarget := player.New("tgt2", "n", 0, 0)
	PlayerWaveSystem{}.Resolve(
		map[string]*player.Player{"att2": unprotectedCaster, "tgt2": protectedTarget},
		nil,
		nil,
		nil,
		nil,
		zone,
	)
	if protectedTarget.HP != player.MaxHP {
		t.Fatalf("expected protected target to ignore PvP wave damage, got %d", protectedTarget.HP)
	}
}

func TestPlayerDashMovesCasterOnlyAndSpawnsTrail(t *testing.T) {
	t.Parallel()

	caster := newPlayerOutsideSafezone("att", 0, 0)
	caster.ApplyInput(player.Input{Seq: 1, Right: true, Dash: true})
	caster.Update(10_000_000, 1)
	target := newPlayerOutsideSafezone("tgt", 80, 0)
	e := enemy.New("e1", 40, 0, "0,0", enemy.BlobConfig, drop.KindHeartSmall)
	d := boss.NewDragonLord("d1", 60, 10)
	g := boss.NewGelehk("g1", 90, -10)
	v := boss.NewVanessaTheRuthless("v1", 120, 0)

	spawnedTrail := false
	moved := PlayerDashSystem{}.Resolve(
		map[string]*player.Player{"att": caster, "tgt": target},
		map[string]*enemy.Enemy{"e1": e},
		map[string]*boss.DragonLord{"d1": d},
		map[string]*boss.Gelehk{"g1": g},
		map[string]*boss.VanessaTheRuthless{"v1": v},
		func(sourcePlayerID string, startX, startY float64, direction domworld.Direction) {
			spawnedTrail = true
			if sourcePlayerID != caster.ID || startX != 0 || startY != 0 || direction != domworld.DirectionRight {
				t.Fatalf("unexpected dash trail callback: source=%q start=(%.1f, %.1f) dir=%s", sourcePlayerID, startX, startY, direction)
			}
		},
	)
	if !moved {
		t.Fatal("expected dash to move the caster")
	}
	if !spawnedTrail {
		t.Fatal("expected dash trail callback")
	}
	if caster.X != player.DashDistance || caster.Y != 0 {
		t.Fatalf("expected caster to finish dash at (%.1f, 0), got (%.1f, %.1f)", player.DashDistance, caster.X, caster.Y)
	}
	if e.HP != enemy.BlobConfig.MaxHP || d.HP != boss.DragonLordMaxHP || g.HP != boss.GelehkMaxHP || v.HP != boss.VanessaMaxHP || target.HP != player.MaxHP {
		t.Fatal("dash body should not deal direct damage")
	}
	for name, pos := range map[string][2]float64{
		"enemy":   {e.X, e.Y},
		"dragon":  {d.X, d.Y},
		"gelehk":  {g.X, g.Y},
		"vanessa": {v.X, v.Y},
		"player":  {target.X, target.Y},
	} {
		if name == "enemy" && (pos[0] != 40 || pos[1] != 0) {
			t.Fatalf("expected %s to stay in place, got pos=(%.1f, %.1f)", name, pos[0], pos[1])
		}
		if name == "dragon" && (pos[0] != 60 || pos[1] != 10) {
			t.Fatalf("expected %s to stay in place, got pos=(%.1f, %.1f)", name, pos[0], pos[1])
		}
		if name == "gelehk" && (pos[0] != 90 || pos[1] != -10) {
			t.Fatalf("expected %s to stay in place, got pos=(%.1f, %.1f)", name, pos[0], pos[1])
		}
		if name == "vanessa" && (pos[0] != 120 || pos[1] != 0) {
			t.Fatalf("expected %s to stay in place, got pos=(%.1f, %.1f)", name, pos[0], pos[1])
		}
		if name == "player" && (pos[0] != 80 || pos[1] != 0) {
			t.Fatalf("expected %s to stay in place, got pos=(%.1f, %.1f)", name, pos[0], pos[1])
		}
	}
}

func TestPlayerDashDoesNotMoveProtectedPlayers(t *testing.T) {
	t.Parallel()

	protectedCaster := player.New("att", "n", 0, 0)
	protectedCaster.ApplyInput(player.Input{Seq: 1, Right: true, Dash: true})
	protectedCaster.Update(10_000_000, 1)
	protectedTarget := player.New("tgt", "n", 80, 0)
	moved := PlayerDashSystem{}.Resolve(
		map[string]*player.Player{"att": protectedCaster, "tgt": protectedTarget},
		nil,
		nil,
		nil,
		nil,
		nil,
	)
	if !moved {
		t.Fatal("expected protected caster dash to move caster")
	}
	if protectedTarget.HP != player.MaxHP {
		t.Fatalf("expected dash to avoid direct damage, got %d", protectedTarget.HP)
	}
	if protectedTarget.X != 80 {
		t.Fatalf("expected protected target to stay in place, got X=%.1f", protectedTarget.X)
	}
}

func TestPlayerLandmineSystemCarriesDirectionAndSafezonePvPFlag(t *testing.T) {
	t.Parallel()

	zone := safezone.Zone{X: 0, Y: 0, Radius: 100}
	protectedCaster := player.New("att_protected", "n", 0, 0)
	protectedCaster.ApplyInput(player.Input{Seq: 1, Right: true, Landmine: true})
	protectedCaster.Update(10*time.Millisecond, 1)

	unprotectedCaster := newPlayerOutsideSafezone("att_unprotected", 200, 0)
	unprotectedCaster.ApplyInput(player.Input{Seq: 1, Left: true, Landmine: true})
	unprotectedCaster.Update(10*time.Millisecond, 1)

	spawns := make([]struct {
		sourceID    string
		startX      float64
		startY      float64
		direction   domworld.Direction
		hitsPlayers bool
	}, 0, 2)

	PlayerLandmineSystem{}.Resolve(
		map[string]*player.Player{
			protectedCaster.ID:   protectedCaster,
			unprotectedCaster.ID: unprotectedCaster,
		},
		zone,
		func(sourcePlayerID string, startX, startY float64, direction domworld.Direction, hitsPlayers bool) {
			spawns = append(spawns, struct {
				sourceID    string
				startX      float64
				startY      float64
				direction   domworld.Direction
				hitsPlayers bool
			}{sourcePlayerID, startX, startY, direction, hitsPlayers})
		},
	)

	if len(spawns) != 2 {
		t.Fatalf("expected 2 landmine spawns, got %d", len(spawns))
	}
	spawnBySource := make(map[string]struct {
		startX      float64
		startY      float64
		direction   domworld.Direction
		hitsPlayers bool
	}, len(spawns))
	for _, spawn := range spawns {
		spawnBySource[spawn.sourceID] = struct {
			startX      float64
			startY      float64
			direction   domworld.Direction
			hitsPlayers bool
		}{spawn.startX, spawn.startY, spawn.direction, spawn.hitsPlayers}
	}
	if spawn := spawnBySource[protectedCaster.ID]; spawn.direction != domworld.DirectionRight || spawn.hitsPlayers {
		t.Fatalf("unexpected protected caster spawn: %+v", spawn)
	}
	if spawn := spawnBySource[unprotectedCaster.ID]; spawn.direction != domworld.DirectionLeft || !spawn.hitsPlayers {
		t.Fatalf("unexpected unprotected caster spawn: %+v", spawn)
	}
}

func TestPlayerGrenadeSystemCarriesDirectionAndSafezonePvPFlag(t *testing.T) {
	t.Parallel()

	zone := safezone.Zone{X: 0, Y: 0, Radius: 100}
	protectedCaster := player.New("att_protected", "n", 0, 0)
	protectedCaster.ApplyInput(player.Input{Seq: 1, Right: true, Grenade: true})
	protectedCaster.Update(10*time.Millisecond, 1)

	unprotectedCaster := newPlayerOutsideSafezone("att_unprotected", 200, 0)
	unprotectedCaster.ApplyInput(player.Input{Seq: 1, Left: true, Grenade: true})
	unprotectedCaster.Update(10*time.Millisecond, 1)

	spawns := make([]struct {
		sourceID    string
		startX      float64
		startY      float64
		direction   domworld.Direction
		hitsPlayers bool
	}, 0, 2)

	PlayerGrenadeSystem{}.Resolve(
		map[string]*player.Player{
			protectedCaster.ID:   protectedCaster,
			unprotectedCaster.ID: unprotectedCaster,
		},
		zone,
		func(sourcePlayerID string, startX, startY float64, direction domworld.Direction, hitsPlayers bool) {
			spawns = append(spawns, struct {
				sourceID    string
				startX      float64
				startY      float64
				direction   domworld.Direction
				hitsPlayers bool
			}{sourcePlayerID, startX, startY, direction, hitsPlayers})
		},
	)

	if len(spawns) != 2 {
		t.Fatalf("expected 2 grenade spawns, got %d", len(spawns))
	}
	spawnBySource := make(map[string]struct {
		startX      float64
		startY      float64
		direction   domworld.Direction
		hitsPlayers bool
	}, len(spawns))
	for _, spawn := range spawns {
		spawnBySource[spawn.sourceID] = struct {
			startX      float64
			startY      float64
			direction   domworld.Direction
			hitsPlayers bool
		}{spawn.startX, spawn.startY, spawn.direction, spawn.hitsPlayers}
	}
	if spawn := spawnBySource[protectedCaster.ID]; spawn.direction != domworld.DirectionRight || spawn.hitsPlayers {
		t.Fatalf("unexpected protected caster spawn: %+v", spawn)
	}
	if spawn := spawnBySource[unprotectedCaster.ID]; spawn.direction != domworld.DirectionLeft || !spawn.hitsPlayers {
		t.Fatalf("unexpected unprotected caster spawn: %+v", spawn)
	}
}

// nil maps for boss collections must be tolerated (helps test ergonomics).
func TestPlayerMeleeNilBossMapsAreSafe(t *testing.T) {
	t.Parallel()
	players := map[string]*player.Player{}
	enemies := map[string]*enemy.Enemy{}
	var dragons map[string]*boss.DragonLord
	var gelehks map[string]*boss.Gelehk
	var vanessas map[string]*boss.VanessaTheRuthless
	PlayerMeleeSystem{}.Resolve(players, enemies, dragons, gelehks, vanessas)
}
