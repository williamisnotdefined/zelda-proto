package world

import (
	"math/rand"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/config"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/hazard"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/portal"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

type counterIDs struct{ n atomic.Int64 }

func (c *counterIDs) NewID(prefix string) string {
	return prefix + "_" + strconv.FormatInt(c.n.Add(1), 10)
}

func newWorld(t *testing.T) *World {
	t.Helper()
	now := time.Unix(1_700_000_000, 0)
	return newWorldAt(t, &now)
}

func newWorldAt(t *testing.T, now *time.Time) *World {
	t.Helper()
	return New(Config{
		InstanceID: domworld.InstancePhase1,
		SpawnX:     200, SpawnY: 200,
		IDs:     &counterIDs{},
		Rand:    rand.New(rand.NewSource(1)),
		NowFunc: func() time.Time { return *now },
	})
}

func TestAddRemovePlayer(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	p := w.AddPlayer("p1", "Link", nil, nil)
	if p.X != 200 || p.Y != 200 {
		t.Fatalf("expected spawn position, got (%v,%v)", p.X, p.Y)
	}
	if w.RemovePlayer("p1") == nil {
		t.Fatal("expected removed player")
	}
	if w.RemovePlayer("ghost") != nil {
		t.Fatal("expected nil for missing player")
	}
}

func TestTickAdvancesPlayer(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	p := w.AddPlayer("p1", "Link", nil, nil)
	w.HandleInput("p1", player.Input{Seq: 1, Right: true})
	w.Tick(time.Second)
	if p.X <= 200 {
		t.Fatalf("expected x to increase, got %v", p.X)
	}
}

func TestEnemyContactDamagesPlayerOutsideSafeZone(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	x, y := 1000.0, 1000.0
	p := w.AddPlayer("p1", "Link", &x, &y)
	p.SafeZoneTimer = 0
	e := enemy.New("e1", 1000, 1000, "0,0", enemy.BlobConfig, drop.KindHeartSmall)
	w.SpawnEnemy(e)
	w.Tick(20 * time.Millisecond)
	if p.HP >= player.MaxHP {
		t.Fatalf("expected damage, got HP=%d", p.HP)
	}
}

func TestPortalQueuesTransferRequest(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	x, y := 500.0, 500.0
	w.AddPlayer("p1", "Link", &x, &y)
	w.SpawnPortal(&portal.Portal{
		ID: "pt1", X: 500, Y: 500, Kind: portal.Phase1ToPhase2,
		ToInstance: domworld.InstancePhase2,
		TargetX:    100, TargetY: 100,
		ActiveAt: time.Time{},
	})
	w.Tick(20 * time.Millisecond)
	reqs := w.ConsumeTransferRequests()
	if len(reqs) != 1 {
		t.Fatalf("expected 1 transfer, got %d", len(reqs))
	}
	if reqs[0].ToInstance != domworld.InstancePhase2 {
		t.Fatalf("wrong target")
	}
}

func TestPortalTransfersOnlyOnEnter(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	x, y := 100.0, 200.0
	p := w.AddPlayer("p1", "Link", &x, &y)
	p.SafeZoneTimer = 0
	w.SpawnPortal(&portal.Portal{
		ID: "pt1", X: 100, Y: 200, Kind: portal.Phase1ToPhase2,
		ToInstance: domworld.InstancePhase2,
		TargetX:    300, TargetY: 400,
		ActiveAt: time.Time{},
	})

	w.Tick(20 * time.Millisecond)
	if got := len(w.ConsumeTransferRequests()); got != 1 {
		t.Fatalf("expected initial transfer on enter, got %d", got)
	}

	w.Tick(20 * time.Millisecond)
	if got := len(w.ConsumeTransferRequests()); got != 0 {
		t.Fatalf("expected no retrigger while still overlapping, got %d", got)
	}

	p.PhaseTransferCooldown = 0
	w.Tick(20 * time.Millisecond)
	if got := len(w.ConsumeTransferRequests()); got != 0 {
		t.Fatalf("expected no retrigger without leaving portal, got %d", got)
	}

	p.X, p.Y = 500, 500
	w.Tick(20 * time.Millisecond)
	if got := len(w.ConsumeTransferRequests()); got != 0 {
		t.Fatalf("expected no transfer away from portal, got %d", got)
	}

	p.PhaseTransferCooldown = 0
	p.X, p.Y = 100, 200
	w.Tick(20 * time.Millisecond)
	if got := len(w.ConsumeTransferRequests()); got != 1 {
		t.Fatalf("expected transfer after re-entering portal, got %d", got)
	}
}

func TestDragonFiresHazardLine(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	x, y := 0.0, 0.0
	p := w.AddPlayer("p1", "Link", &x, &y)
	p.SafeZoneTimer = 0
	d := boss.NewDragonLord("d1", 200, 0)
	w.SpawnDragon(d)
	for i := 0; i < 10; i++ {
		w.Tick(50 * time.Millisecond)
	}
	if len(w.hazards) == 0 {
		t.Fatal("expected dragon to spawn hazards")
	}
}

func TestSnapshotIncludesEntities(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	w.AddPlayer("p1", "Link", nil, nil)
	w.SpawnEnemy(enemy.New("e1", 0, 0, "0,0", enemy.BlobConfig, drop.KindHeartSmall))
	w.SpawnDragon(boss.NewDragonLord("d1", 100, 100))
	w.SpawnGelehk(boss.NewGelehk("g1", 200, 200))
	w.Tick(10 * time.Millisecond)
	snap := w.Snapshot()
	if len(snap.Players) != 1 || len(snap.Enemies) != 1 || len(snap.Bosses) != 2 {
		t.Fatalf("unexpected snapshot: %+v", snap)
	}
}

func TestDropsDespawnAfterConfiguredLifetime(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_700_000_000, 0)
	w := newWorldAt(t, &now)
	w.drops["drop_1"] = &drop.Drop{ID: "drop_1", X: 1000, Y: 1000, Kind: drop.KindHeartSmall, SpawnedAt: now}
	w.dropIndex.Upsert("drop_1", 1000, 1000)
	if len(w.drops) != 1 {
		t.Fatalf("expected one spawned drop, got %d", len(w.drops))
	}

	now = now.Add(config.DefaultBalancing.HeartDropLifetime - time.Millisecond)
	w.Tick(20 * time.Millisecond)
	if len(w.drops) != 1 {
		t.Fatalf("expected drop to remain before ttl, got %d", len(w.drops))
	}

	now = now.Add(2 * time.Millisecond)
	w.Tick(20 * time.Millisecond)
	if len(w.drops) != 0 {
		t.Fatalf("expected drop to despawn after ttl, got %d", len(w.drops))
	}
	if got := len(w.Snapshot().Drops); got != 0 {
		t.Fatalf("expected snapshot drops empty after despawn, got %d", got)
	}
}

func TestPlayerDashMovesCasterOnlyAndSpawnsBlueTrail(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	ax, ay := 1000.0, 1000.0
	tx, ty := 1090.0, 1000.0
	attacker := w.AddPlayer("p1", "Link", &ax, &ay)
	target := w.AddPlayer("p2", "Zelda", &tx, &ty)
	attacker.SafeZoneTimer = 0
	target.SafeZoneTimer = 0
	passiveConfig := enemy.BlobConfig
	passiveConfig.Damage = 0
	passiveConfig.Speed = 0
	e := enemy.New("e1", 1040, 1000, "0,0", passiveConfig, drop.KindHeartSmall)
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Right: true, Dash: true})
	w.Tick(20 * time.Millisecond)

	if attacker.X <= ax+100 || attacker.Y != ay {
		t.Fatalf("expected attacker to advance sharply on dash, got (%.1f, %.1f)", attacker.X, attacker.Y)
	}
	if target.X >= tx+20 || target.Y != ty {
		t.Fatalf("expected target to avoid dash knockback, got (%.1f, %.1f)", target.X, target.Y)
	}
	if e.X >= 1060 || e.Y != 1000 {
		t.Fatalf("expected enemy to avoid dash knockback, got (%.1f, %.1f)", e.X, e.Y)
	}
	snap := w.Snapshot()
	if len(snap.WaveIndicators) != 0 {
		t.Fatal("expected no player wave indicator for dash")
	}
	foundBlueFlame := false
	for _, h := range snap.Hazards {
		if h.Kind == hazard.KindBlueFlame {
			foundBlueFlame = true
			break
		}
	}
	if !foundBlueFlame {
		t.Fatal("expected blue flame hazards from dash trail")
	}
}

func TestPlayerDashCanEndOnEnemyAndStillTakeContactDamage(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	px, py := 1000.0, 1000.0
	p := w.AddPlayer("p1", "Link", &px, &py)
	p.SafeZoneTimer = 0

	contactConfig := enemy.BlobConfig
	contactConfig.Damage = 7
	e := enemy.New("e1", px+player.DashDistance, py, "0,0", contactConfig, drop.KindHeartSmall)
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Right: true, Dash: true})
	w.Tick(20 * time.Millisecond)

	if got, want := p.HP, player.MaxHP-contactConfig.Damage; got != want {
		t.Fatalf("expected dash end overlap to keep normal contact damage, want HP=%d got %d", want, got)
	}
}

func TestPlayerGrenadeExplodesOnLandingAndSkipsOwner(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	ax, ay := 1000.0, 1000.0
	tx, ty := ax+player.GrenadeDistance, ay
	attacker := w.AddPlayer("p1", "Link", &ax, &ay)
	target := w.AddPlayer("p2", "Zelda", &tx, &ty)
	attacker.SafeZoneTimer = 0
	target.SafeZoneTimer = 0

	passiveConfig := enemy.BlobConfig
	passiveConfig.Damage = 0
	passiveConfig.Speed = 0
	e := enemy.New("e1", tx+40, ty, "0,0", passiveConfig, drop.KindHeartSmall)
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Right: true, Grenade: true})
	w.Tick(20 * time.Millisecond)

	if target.HP != player.MaxHP {
		t.Fatalf("expected grenade to stay airborne before landing, got target HP=%d", target.HP)
	}
	if e.HP != passiveConfig.MaxHP {
		t.Fatalf("expected grenade to avoid mid-air monster damage, got HP=%d", e.HP)
	}

	foundGrenade := false
	for _, h := range w.Snapshot().Hazards {
		if h.Kind == hazard.KindGrenade {
			foundGrenade = true
			if h.Direction != domworld.DirectionRight {
				t.Fatalf("expected grenade direction right, got %s", h.Direction)
			}
			break
		}
	}
	if !foundGrenade {
		t.Fatal("expected grenade hazard after throw")
	}

	for i := 0; i < 15; i++ {
		w.Tick(20 * time.Millisecond)
	}

	if got, want := attacker.HP, player.MaxHP; got != want {
		t.Fatalf("expected grenade owner to ignore own explosion, got HP=%d", got)
	}
	if got, want := target.HP, player.MaxHP-player.GrenadeDamage; got != want {
		t.Fatalf("expected target HP=%d after grenade, got %d", want, got)
	}
	if got, want := e.HP, passiveConfig.MaxHP-player.GrenadeDamage; got != want {
		t.Fatalf("expected enemy HP=%d after grenade, got %d", want, got)
	}

	foundExplosion := false
	for _, h := range w.Snapshot().Hazards {
		if h.Kind == hazard.KindGrenade {
			t.Fatal("expected landed grenade to be removed from snapshot")
		}
		if h.Kind == hazard.KindLandmineExplosion {
			foundExplosion = true
		}
	}
	if !foundExplosion {
		t.Fatal("expected grenade landing to spawn the shared explosion hazard")
	}
}

func TestPlayerMolotovExplodesOnLandingAndSkipsOwner(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	ax, ay := 1000.0, 1000.0
	tx, ty := ax+player.GrenadeDistance, ay
	attacker := w.AddPlayer("p1", "Link", &ax, &ay)
	target := w.AddPlayer("p2", "Zelda", &tx, &ty)
	attacker.SafeZoneTimer = 0
	target.SafeZoneTimer = 0

	passiveConfig := enemy.BlobConfig
	passiveConfig.Damage = 0
	passiveConfig.Speed = 0
	e := enemy.New("e1", tx+40, ty, "0,0", passiveConfig, drop.KindHeartSmall)
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Right: true, Molotov: true})
	w.Tick(20 * time.Millisecond)

	if target.HP != player.MaxHP {
		t.Fatalf("expected molotov to stay airborne before landing, got target HP=%d", target.HP)
	}
	if e.HP != passiveConfig.MaxHP {
		t.Fatalf("expected molotov to avoid mid-air monster damage, got HP=%d", e.HP)
	}

	foundMolotov := false
	for _, h := range w.Snapshot().Hazards {
		if h.Kind == hazard.KindMolotov {
			foundMolotov = true
			if h.Direction != domworld.DirectionRight {
				t.Fatalf("expected molotov direction right, got %s", h.Direction)
			}
			break
		}
	}
	if !foundMolotov {
		t.Fatal("expected molotov hazard after throw")
	}

	for i := 0; i < 15; i++ {
		w.Tick(20 * time.Millisecond)
	}

	if got, want := attacker.HP, player.MaxHP; got != want {
		t.Fatalf("expected molotov owner to ignore own explosion, got HP=%d", got)
	}
	if got, want := target.HP, player.MaxHP-player.MolotovDamage; got != want {
		t.Fatalf("expected target HP=%d after molotov, got %d", want, got)
	}
	if got, want := e.HP, passiveConfig.MaxHP-player.MolotovDamage; got != want {
		t.Fatalf("expected enemy HP=%d after molotov, got %d", want, got)
	}

	foundExplosion := false
	for _, h := range w.Snapshot().Hazards {
		if h.Kind == hazard.KindMolotov {
			t.Fatal("expected landed molotov to be removed from snapshot")
		}
		if h.Kind == hazard.KindLandmineExplosion {
			foundExplosion = true
		}
	}
	if !foundExplosion {
		t.Fatal("expected molotov landing to spawn the shared explosion hazard")
	}
}

func TestPlayerLandmineExplodesOnContactAndSkipsOwner(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	ax, ay := 1000.0, 1000.0
	tx, ty := ax-player.LandmineSpawnOffset, ay
	attacker := w.AddPlayer("p1", "Link", &ax, &ay)
	target := w.AddPlayer("p2", "Zelda", &tx, &ty)
	attacker.SafeZoneTimer = 0
	target.SafeZoneTimer = 0

	passiveConfig := enemy.BlobConfig
	passiveConfig.Damage = 0
	passiveConfig.Speed = 0
	e := enemy.New("e1", tx+40, ty, "0,0", passiveConfig, drop.KindHeartSmall)
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Right: true, Landmine: true})
	w.Tick(20 * time.Millisecond)

	if got, want := attacker.HP, player.MaxHP; got != want {
		t.Fatalf("expected landmine owner to ignore own explosion, got HP=%d", got)
	}
	if got, want := target.HP, player.MaxHP-player.LandmineDamage; got != want {
		t.Fatalf("expected target HP=%d after landmine, got %d", want, got)
	}
	if got, want := e.HP, passiveConfig.MaxHP-player.LandmineDamage; got != want {
		t.Fatalf("expected enemy HP=%d after landmine, got %d", want, got)
	}

	foundExplosion := false
	for _, h := range w.Snapshot().Hazards {
		if h.Kind == hazard.KindLandmine {
			t.Fatal("expected consumed landmine to be removed from snapshot")
		}
		if h.Kind == hazard.KindLandmineExplosion {
			foundExplosion = true
		}
	}
	if !foundExplosion {
		t.Fatal("expected landmine explosion hazard after detonation")
	}
}

func TestProtectedCasterLandmineSkipsPvPButStillDamagesMonsters(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	ax, ay := 200.0, 200.0
	tx, ty := ax-player.LandmineSpawnOffset, ay
	attacker := w.AddPlayer("p1", "Link", &ax, &ay)
	target := w.AddPlayer("p2", "Zelda", &tx, &ty)
	target.SafeZoneTimer = 0

	passiveConfig := enemy.BlobConfig
	passiveConfig.Damage = 0
	passiveConfig.Speed = 0
	e := enemy.New("e1", tx+40, ty, "0,0", passiveConfig, drop.KindHeartSmall)
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Right: true, Landmine: true})
	w.Tick(20 * time.Millisecond)

	if got, want := target.HP, player.MaxHP; got != want {
		t.Fatalf("expected protected caster landmine to skip PvP damage, got HP=%d", got)
	}
	if got, want := e.HP, passiveConfig.MaxHP-player.LandmineDamage; got != want {
		t.Fatalf("expected protected caster landmine to still damage monsters, got HP=%d", got)
	}
	if attacker.HP != player.MaxHP {
		t.Fatalf("expected caster HP unchanged, got %d", attacker.HP)
	}
}

func TestProtectedCasterGrenadeSkipsPvPButStillDamagesMonsters(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	ax, ay := 200.0, 200.0
	tx, ty := ax+player.GrenadeDistance, ay
	attacker := w.AddPlayer("p1", "Link", &ax, &ay)
	target := w.AddPlayer("p2", "Zelda", &tx, &ty)
	target.SafeZoneTimer = 0

	passiveConfig := enemy.BlobConfig
	passiveConfig.Damage = 0
	passiveConfig.Speed = 0
	e := enemy.New("e1", tx+40, ty, "0,0", passiveConfig, drop.KindHeartSmall)
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Right: true, Grenade: true})
	w.Tick(20 * time.Millisecond)
	for i := 0; i < 15; i++ {
		w.Tick(20 * time.Millisecond)
	}

	if got, want := target.HP, player.MaxHP; got != want {
		t.Fatalf("expected protected caster grenade to skip PvP damage, got HP=%d", got)
	}
	if got, want := e.HP, passiveConfig.MaxHP-player.GrenadeDamage; got != want {
		t.Fatalf("expected protected caster grenade to still damage monsters, got HP=%d", got)
	}
	if attacker.HP != player.MaxHP {
		t.Fatalf("expected caster HP unchanged, got %d", attacker.HP)
	}
}

func TestProtectedCasterMolotovSkipsPvPButStillDamagesMonsters(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	ax, ay := 200.0, 200.0
	tx, ty := ax+player.GrenadeDistance, ay
	attacker := w.AddPlayer("p1", "Link", &ax, &ay)
	target := w.AddPlayer("p2", "Zelda", &tx, &ty)
	target.SafeZoneTimer = 0

	passiveConfig := enemy.BlobConfig
	passiveConfig.Damage = 0
	passiveConfig.Speed = 0
	e := enemy.New("e1", tx+40, ty, "0,0", passiveConfig, drop.KindHeartSmall)
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Right: true, Molotov: true})
	w.Tick(20 * time.Millisecond)
	for i := 0; i < 15; i++ {
		w.Tick(20 * time.Millisecond)
	}

	if got, want := target.HP, player.MaxHP; got != want {
		t.Fatalf("expected protected caster molotov to skip PvP damage, got HP=%d", got)
	}
	if got, want := e.HP, passiveConfig.MaxHP-player.MolotovDamage; got != want {
		t.Fatalf("expected protected caster molotov to still damage monsters, got HP=%d", got)
	}
	if attacker.HP != player.MaxHP {
		t.Fatalf("expected caster HP unchanged, got %d", attacker.HP)
	}
}

func TestPlayerWaveDamagesAndPushesTargets(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	ax, ay := 1000.0, 1000.0
	tx, ty := 1070.0, 1000.0
	attacker := w.AddPlayer("p1", "Link", &ax, &ay)
	target := w.AddPlayer("p2", "Zelda", &tx, &ty)
	attacker.TakeDamage(20)
	attacker.SafeZoneTimer = 0
	target.SafeZoneTimer = 0
	passiveConfig := enemy.BlobConfig
	passiveConfig.Damage = 0
	e := enemy.New("e1", 1000, 1090, "0,0", passiveConfig, drop.KindHeartSmall)
	e.TargetID = attacker.ID
	e.State = enemy.StateChasing
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Wave: true})
	w.Tick(20 * time.Millisecond)
	if e.X != 1000 || e.Y != 1090 {
		t.Fatalf("expected frozen enemy to stay put during wave windup, got (%.1f, %.1f)", e.X, e.Y)
	}
	if e.HP != enemy.BlobConfig.MaxHP {
		t.Fatalf("expected no enemy damage during windup, got %d", e.HP)
	}
	if target.HP != player.MaxHP {
		t.Fatalf("expected no player damage during windup, got %d", target.HP)
	}
	windupSnap := w.Snapshot()
	if len(windupSnap.WaveIndicators) == 0 || windupSnap.WaveIndicators[0].State != boss.WaveWindup {
		t.Fatalf("expected player wave windup indicator, got %#v", windupSnap.WaveIndicators)
	}
	if windupSnap.WaveIndicators[0].Kind != "wave" {
		t.Fatalf("expected wave indicator kind 'wave', got %#v", windupSnap.WaveIndicators[0])
	}

	w.Tick(player.WaveWindup)
	expandingSnap := w.Snapshot()
	if len(expandingSnap.WaveIndicators) == 0 || expandingSnap.WaveIndicators[0].State != boss.WaveExpanding {
		t.Fatalf("expected expanding player wave indicator, got %#v", expandingSnap.WaveIndicators)
	}

	releaseAfter := player.WaveExpandDuration() + 20*time.Millisecond
	w.Tick(releaseAfter)

	if got, want := e.HP, enemy.BlobConfig.MaxHP-player.WaveDamage; got != want {
		t.Fatalf("expected enemy HP=%d after wave, got %d", want, got)
	}
	if got, want := target.HP, player.MaxHP-player.WaveDamage; got != want {
		t.Fatalf("expected target HP=%d after wave, got %d", want, got)
	}
	if got, want := attacker.HP, player.MaxHP-12; got != want {
		t.Fatalf("expected attacker HP=%d after wave life steal, got %d", want, got)
	}
	if dx, dy := e.X-attacker.X, e.Y-attacker.Y; dx*dx+dy*dy <= player.WaveMaxRadius*player.WaveMaxRadius {
		t.Fatalf("expected enemy pushed outside wave radius, got enemy at (%.1f, %.1f)", e.X, e.Y)
	}
	if dx, dy := target.X-attacker.X, target.Y-attacker.Y; dx*dx+dy*dy <= player.WaveMaxRadius*player.WaveMaxRadius {
		t.Fatalf("expected player pushed outside wave radius, got target at (%.1f, %.1f)", target.X, target.Y)
	}
	if len(w.Snapshot().WaveIndicators) != 0 {
		t.Fatal("expected no player wave indicator after release")
	}
}

func TestPlayerNumbDamagesPushesAndKeepsTargetsFrozen(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	ax, ay := 1000.0, 1000.0
	tx, ty := 1070.0, 1000.0
	attacker := w.AddPlayer("p1", "Link", &ax, &ay)
	target := w.AddPlayer("p2", "Zelda", &tx, &ty)
	attacker.TakeDamage(30)
	attacker.SafeZoneTimer = 0
	target.SafeZoneTimer = 0
	passiveConfig := enemy.BlobConfig
	passiveConfig.Damage = 7
	e := enemy.New("e1", 1000, 1049, "0,0", passiveConfig, drop.KindHeartSmall)
	e.TargetID = attacker.ID
	e.State = enemy.StateChasing
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Numb: true})
	w.Tick(20 * time.Millisecond)
	if got, want := attacker.HP, player.MaxHP-30; got != want {
		t.Fatalf("expected numb freeze to suppress contact damage, want HP=%d got %d", want, got)
	}
	windupSnap := w.Snapshot()
	if len(windupSnap.WaveIndicators) == 0 || windupSnap.WaveIndicators[0].State != boss.WaveWindup {
		t.Fatalf("expected player numb windup indicator, got %#v", windupSnap.WaveIndicators)
	}
	if windupSnap.WaveIndicators[0].Kind != "numb" {
		t.Fatalf("expected numb indicator kind 'numb', got %#v", windupSnap.WaveIndicators[0])
	}

	w.Tick(player.WaveWindup)
	expandingSnap := w.Snapshot()
	if len(expandingSnap.WaveIndicators) == 0 || expandingSnap.WaveIndicators[0].State != boss.WaveExpanding {
		t.Fatalf("expected expanding numb indicator, got %#v", expandingSnap.WaveIndicators)
	}
	if expandingSnap.WaveIndicators[0].Kind != "numb" {
		t.Fatalf("expected expanding numb kind 'numb', got %#v", expandingSnap.WaveIndicators[0])
	}

	releaseAfter := player.WaveExpandDuration() + 20*time.Millisecond
	w.Tick(releaseAfter)

	if got, want := e.HP, enemy.BlobConfig.MaxHP-player.NumbDamage; got != want {
		t.Fatalf("expected enemy HP=%d after numb, got %d", want, got)
	}
	if got, want := target.HP, player.MaxHP-player.NumbDamage; got != want {
		t.Fatalf("expected target HP=%d after numb, got %d", want, got)
	}
	if got, want := attacker.HP, player.MaxHP-22; got != want {
		t.Fatalf("expected attacker HP=%d after numb life steal, got %d", want, got)
	}
	frozenX, frozenY := e.X, e.Y

	w.Tick(1000 * time.Millisecond)
	if e.X != frozenX || e.Y != frozenY {
		t.Fatalf("expected enemy to stay frozen for numb, got moved to (%.1f, %.1f)", e.X, e.Y)
	}

	w.Tick(1000 * time.Millisecond)
	w.Tick(120 * time.Millisecond)
	if e.X == frozenX && e.Y == frozenY {
		t.Fatalf("expected enemy to move again after numb freeze ends, still at (%.1f, %.1f)", e.X, e.Y)
	}
	if len(w.Snapshot().WaveIndicators) != 0 {
		t.Fatal("expected no numb indicator after release")
	}
}

func TestPlayerPullClustersHostilesAndKeepsThemFrozenForTwoSeconds(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	ax, ay := 1000.0, 1000.0
	attacker := w.AddPlayer("p1", "Link", &ax, &ay)
	attacker.TakeDamage(20)
	attacker.SafeZoneTimer = 0
	aggressiveConfig := enemy.BlobConfig
	aggressiveConfig.Damage = 7
	e := enemy.New("e1", 1000, 1090, "0,0", aggressiveConfig, drop.KindHeartSmall)
	e.TargetID = attacker.ID
	e.State = enemy.StateChasing
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Pull: true})
	w.Tick(20 * time.Millisecond)
	if e.X != 1000 || e.Y != 1090 {
		t.Fatalf("expected frozen enemy to stay put during pull windup, got (%.1f, %.1f)", e.X, e.Y)
	}
	if e.HP != enemy.BlobConfig.MaxHP {
		t.Fatalf("expected no enemy damage during pull windup, got %d", e.HP)
	}
	windupSnap := w.Snapshot()
	if len(windupSnap.WaveIndicators) == 0 || windupSnap.WaveIndicators[0].State != boss.WaveWindup {
		t.Fatalf("expected player pull windup indicator, got %#v", windupSnap.WaveIndicators)
	}
	if windupSnap.WaveIndicators[0].Kind != "pull" {
		t.Fatalf("expected pull indicator kind 'pull', got %#v", windupSnap.WaveIndicators[0])
	}

	w.Tick(player.WaveWindup)
	collapsingSnap := w.Snapshot()
	if len(collapsingSnap.WaveIndicators) == 0 || collapsingSnap.WaveIndicators[0].State != boss.WaveCollapsing {
		t.Fatalf("expected collapsing pull indicator, got %#v", collapsingSnap.WaveIndicators)
	}
	if collapsingSnap.WaveIndicators[0].Kind != "pull" {
		t.Fatalf("expected collapsing pull kind 'pull', got %#v", collapsingSnap.WaveIndicators[0])
	}

	releaseAfter := player.WaveExpandDuration() + 20*time.Millisecond
	w.Tick(releaseAfter)

	if got, want := e.HP, enemy.BlobConfig.MaxHP-player.PullDamage; got != want {
		t.Fatalf("expected enemy HP=%d after pull, got %d", want, got)
	}
	if got, want := attacker.HP, player.MaxHP-16; got != want {
		t.Fatalf("expected attacker HP=%d after pull life steal, got %d", want, got)
	}
	if e.X != attacker.X || e.Y != attacker.Y {
		t.Fatalf("expected enemy clustered onto attacker, got enemy at (%.1f, %.1f) attacker at (%.1f, %.1f)", e.X, e.Y, attacker.X, attacker.Y)
	}
	if len(w.Snapshot().WaveIndicators) != 0 {
		t.Fatal("expected no pull indicator after release")
	}

	clusterX, clusterY := e.X, e.Y
	heldHP := attacker.HP

	w.HandleInput("p1", player.Input{Seq: 2, Right: true})
	w.Tick(100 * time.Millisecond)
	if attacker.X <= clusterX {
		t.Fatalf("expected attacker to move away from the pull cluster, got attacker at (%.1f, %.1f)", attacker.X, attacker.Y)
	}
	if e.X != clusterX || e.Y != clusterY {
		t.Fatalf("expected pulled enemy to stay stacked at collapse point during hold, got (%.1f, %.1f)", e.X, e.Y)
	}
	if attacker.HP != heldHP {
		t.Fatalf("expected no contact damage during pull hold, want HP=%d got %d", heldHP, attacker.HP)
	}

	w.HandleInput("p1", player.Input{Seq: 3})
	w.Tick(1800 * time.Millisecond)
	if e.X != clusterX || e.Y != clusterY {
		t.Fatalf("expected pulled enemy to remain stacked for 2s, got (%.1f, %.1f)", e.X, e.Y)
	}
	if attacker.HP != heldHP {
		t.Fatalf("expected no contact damage before pull hold ends, want HP=%d got %d", heldHP, attacker.HP)
	}

	w.Tick(120 * time.Millisecond)
	if e.X == clusterX && e.Y == clusterY {
		t.Fatal("expected stacked enemy to spread once the pull hold expires")
	}
	if attacker.HP >= heldHP {
		t.Fatalf("expected pulled enemy to resume contact damage after hold ends, want HP<%d got %d", heldHP, attacker.HP)
	}
}

func TestPlayerVenomMarksHostilesAndAmplifiesFollowUpDamage(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	ax, ay := 1000.0, 1000.0
	attacker := w.AddPlayer("p1", "Link", &ax, &ay)
	attacker.TakeDamage(40)
	attacker.SafeZoneTimer = 0
	aggressiveConfig := enemy.BlobConfig
	aggressiveConfig.Damage = 0
	e := enemy.New("e1", 1000, 1090, "0,0", aggressiveConfig, drop.KindHeartSmall)
	e.TargetID = attacker.ID
	e.State = enemy.StateChasing
	w.SpawnEnemy(e)

	w.HandleInput("p1", player.Input{Seq: 1, Venom: true})
	w.Tick(20 * time.Millisecond)
	windupSnap := w.Snapshot()
	if len(windupSnap.WaveIndicators) == 0 || windupSnap.WaveIndicators[0].State != boss.WaveWindup {
		t.Fatalf("expected player venom windup indicator, got %#v", windupSnap.WaveIndicators)
	}
	if windupSnap.WaveIndicators[0].Kind != "venom" {
		t.Fatalf("expected venom indicator kind 'venom', got %#v", windupSnap.WaveIndicators[0])
	}

	w.Tick(player.WaveWindup)
	expandingSnap := w.Snapshot()
	if len(expandingSnap.WaveIndicators) == 0 || expandingSnap.WaveIndicators[0].State != boss.WaveExpanding {
		t.Fatalf("expected expanding venom indicator, got %#v", expandingSnap.WaveIndicators)
	}
	if expandingSnap.WaveIndicators[0].Kind != "venom" {
		t.Fatalf("expected expanding venom kind 'venom', got %#v", expandingSnap.WaveIndicators[0])
	}

	w.Tick(player.WaveExpandDuration() + 20*time.Millisecond)
	if got, want := e.HP, enemy.BlobConfig.MaxHP-player.VenomDamage; got != want {
		t.Fatalf("expected enemy HP=%d after venom, got %d", want, got)
	}
	if got, want := attacker.HP, player.MaxHP-36; got != want {
		t.Fatalf("expected attacker HP=%d after venom life steal, got %d", want, got)
	}

	w.HandleInput("p1", player.Input{Seq: 2, Down: true, Molotov: true})
	w.Tick(20 * time.Millisecond)
	for i := 0; i < 15; i++ {
		w.Tick(20 * time.Millisecond)
	}
	if got, want := e.HP, enemy.BlobConfig.MaxHP-player.VenomDamage-player.MolotovDamage*2; got != want {
		t.Fatalf("expected enemy HP=%d after doubled molotov damage, got %d", want, got)
	}
	if got, want := attacker.HP, player.MaxHP-24; got != want {
		t.Fatalf("expected attacker HP=%d after venom follow-up lifesteal, got %d", want, got)
	}

	w.Tick(player.VenomDebuffDuration)
	w.HandleInput("p1", player.Input{Seq: 3, Down: true, Molotov: true})
	w.Tick(20 * time.Millisecond)
	for i := 0; i < 15; i++ {
		w.Tick(20 * time.Millisecond)
	}
	if got, want := e.HP, enemy.BlobConfig.MaxHP-player.VenomDamage-player.MolotovDamage*2-player.MolotovDamage; got != want {
		t.Fatalf("expected enemy HP=%d after venom expired, got %d", want, got)
	}
	if got, want := attacker.HP, player.MaxHP-24; got != want {
		t.Fatalf("expected attacker HP=%d to stop gaining venom lifesteal, got %d", want, got)
	}
	if len(w.Snapshot().WaveIndicators) != 0 {
		t.Fatal("expected no venom indicator after release")
	}
}

func TestAdoptPlayer(t *testing.T) {
	t.Parallel()

	w := newWorld(t)
	p := player.New("p1", "Link", 0, 0)
	p.SafeZoneTimer = 0
	e := enemy.New("e1", 200, 200, "0,0", enemy.BlobConfig, drop.KindHeartSmall)
	e.TargetID = p.ID
	e.State = enemy.StateChasing
	w.SpawnEnemy(e)
	w.AdoptPlayer(p, 100, 100)
	if w.Players()["p1"] == nil {
		t.Fatal("expected adoption")
	}
	if p.SafeZoneTimer != player.SafeZoneDuration {
		t.Fatalf("expected safezone rearmed, got %s", p.SafeZoneTimer)
	}
	if e.State != enemy.StateIdle {
		t.Fatalf("expected hostile reset to idle, got %s", e.State)
	}
	if e.TargetID != "" {
		t.Fatalf("expected hostile target cleared, got %q", e.TargetID)
	}
	if dx, dy := e.X-200.0, e.Y-200.0; dx*dx+dy*dy <= domworld.SpawnSafeZoneRadius*domworld.SpawnSafeZoneRadius {
		t.Fatalf("expected hostile expelled from safe zone, got enemy at (%.1f, %.1f)", e.X, e.Y)
	}
}
