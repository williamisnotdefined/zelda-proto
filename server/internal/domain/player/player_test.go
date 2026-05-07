package player

import (
	"math"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

func TestNewPlayerDefaults(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 100, 200)
	if p.HP != MaxHP || p.MaxHP != MaxHP {
		t.Fatalf("expected HP=%d, got %d", MaxHP, p.HP)
	}
	if p.State != StateIdle {
		t.Fatalf("expected state idle, got %s", p.State)
	}
	if p.Direction != world.DirectionDown {
		t.Fatalf("expected facing down, got %s", p.Direction)
	}
	if p.LastProcessedInputSeq != -1 {
		t.Fatalf("expected lastProcessedInputSeq=-1, got %d", p.LastProcessedInputSeq)
	}
	if p.EquippedWeapon != WeaponKindPistol {
		t.Fatalf("expected default equipped weapon %q, got %q", WeaponKindPistol, p.EquippedWeapon)
	}
}

func TestApplyInputIgnoresOutOfOrderAndNegative(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.ApplyInput(Input{Seq: -1})
	p.Update(50*time.Millisecond, 1)
	if p.LastProcessedInputSeq != -1 {
		t.Fatalf("expected negative seq to be ignored, got %d", p.LastProcessedInputSeq)
	}

	p.ApplyInput(Input{Seq: 5, Right: true})
	p.Update(50*time.Millisecond, 1)
	if p.LastProcessedInputSeq != 5 {
		t.Fatalf("expected seq=5, got %d", p.LastProcessedInputSeq)
	}

	p.ApplyInput(Input{Seq: 4, Right: true})
	p.Update(50*time.Millisecond, 1)
	if p.LastProcessedInputSeq != 5 {
		t.Fatalf("expected seq stuck at 5 (older ignored), got %d", p.LastProcessedInputSeq)
	}
}

func TestUpdateMovesAndUpdatesDirection(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.ApplyInput(Input{Seq: 1, Right: true})
	p.Update(time.Second, 1)
	if math.Abs(p.X-Speed) > 1e-9 {
		t.Fatalf("expected X=%v, got %v", Speed, p.X)
	}
	if p.Direction != world.DirectionRight {
		t.Fatalf("expected right, got %s", p.Direction)
	}
	if p.State != StateMoving {
		t.Fatalf("expected moving, got %s", p.State)
	}
}

func TestUpdateAttackQueuesPistolCastAndConsumesCooldown(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.ApplyInput(Input{Seq: 1, Right: true, Attack: true})
	p.Update(10*time.Millisecond, 1)
	if p.State != StateMoving {
		t.Fatalf("expected moving while firing, got %s", p.State)
	}

	cx, cy, direction, castID, ok := p.ConsumePistolCast()
	if !ok {
		t.Fatal("expected queued pistol cast")
	}
	if castID == 0 {
		t.Fatal("expected cast id for pistol shot")
	}
	if cx != 0 || cy != 0 {
		t.Fatalf("expected pistol cast at player position, got (%.1f, %.1f)", cx, cy)
	}
	if direction != world.DirectionRight {
		t.Fatalf("expected pistol direction right, got %s", direction)
	}

	p.ApplyInput(Input{Seq: 2, Right: true, Attack: true})
	p.Update(490*time.Millisecond, 1)
	if p.AttackCooldown <= 0 {
		t.Fatal("expected cooldown to be active")
	}
	if _, _, _, _, ok := p.ConsumePistolCast(); ok {
		t.Fatal("expected cooldown to block pistol cast before 500ms")
	}

	p.Update(10*time.Millisecond, 1)
	if _, _, _, secondCastID, ok := p.ConsumePistolCast(); !ok {
		t.Fatal("expected second pistol cast after 500ms")
	} else if secondCastID == castID {
		t.Fatal("expected a fresh cast id for the second pistol shot")
	}

	p.ApplyInput(Input{Seq: 3})
	p.Update(50*time.Millisecond, 1)
	if p.State != StateIdle {
		t.Fatalf("expected idle after firing stops, got %s", p.State)
	}
}

func TestAttackDoesNotReduceMovementSpeed(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.ApplyInput(Input{Seq: 1, Right: true, Attack: true})
	p.Update(time.Second, 1)
	if math.Abs(p.X-Speed) > 1e-9 {
		t.Fatalf("expected attack movement speed to stay at %v, got %v", Speed, p.X)
	}
}

func TestWaveTriggerQueuesSingleCastAndCooldown(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 10, 20)
	p.ApplyInput(Input{Seq: 1, Wave: true})
	p.Update(20*time.Millisecond, 1)
	if p.WaveCooldown != WaveCooldown {
		t.Fatalf("expected wave cooldown %s, got %s", WaveCooldown, p.WaveCooldown)
	}
	cx, cy, ok := p.ConsumeWaveStart()
	if !ok {
		t.Fatal("expected queued wave start")
	}
	if cx != 10 || cy != 20 {
		t.Fatalf("expected wave center at player position, got (%.1f, %.1f)", cx, cy)
	}
	if _, _, ok := p.ConsumeWaveStart(); ok {
		t.Fatal("expected wave start to be consumed once")
	}
	wave := p.WaveIndicator()
	if wave == nil || wave.Radius <= 0 || wave.State != WaveStateWindup {
		t.Fatalf("expected active wave indicator, got %#v", wave)
	}

	releaseAfter := WaveWindup + WaveExpandDuration()
	p.Update(releaseAfter, 1)
	cx, cy, targets, castID, ok := p.ConsumeWaveRelease()
	if !ok {
		t.Fatal("expected queued wave release")
	}
	if castID == 0 {
		t.Fatal("expected cast id for wave release")
	}
	if cx != 10 || cy != 20 {
		t.Fatalf("expected wave release at player position, got (%.1f, %.1f)", cx, cy)
	}
	if len(targets.EnemyIDs)+len(targets.DragonIDs)+len(targets.GelehkIDs)+len(targets.VanessaIDs) != 0 {
		t.Fatalf("expected no prelocked targets in unit test, got %#v", targets)
	}

	p.ApplyInput(Input{Seq: 2, Wave: true})
	p.Update(10*time.Millisecond, 1)
	if _, _, ok := p.ConsumeWaveStart(); ok {
		t.Fatal("expected cooldown to block second wave cast")
	}
}

func TestDashTriggerQueuesSingleCastAndCooldown(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 10, 20)
	p.ApplyInput(Input{Seq: 1, Right: true, Dash: true})
	p.Update(20*time.Millisecond, 1)
	if p.DashCooldown != DashCooldown {
		t.Fatalf("expected dash cooldown %s, got %s", DashCooldown, p.DashCooldown)
	}
	cx, cy, direction, ok := p.ConsumeDashCast()
	if !ok {
		t.Fatal("expected queued dash cast")
	}
	if cx != 10 || cy != 20 {
		t.Fatalf("expected dash start at player position, got (%.1f, %.1f)", cx, cy)
	}
	if direction != world.DirectionRight {
		t.Fatalf("expected dash direction right, got %s", direction)
	}
	if _, _, _, ok := p.ConsumeDashCast(); ok {
		t.Fatal("expected dash cast to be consumed once")
	}
	if wave := p.WaveIndicator(); wave != nil {
		t.Fatalf("expected no player wave indicator during dash, got %#v", wave)
	}

	p.ApplyInput(Input{Seq: 2, Right: true, Dash: true})
	p.Update(10*time.Millisecond, 1)
	if _, _, _, ok := p.ConsumeDashCast(); ok {
		t.Fatal("expected cooldown to block second dash cast")
	}
}

func TestFireballTriggerQueuesSingleCastAndCooldown(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 10, 20)
	p.ApplyInput(Input{Seq: 1, Left: true, Fireball: true})
	p.Update(20*time.Millisecond, 1)
	if p.FireballCooldown != FireballCooldown {
		t.Fatalf("expected fireball cooldown %s, got %s", FireballCooldown, p.FireballCooldown)
	}
	cx, cy, direction, castID, ok := p.ConsumeFireballCast()
	if !ok {
		t.Fatal("expected queued fireball cast")
	}
	if castID == 0 {
		t.Fatal("expected cast id for fireball")
	}
	if cx != 10 || cy != 20 {
		t.Fatalf("expected fireball start at player position, got (%.1f, %.1f)", cx, cy)
	}
	if direction != world.DirectionLeft {
		t.Fatalf("expected fireball direction left, got %s", direction)
	}
	if _, _, _, _, ok := p.ConsumeFireballCast(); ok {
		t.Fatal("expected fireball cast to be consumed once")
	}

	p.ApplyInput(Input{Seq: 2, Left: true, Fireball: true})
	p.Update(10*time.Millisecond, 1)
	if _, _, _, _, ok := p.ConsumeFireballCast(); ok {
		t.Fatal("expected cooldown to block second fireball cast")
	}
}

func TestGrenadeTriggerQueuesSingleCastAndCooldown(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 10, 20)
	p.ApplyInput(Input{Seq: 1, Left: true, Grenade: true})
	p.Update(20*time.Millisecond, 1)
	if p.GrenadeCooldown != GrenadeCooldown {
		t.Fatalf("expected grenade cooldown %s, got %s", GrenadeCooldown, p.GrenadeCooldown)
	}
	cx, cy, direction, castID, ok := p.ConsumeGrenadeCast()
	if !ok {
		t.Fatal("expected queued grenade cast")
	}
	if castID == 0 {
		t.Fatal("expected cast id for grenade")
	}
	if cx != 10 || cy != 20 {
		t.Fatalf("expected grenade start at player position, got (%.1f, %.1f)", cx, cy)
	}
	if direction != world.DirectionLeft {
		t.Fatalf("expected grenade direction left, got %s", direction)
	}
	if _, _, _, _, ok := p.ConsumeGrenadeCast(); ok {
		t.Fatal("expected grenade cast to be consumed once")
	}

	p.ApplyInput(Input{Seq: 2, Left: true, Grenade: true})
	p.Update(10*time.Millisecond, 1)
	if _, _, _, _, ok := p.ConsumeGrenadeCast(); ok {
		t.Fatal("expected cooldown to block second grenade cast")
	}
}

func TestLandmineTriggerQueuesSingleCastAndCooldown(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 10, 20)
	p.ApplyInput(Input{Seq: 1, Right: true, Landmine: true})
	p.Update(20*time.Millisecond, 1)
	if p.LandmineCooldown != LandmineCooldown {
		t.Fatalf("expected landmine cooldown %s, got %s", LandmineCooldown, p.LandmineCooldown)
	}
	cx, cy, direction, castID, ok := p.ConsumeLandmineCast()
	if !ok {
		t.Fatal("expected queued landmine cast")
	}
	if castID == 0 {
		t.Fatal("expected cast id for landmine")
	}
	if cx != 10 || cy != 20 {
		t.Fatalf("expected landmine start at player position, got (%.1f, %.1f)", cx, cy)
	}
	if direction != world.DirectionRight {
		t.Fatalf("expected landmine direction right, got %s", direction)
	}
	if _, _, _, _, ok := p.ConsumeLandmineCast(); ok {
		t.Fatal("expected landmine cast to be consumed once")
	}

	p.ApplyInput(Input{Seq: 2, Right: true, Landmine: true})
	p.Update(10*time.Millisecond, 1)
	if _, _, _, _, ok := p.ConsumeLandmineCast(); ok {
		t.Fatal("expected cooldown to block second landmine cast")
	}
}

func TestAttackHitboxReturnsBoxOnlyWhileAttacking(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 100, 100)
	if _, ok := p.AttackHitbox(); ok {
		t.Fatal("expected no hitbox when idle")
	}

	p.State = StateAttacking
	for _, dir := range []world.Direction{world.DirectionUp, world.DirectionDown, world.DirectionLeft, world.DirectionRight} {
		p.Direction = dir
		if _, ok := p.AttackHitbox(); !ok {
			t.Fatalf("expected hitbox for direction %s", dir)
		}
	}
}

func TestTakeDamageTransitionsToDead(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.TakeDamage(MaxHP + 10)
	if p.State != StateDead {
		t.Fatalf("expected dead, got %s", p.State)
	}
	if p.HP != 0 {
		t.Fatalf("expected hp=0, got %d", p.HP)
	}
	if p.Deaths != 1 {
		t.Fatalf("expected deaths=1, got %d", p.Deaths)
	}

	p.TakeDamage(10)
	if p.Deaths != 1 {
		t.Fatal("expected dead player to ignore further damage")
	}
}

func TestTakeDamageIgnoresZeroOrNegative(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.TakeDamage(0)
	p.TakeDamage(-5)
	if p.HP != MaxHP {
		t.Fatalf("expected HP unchanged, got %d", p.HP)
	}
}

func TestHealRestoresHPUpToMax(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.TakeDamage(30)
	p.Heal(10)
	if got, want := p.HP, MaxHP-20; got != want {
		t.Fatalf("expected HP=%d after heal, got %d", want, got)
	}
	p.Heal(MaxHP)
	if p.HP != MaxHP {
		t.Fatalf("expected heal to clamp at max HP=%d, got %d", MaxHP, p.HP)
	}
}

func TestHealIgnoresDeadPlayersAndNonPositiveAmounts(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.Heal(0)
	p.Heal(-5)
	if p.HP != MaxHP {
		t.Fatalf("expected non-positive heal to be ignored, got %d", p.HP)
	}
	p.TakeDamage(MaxHP)
	p.Heal(10)
	if p.HP != 0 {
		t.Fatalf("expected dead player heal to be ignored, got %d", p.HP)
	}
}

func TestIsProtected(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 200, 200)
	if !p.IsProtected(200, 200, 150) {
		t.Fatal("expected protection right after spawn")
	}

	p.Update(SafeZoneDuration+50*time.Millisecond, 1)
	if p.IsProtected(200, 200, 150) {
		t.Fatal("expected protection to expire")
	}
}

func TestRespawnRestoresState(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.TakeDamage(MaxHP)
	p.ApplyBurning(BurningTicks)
	p.Respawn(50, 50)
	if p.HP != MaxHP || p.State != StateIdle || p.X != 50 || p.Y != 50 {
		t.Fatalf("respawn state unexpected: %+v", p)
	}
	if p.burning.TicksRemaining != 0 {
		t.Fatal("expected burning cleared on respawn")
	}
}

func TestSuspendForDisconnectClearsTransientState(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.ApplyInput(Input{Seq: 5, Right: true, Attack: true})
	p.Update(10*time.Millisecond, 1)
	p.SuspendForDisconnect()
	if p.LastProcessedInputSeq != -1 {
		t.Fatalf("expected last seq reset, got %d", p.LastProcessedInputSeq)
	}
	if p.State != StateIdle {
		t.Fatalf("expected idle, got %s", p.State)
	}
}

func TestApplyBurningTakesDamageOverTimeAndKills(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.HP = BurningTickDamage * BurningTicks
	p.ApplyBurning(BurningTicks)
	p.Update(BurningTickInterval*time.Duration(BurningTicks)+10*time.Millisecond, 1)
	if p.State != StateDead {
		t.Fatalf("expected dead from burning, got %s (hp=%d)", p.State, p.HP)
	}
	if p.burning.TicksRemaining != 0 || p.purpleBurning.TicksRemaining != 0 || p.blueBurning.TicksRemaining != 0 {
		t.Fatal("expected all burning cleared on death")
	}
}

func TestApplyDoTNoOpForDeadOrZero(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.ApplyBurning(0)
	if p.burning.TicksRemaining != 0 {
		t.Fatal("expected zero ticks ignored")
	}

	p.TakeDamage(MaxHP)
	p.ApplyBurning(BurningTicks)
	p.ApplyPurpleBurning(BurningTicks)
	p.ApplyBlueBurning(BurningTicks)
	if p.burning.TicksRemaining != 0 {
		t.Fatal("expected dead player to ignore burning")
	}
}

func TestMarkPhaseTransferCooldownUsesMax(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.MarkPhaseTransferCooldown(200 * time.Millisecond)
	p.MarkPhaseTransferCooldown(50 * time.Millisecond)
	if p.PhaseTransferCooldown != 200*time.Millisecond {
		t.Fatalf("expected 200ms cooldown, got %s", p.PhaseTransferCooldown)
	}

	p.Update(220*time.Millisecond, 1)
	if p.PhaseTransferCooldown != 0 {
		t.Fatalf("expected cooldown drained, got %s", p.PhaseTransferCooldown)
	}
}

func TestToastyTriggersOncePerCast(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	firstCastID := p.beginCast()
	for i := 0; i < world.ToastyKillThreshold; i += 1 {
		p.RecordMonsterKillInCast(firstCastID)
	}
	if p.ToastyCount != 1 {
		t.Fatalf("expected toasty count=1, got %d", p.ToastyCount)
	}

	p.RecordMonsterKillInCast(firstCastID)
	if p.ToastyCount != 1 {
		t.Fatal("expected toasty to fire only once per cast")
	}
	p.FinishCast(firstCastID)

	secondCastID := p.beginCast()
	for i := 0; i < world.ToastyKillThreshold; i += 1 {
		p.RecordMonsterKillInCast(secondCastID)
	}
	if p.ToastyCount != 2 {
		t.Fatalf("expected second cast to award another toasty, got %d", p.ToastyCount)
	}
}

func TestSnapshotProjectsStatusEffects(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 12.34, 56.78)
	p.ApplyBurning(BurningTicks)
	p.ApplyPurpleBurning(BurningTicks)
	p.ApplyBlueBurning(BurningTicks)
	snap := p.Snapshot()

	if math.Abs(snap.X-12.3) > 1e-9 || math.Abs(snap.Y-56.8) > 1e-9 {
		t.Fatalf("expected quantized position, got (%v, %v)", snap.X, snap.Y)
	}
	if len(snap.StatusEffects) != 3 {
		t.Fatalf("expected 3 effects, got %d", len(snap.StatusEffects))
	}
	if snap.StatusEffects[StatusBurning].TicksRemaining != BurningTicks {
		t.Fatal("burning ticks mismatch")
	}
	if snap.EquippedWeapon != WeaponKindPistol {
		t.Fatalf("expected snapshot equipped weapon %q, got %q", WeaponKindPistol, snap.EquippedWeapon)
	}
}

func TestInputDirectionPriority(t *testing.T) {
	t.Parallel()

	cases := []struct {
		input    Input
		expected world.Direction
	}{
		{Input{Right: true}, world.DirectionRight},
		{Input{Left: true}, world.DirectionLeft},
		{Input{Up: true}, world.DirectionUp},
		{Input{Down: true}, world.DirectionDown},
		{Input{Right: true, Down: true, Left: true}, world.DirectionDown},
		{Input{}, ""},
	}
	for _, tc := range cases {
		if got := tc.input.Direction(); got != tc.expected {
			t.Fatalf("Input(%+v).Direction()=%s, want %s", tc.input, got, tc.expected)
		}
	}
}

func TestUpdateIgnoresNonPositiveSpeedMultiplier(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.ApplyInput(Input{Seq: 1, Right: true})
	p.Update(time.Second, 0)
	if math.Abs(p.X-Speed) > 1e-9 {
		t.Fatalf("expected default multiplier=1, got %v", p.X)
	}
}

func TestUpdateDeadPlayerOnlyAdvancesTimers(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.TakeDamage(MaxHP)
	p.ApplyInput(Input{Seq: 1, Right: true})
	p.Update(time.Second, 1)
	if p.X != 0 {
		t.Fatal("dead players must not move")
	}
}
