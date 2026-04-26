// Package player models the Player aggregate: state machine, combat input,
// status effects, and snapshot projection.
package player

import (
	"math"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/world"
)

// Combat and movement constants (mirror game-core/src/player.ts).
const (
	Speed                  float64 = 150
	MaxHP                          = 100
	MeleeDamage                    = 10
	AttackCooldown                 = 400 * time.Millisecond
	AttackStateDuration            = 300 * time.Millisecond
	AttackSpeedPenalty     float64 = 0.5
	Width                          = 48
	Height                         = 48
	AttackRangeUp          float64 = 40
	AttackRangeDown        float64 = 56
	AttackRangeLeft        float64 = 48
	AttackRangeRight       float64 = 48
	AttackWidth                    = 72
	PvPDamage                      = 25
	SafeZoneDuration               = 3000 * time.Millisecond
	BurningTickDamage              = 4
	BurningTicks                   = 3
	BurningTickInterval            = 1000 * time.Millisecond
)

// State enumerates the high-level player FSM states.
type State string

// Canonical state values.
const (
	StateIdle      State = "idle"
	StateMoving    State = "moving"
	StateAttacking State = "attacking"
	StateDead      State = "dead"
)

// Input is one client input frame (movement + attack).
type Input struct {
	Seq    int64
	Up     bool
	Down   bool
	Left   bool
	Right  bool
	Attack bool
}

// Direction returns the dominant movement direction encoded by the input,
// or an empty string when no movement is requested.
func (i Input) Direction() world.Direction {
	dx, dy := i.delta()
	if dx == 0 && dy == 0 {
		return ""
	}
	if math.Abs(dx) > math.Abs(dy) {
		if dx > 0 {
			return world.DirectionRight
		}
		return world.DirectionLeft
	}
	if dy > 0 {
		return world.DirectionDown
	}
	return world.DirectionUp
}

func (i Input) delta() (float64, float64) {
	var dx, dy float64
	if i.Left {
		dx -= 1
	}
	if i.Right {
		dx += 1
	}
	if i.Up {
		dy -= 1
	}
	if i.Down {
		dy += 1
	}
	return dx, dy
}

// MovementVector returns the displacement (dx, dy) in pixels for an input over
// duration dt at the given base speed and external speed multiplier.
func (i Input) MovementVector(dt time.Duration, speed, multiplier float64) (float64, float64) {
	dx, dy := i.delta()
	if dx == 0 && dy == 0 {
		return 0, 0
	}
	length := math.Hypot(dx, dy)
	dx /= length
	dy /= length
	seconds := dt.Seconds()
	scale := speed * multiplier * seconds
	return dx * scale, dy * scale
}

// StatusEffect identifies a damage-over-time status applied to the player.
type StatusEffect string

// Status effect identifiers, mirroring shared/src/types.ts.
const (
	StatusBurning       StatusEffect = "burning"
	StatusPurpleBurning StatusEffect = "purpleBurning"
	StatusBlueBurning   StatusEffect = "blueBurning"
)

// BurningStatus tracks an active damage-over-time effect.
type BurningStatus struct {
	TicksRemaining int
	TickTimer      time.Duration
}

// Snapshot is the projection emitted to clients per tick.
type Snapshot struct {
	ID                    string
	Nickname              string
	X                     float64
	Y                     float64
	HP                    int
	MaxHP                 int
	State                 State
	Direction             world.Direction
	PlayerKills           int
	MonsterKills          int
	Deaths                int
	ToastyCount           int
	LastProcessedInputSeq int64
	StatusEffects         map[StatusEffect]BurningSnapshot
}

// BurningSnapshot is the wire-shape for a burning status (only TicksRemaining).
type BurningSnapshot struct {
	TicksRemaining int
}

// Player is the authoritative aggregate for a connected player.
type Player struct {
	ID       string
	Nickname string
	X        float64
	Y        float64
	HP       int
	MaxHP    int
	Speed    float64

	State     State
	Direction world.Direction

	AttackCooldown      time.Duration
	AttackState         time.Duration
	AttackHitEnemyIDs   map[string]struct{}
	AttackHitPlayerIDs  map[string]struct{}
	AttackMonsterKills  int
	ToastyTriggered     bool
	ToastyCount         int
	PlayerKills         int
	MonsterKills        int
	Deaths              int
	SafeZoneTimer       time.Duration
	RespawnTimer        time.Duration
	PhaseTransferCooldown time.Duration

	LastProcessedInputSeq int64
	lastReceivedInputSeq  int64
	pendingInput          *Input

	burning       BurningStatus
	purpleBurning BurningStatus
	blueBurning   BurningStatus
}

// New returns a fresh player aggregate at (x, y).
func New(id, nickname string, x, y float64) *Player {
	return &Player{
		ID:                    id,
		Nickname:              nickname,
		X:                     x,
		Y:                     y,
		HP:                    MaxHP,
		MaxHP:                 MaxHP,
		Speed:                 Speed,
		State:                 StateIdle,
		Direction:             world.DirectionDown,
		AttackHitEnemyIDs:     make(map[string]struct{}),
		AttackHitPlayerIDs:    make(map[string]struct{}),
		SafeZoneTimer:         SafeZoneDuration,
		LastProcessedInputSeq: -1,
		lastReceivedInputSeq:  -1,
	}
}

// ApplyInput stages the latest client input. Out-of-order or duplicate seqs
// are ignored.
func (p *Player) ApplyInput(input Input) {
	if input.Seq < 0 || input.Seq <= p.lastReceivedInputSeq {
		return
	}
	p.lastReceivedInputSeq = input.Seq
	cloned := input
	p.pendingInput = &cloned
}

// Update advances the player by dt. speedMultiplier is an external (e.g.
// ice-zone) modifier applied on top of the attack-state penalty.
func (p *Player) Update(dt time.Duration, speedMultiplier float64) {
	if speedMultiplier <= 0 {
		speedMultiplier = 1
	}

	if p.PhaseTransferCooldown > 0 {
		p.PhaseTransferCooldown -= dt
		if p.PhaseTransferCooldown < 0 {
			p.PhaseTransferCooldown = 0
		}
	}

	if p.SafeZoneTimer > 0 {
		p.SafeZoneTimer -= dt
		if p.SafeZoneTimer < 0 {
			p.SafeZoneTimer = 0
		}
	}

	p.tickBurning(dt)

	if p.State == StateDead {
		return
	}

	if p.AttackCooldown > 0 {
		p.AttackCooldown -= dt
		if p.AttackCooldown < 0 {
			p.AttackCooldown = 0
		}
	}

	input := p.pendingInput
	if input == nil {
		p.transition(StateIdle)
		return
	}
	p.LastProcessedInputSeq = input.Seq

	if p.State == StateAttacking {
		p.AttackState -= dt
		if p.AttackState <= 0 {
			p.AttackState = 0
			p.transition(StateIdle)
			p.resetAttackTracking()
		}
	}

	if input.Attack && p.AttackCooldown <= 0 {
		p.transition(StateAttacking)
		p.AttackCooldown = AttackCooldown
		p.AttackState = AttackStateDuration
		p.resetAttackTracking()
	}

	if direction := input.Direction(); direction != "" {
		multiplier := speedMultiplier
		if p.State == StateAttacking {
			multiplier *= AttackSpeedPenalty
		}
		dx, dy := input.MovementVector(dt, p.Speed, multiplier)
		p.X += dx
		p.Y += dy

		if p.State != StateAttacking {
			p.Direction = direction
			p.transition(StateMoving)
		}
		return
	}

	if p.State != StateAttacking {
		p.transition(StateIdle)
	}
}

// AttackHitbox returns the AABB of the current swing or false when the player
// is not in the attacking state.
func (p *Player) AttackHitbox() (physics.AABB, bool) {
	if p.State != StateAttacking {
		return physics.AABB{}, false
	}

	hx, hy := p.X, p.Y
	switch p.Direction {
	case world.DirectionUp:
		hy -= AttackRangeUp
	case world.DirectionDown:
		hy += AttackRangeDown
	case world.DirectionLeft:
		hx -= AttackRangeLeft
	case world.DirectionRight:
		hx += AttackRangeRight
	}

	return physics.AABB{
		X: hx - AttackWidth/2,
		Y: hy - AttackWidth/2,
		W: AttackWidth,
		H: AttackWidth,
	}, true
}

// TakeDamage reduces HP and transitions to dead when HP hits zero.
func (p *Player) TakeDamage(amount int) {
	if p.State == StateDead || amount <= 0 {
		return
	}
	p.HP -= amount
	if p.HP <= 0 {
		p.HP = 0
		p.transition(StateDead)
		p.Deaths += 1
	}
}

// IsProtected reports whether the player is currently in the spawn safe zone
// and protected by the post-respawn invulnerability timer.
func (p *Player) IsProtected(spawnX, spawnY, safeRadius float64) bool {
	return p.SafeZoneTimer > 0 && physics.IsInSafeZone(p.X, p.Y, spawnX, spawnY, safeRadius)
}

// Respawn moves the player to (x, y), restores HP, and clears combat state.
func (p *Player) Respawn(x, y float64) {
	p.X = x
	p.Y = y
	p.HP = p.MaxHP
	p.transition(StateIdle)
	p.SafeZoneTimer = SafeZoneDuration
	p.RespawnTimer = 0
	p.burning = BurningStatus{}
	p.purpleBurning = BurningStatus{}
	p.blueBurning = BurningStatus{}
	p.pendingInput = nil
	p.AttackCooldown = 0
	p.AttackState = 0
	p.resetAttackTracking()
}

// SuspendForDisconnect resets transient combat state when a player goes idle
// after a disconnect, preserving cumulative stats for resume.
func (p *Player) SuspendForDisconnect() {
	p.pendingInput = nil
	p.LastProcessedInputSeq = -1
	p.lastReceivedInputSeq = -1
	if p.State != StateDead {
		p.AttackState = 0
		p.resetAttackTracking()
		p.transition(StateIdle)
	}
}

// ApplyBurning queues n burning ticks. A no-op for dead players.
func (p *Player) ApplyBurning(n int) { p.applyDoT(&p.burning, n) }

// ApplyPurpleBurning queues n purple-burning ticks. A no-op for dead players.
func (p *Player) ApplyPurpleBurning(n int) { p.applyDoT(&p.purpleBurning, n) }

// ApplyBlueBurning queues n blue-burning ticks. A no-op for dead players.
func (p *Player) ApplyBlueBurning(n int) { p.applyDoT(&p.blueBurning, n) }

// MarkPhaseTransferCooldown extends the transfer cooldown to at least d.
func (p *Player) MarkPhaseTransferCooldown(d time.Duration) {
	if d > p.PhaseTransferCooldown {
		p.PhaseTransferCooldown = d
	}
}

// RecordMonsterKillInCurrentAttack increments the per-swing kill counter,
// triggering the toasty bonus once per swing when the threshold is reached.
func (p *Player) RecordMonsterKillInCurrentAttack() {
	if p.State != StateAttacking {
		return
	}
	p.AttackMonsterKills += 1
	if !p.ToastyTriggered && p.AttackMonsterKills >= world.ToastyKillThreshold {
		p.ToastyTriggered = true
		p.ToastyCount += 1
	}
}

// Snapshot returns the wire projection for this player.
func (p *Player) Snapshot() Snapshot {
	effects := map[StatusEffect]BurningSnapshot{}
	if p.burning.TicksRemaining > 0 {
		effects[StatusBurning] = BurningSnapshot{TicksRemaining: p.burning.TicksRemaining}
	}
	if p.purpleBurning.TicksRemaining > 0 {
		effects[StatusPurpleBurning] = BurningSnapshot{TicksRemaining: p.purpleBurning.TicksRemaining}
	}
	if p.blueBurning.TicksRemaining > 0 {
		effects[StatusBlueBurning] = BurningSnapshot{TicksRemaining: p.blueBurning.TicksRemaining}
	}

	return Snapshot{
		ID:                    p.ID,
		Nickname:              p.Nickname,
		X:                     physics.QuantizePosition(p.X),
		Y:                     physics.QuantizePosition(p.Y),
		HP:                    p.HP,
		MaxHP:                 p.MaxHP,
		State:                 p.State,
		Direction:             p.Direction,
		PlayerKills:           p.PlayerKills,
		MonsterKills:          p.MonsterKills,
		Deaths:                p.Deaths,
		ToastyCount:           p.ToastyCount,
		LastProcessedInputSeq: p.LastProcessedInputSeq,
		StatusEffects:         effects,
	}
}

func (p *Player) applyDoT(status *BurningStatus, n int) {
	if p.State == StateDead || n <= 0 {
		return
	}
	if n > status.TicksRemaining {
		status.TicksRemaining = n
	}
	status.TickTimer = BurningTickInterval
}

func (p *Player) tickBurning(dt time.Duration) {
	for _, status := range []*BurningStatus{&p.burning, &p.purpleBurning, &p.blueBurning} {
		if status.TicksRemaining == 0 {
			continue
		}
		status.TickTimer -= dt
		for status.TicksRemaining > 0 && status.TickTimer <= 0 {
			p.TakeDamage(BurningTickDamage)
			status.TicksRemaining -= 1
			status.TickTimer += BurningTickInterval
			if p.State == StateDead {
				p.burning = BurningStatus{}
				p.purpleBurning = BurningStatus{}
				p.blueBurning = BurningStatus{}
				return
			}
		}
	}
}

func (p *Player) resetAttackTracking() {
	for id := range p.AttackHitEnemyIDs {
		delete(p.AttackHitEnemyIDs, id)
	}
	for id := range p.AttackHitPlayerIDs {
		delete(p.AttackHitPlayerIDs, id)
	}
	p.AttackMonsterKills = 0
	p.ToastyTriggered = false
}

func (p *Player) transition(state State) {
	if p.State == state {
		return
	}
	p.State = state
}
