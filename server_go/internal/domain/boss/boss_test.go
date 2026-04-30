package boss

import (
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/hazard"
)

func alive(id string, x, y float64) PlayerView {
	return PlayerView{ID: id, X: x, Y: y, Alive: true}
}

func TestDragonLordMovesAndAttacks(t *testing.T) {
	t.Parallel()

	d := NewDragonLord("d1", 0, 0)
	players := []PlayerView{alive("p1", 200, 0)}
	var fired bool
	fire := func(x, y, dx, dy float64, k hazard.Kind, tint uint32) { fired = true; _ = tint }
	d.Update(50*time.Millisecond, players, fire, nil)
	if d.X <= 0 {
		t.Fatalf("expected dragon to move toward target, got X=%v", d.X)
	}
	if !fired {
		t.Fatal("expected fire line to be queued")
	}
	if d.AttackCD <= 0 {
		t.Fatal("expected attack cooldown active")
	}
}

func TestDragonLordAxisHysteresis(t *testing.T) {
	t.Parallel()

	d := NewDragonLord("d1", 0, 0)
	d.moveAxis = "x"
	// |dy - dx| <= hysteresis (18) → keep current axis
	d.Update(time.Millisecond, []PlayerView{alive("p1", 100, 110)}, nil, nil)
	if d.moveAxis != "x" {
		t.Fatalf("expected to keep axis x within hysteresis, got %s", d.moveAxis)
	}
	// Larger gap on Y → switch
	d.Update(time.Millisecond, []PlayerView{alive("p1", 100, 300)}, nil, nil)
	if d.moveAxis != "y" {
		t.Fatalf("expected switch to y, got %s", d.moveAxis)
	}
}

func TestDragonLordContactCooldown(t *testing.T) {
	t.Parallel()

	d := NewDragonLord("d1", 0, 0)
	if !d.CanDealContactDamageTo("p1") {
		t.Fatal("expected ready")
	}
	d.MarkContactDamageDealt("p1")
	if d.CanDealContactDamageTo("p1") {
		t.Fatal("expected blocked")
	}
}

func TestGelehkContactCooldown(t *testing.T) {
	t.Parallel()

	g := NewGelehk("g1", 0, 0)
	if !g.CanDealContactDamageTo("p1") {
		t.Fatal("expected ready")
	}
	g.MarkContactDamageDealt("p1")
	if g.CanDealContactDamageTo("p1") {
		t.Fatal("expected blocked")
	}
	g.Update(GelehkContactCD+time.Millisecond, nil, nil, nil, nil, nil)
	if !g.CanDealContactDamageTo("p1") {
		t.Fatal("expected cooldown to expire")
	}
}

func TestDragonLordTakeDamageAndRespawn(t *testing.T) {
	t.Parallel()

	d := NewDragonLord("d1", 0, 0)
	d.X = 99
	d.TakeDamage(DragonLordMaxHP)
	if d.State != StateDead {
		t.Fatalf("expected dead, got %s", d.State)
	}
	if !d.TryRespawn(DragonLordRespawnTime + time.Millisecond) {
		t.Fatal("expected respawn")
	}
	if d.HP != d.MaxHP || d.X != 0 {
		t.Fatalf("unexpected respawn state: %+v", d)
	}
}

func TestPhase3BossKindAffectsFlame(t *testing.T) {
	t.Parallel()

	cases := map[Kind]string{
		KindSilverbackWainer: "fire_field",
		KindSlimMaioli:       "purple_field",
		KindFranklyStein:     "blue_flame",
	}
	for k, want := range cases {
		b := NewPhase3Boss("b1", 0, 0, k)
		if string(b.flameKind) != want {
			t.Errorf("kind %s expected %s, got %s", k, want, b.flameKind)
		}
		if b.Snapshot().Phase != 3 {
			t.Errorf("expected phase 3 for %s", k)
		}
	}
}

func TestGelehkActivatesAndPhaseTransitions(t *testing.T) {
	t.Parallel()

	g := NewGelehk("g1", 0, 0)
	players := []PlayerView{alive("p1", 100, 0)}
	g.Update(20*time.Millisecond, players, nil, nil, nil, nil)
	if !g.Active {
		t.Fatal("expected activation")
	}

	g.HP = g.MaxHP / 2
	g.Update(time.Millisecond, players, nil, nil, nil, nil)
	if g.Phase != 2 {
		t.Fatalf("expected phase 2, got %d", g.Phase)
	}

	g.HP = g.MaxHP / 10
	g.Update(time.Millisecond, players, nil, nil, nil, nil)
	if g.Phase != 3 {
		t.Fatalf("expected phase 3, got %d", g.Phase)
	}
	if len(g.IceZones) == 0 {
		t.Fatal("expected ice zones at phase 3")
	}
}

func TestGelehkAOEIndicatorSpawn(t *testing.T) {
	t.Parallel()

	g := NewGelehk("g1", 0, 0)
	g.Active = true
	players := []PlayerView{alive("p1", 100, 0)}
	g.Update(time.Millisecond, players, nil, nil, nil, nil)
	if len(g.AOEIndicators) == 0 {
		t.Fatal("expected an AOE indicator queued")
	}
	if g.State != StateTargeting {
		t.Fatalf("expected targeting state, got %s", g.State)
	}
}

func TestGelehkAOEImpactSpawnsPurpleFieldAndFlashesHit(t *testing.T) {
	t.Parallel()

	g := NewGelehk("g1", 0, 0)
	g.Active = true
	players := []PlayerView{alive("p1", 100, 0)}
	purpleSpawns := 0
	spawnPurple := func(x, y float64) { purpleSpawns++ }

	g.Update(time.Millisecond, players, nil, spawnPurple, nil, nil)
	g.Update(GelehkAOETelegraph, players, nil, spawnPurple, nil, nil)

	if purpleSpawns != 1 {
		t.Fatalf("expected one purple-field impact, got %d", purpleSpawns)
	}
	if len(g.AOEIndicators) != 1 {
		t.Fatalf("expected hit flash indicator to remain for one frame, got %d indicators", len(g.AOEIndicators))
	}
	if !g.AOEIndicators[0].Hit {
		t.Fatal("expected indicator hit flag after impact")
	}
	if g.AOEIndicators[0].Timer != GelehkAOEHitFlash {
		t.Fatalf("expected hit flash timer %s, got %s", GelehkAOEHitFlash, g.AOEIndicators[0].Timer)
	}

	g.Update(GelehkAOEHitFlash, players, nil, spawnPurple, nil, nil)
	if len(g.AOEIndicators) != 0 {
		t.Fatalf("expected indicator removed after hit flash, got %d", len(g.AOEIndicators))
	}
}

func TestGelehkChargeDamagesPlayers(t *testing.T) {
	t.Parallel()

	g := NewGelehk("g1", 0, 0)
	g.Active = true
	g.Phase = 2
	g.HP = g.MaxHP / 2 // already in phase2 territory
	g.State = StateCharging
	g.chargeDirX = 1
	g.chargeTargetX = 100
	g.chargeRemaining = 100 * time.Millisecond
	hits := map[string]int{}
	damage := func(id string, amt int) { hits[id] += amt }
	players := []PlayerView{alive("p1", 30, 0), alive("p2", 30, 0)}
	g.Update(20*time.Millisecond, players, nil, nil, damage, nil)
	if hits["p1"] != GelehkChargeDamage {
		t.Fatalf("expected charge damage, got %v", hits)
	}
	if hits["p2"] != 0 {
		t.Fatalf("expected charge to damage only one player, got %v", hits)
	}
}

func TestGelehkStopChargeOnCollision(t *testing.T) {
	t.Parallel()

	g := NewGelehk("g1", 0, 0)
	g.State = StateCharging
	g.AttackTimer = 0
	g.StopChargeOnCollision()
	if g.State != StateIdle {
		t.Fatalf("expected idle after collision stop, got %s", g.State)
	}
	if g.AttackTimer != GelehkPhase2Cooldown {
		t.Fatalf("expected charge cooldown after stop, got %s", g.AttackTimer)
	}
}

func TestGelehkIceZoneSlow(t *testing.T) {
	t.Parallel()

	g := NewGelehk("g1", 0, 0)
	g.IceZones = []IceZone{{X: 0, Y: 0, Width: 100, Height: 100}}
	if g.PlayerSpeedMultiplier(50, 50) != GelehkIceZoneSlow {
		t.Fatal("expected slow")
	}
	if g.PlayerSpeedMultiplier(500, 500) != 1 {
		t.Fatal("expected no slow")
	}
}

func TestGelehkTakeDamageAndRespawn(t *testing.T) {
	t.Parallel()

	g := NewGelehk("g1", 0, 0)
	g.TakeDamage(GelehkMaxHP)
	if g.State != StateDead {
		t.Fatal("expected dead")
	}
	if !g.TryRespawn(GelehkRespawn + time.Millisecond) {
		t.Fatal("expected respawn")
	}
	if g.Phase != 1 || g.HP != g.MaxHP {
		t.Fatalf("unexpected reset: %+v", g)
	}
}

func TestVanessaCyclesAttackPatternsAndSpeech(t *testing.T) {
	t.Parallel()

	v := NewVanessaTheRuthless("v1", 0, 0)
	players := []PlayerView{alive("p1", 180, 0)}
	var lineCalls []struct {
		dx   float64
		dy   float64
		tint uint32
	}
	var burstCalls int
	var burstColors []uint32
	fire := func(x, y, dx, dy float64, k hazard.Kind, tint uint32) {
		if k != hazard.KindFireField {
			t.Fatalf("expected fire field lines, got %s", k)
		}
		lineCalls = append(lineCalls, struct {
			dx   float64
			dy   float64
			tint uint32
		}{dx: dx, dy: dy, tint: tint})
	}
	burst := func(x, y float64, k hazard.Kind, tints []uint32) {
		burstCalls++
		burstColors = append([]uint32(nil), tints...)
	}

	v.Update(50*time.Millisecond, players, fire, burst, nil)
	if len(lineCalls) != 2 {
		t.Fatalf("expected horizontal attack to spawn 2 lines, got %d", len(lineCalls))
	}
	if lineCalls[0].tint == 0 || lineCalls[1].tint != lineCalls[0].tint {
		t.Fatalf("expected horizontal attack to use a non-zero shared tint, got %+v", lineCalls)
	}

	v.Update(VanessaAttackCD, players, fire, burst, nil)
	if len(lineCalls) != 4 {
		t.Fatalf("expected vertical attack to add 2 more lines, got %d", len(lineCalls))
	}

	v.Update(VanessaAttackCD, players, fire, burst, nil)
	if len(lineCalls) != 8 {
		t.Fatalf("expected diagonal attack to add 4 lines, got %d", len(lineCalls))
	}

	v.Update(VanessaAttackCD, players, fire, burst, nil)
	if burstCalls != 1 {
		t.Fatalf("expected one burst attack, got %d", burstCalls)
	}
	if len(burstColors) < 3 {
		t.Fatalf("expected burst attack to mix multiple colors, got %v", burstColors)
	}

	v.Update(VanessaSpeechInterval, players, fire, burst, nil)
	text, color, ok := v.Speech()
	if !ok {
		t.Fatal("expected Vanessa speech to activate after interval")
	}
	if text != vanessaSpeechText || color != VanessaSpeechColor {
		t.Fatalf("unexpected speech payload: %q %q", text, color)
	}

	v.Update(VanessaSpeechDuration, players, fire, burst, nil)
	if _, _, ok := v.Speech(); ok {
		t.Fatal("expected speech to disappear after duration")
	}
}

func TestVanessaTakeDamageAndRespawn(t *testing.T) {
	t.Parallel()

	v := NewVanessaTheRuthless("v1", 0, 0)
	v.TakeDamage(VanessaMaxHP)
	if v.State != StateDead {
		t.Fatal("expected dead")
	}
	if !v.TryRespawn(VanessaRespawn + time.Millisecond) {
		t.Fatal("expected respawn")
	}
	if v.Phase != 4 || v.HP != v.MaxHP {
		t.Fatalf("unexpected reset: %+v", v)
	}
}
