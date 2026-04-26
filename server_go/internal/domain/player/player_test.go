package player

import (
	"math"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/world"
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

func TestUpdateAttackEntersStateAndConsumesCooldown(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.ApplyInput(Input{Seq: 1, Attack: true})
	p.Update(10*time.Millisecond, 1)
	if p.State != StateAttacking {
		t.Fatalf("expected attacking, got %s", p.State)
	}

	p.ApplyInput(Input{Seq: 2, Attack: true})
	p.Update(10*time.Millisecond, 1)
	if p.AttackCooldown <= 0 {
		t.Fatal("expected cooldown to be active")
	}

	p.ApplyInput(Input{Seq: 3})
	p.Update(AttackStateDuration+50*time.Millisecond, 1)
	if p.State != StateIdle {
		t.Fatalf("expected idle after attack, got %s", p.State)
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

func TestToastyTriggersOncePerSwing(t *testing.T) {
	t.Parallel()

	p := New("p1", "Link", 0, 0)
	p.RecordMonsterKillInCurrentAttack()
	if p.AttackMonsterKills != 0 {
		t.Fatal("expected idle player to skip kill record")
	}

	p.ApplyInput(Input{Seq: 1, Attack: true})
	p.Update(10*time.Millisecond, 1)
	for i := 0; i < world.ToastyKillThreshold; i += 1 {
		p.RecordMonsterKillInCurrentAttack()
	}
	if p.ToastyCount != 1 {
		t.Fatalf("expected toasty count=1, got %d", p.ToastyCount)
	}

	p.RecordMonsterKillInCurrentAttack()
	if p.ToastyCount != 1 {
		t.Fatal("expected toasty to fire only once per swing")
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
