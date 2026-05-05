// Package player models the Player aggregate: state machine, combat input,
// status effects, and snapshot projection.
package player

import (
	"math"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

// Combat and movement constants. Shared values mirror
// client/src/game-core/player.ts.
const (
	Speed                 float64 = 150
	MaxHP                         = 100
	MeleeDamage                   = 10
	FireballDamage                = 20
	LandmineDamage                = 20
	GrenadeDamage                 = 20
	WaveDamage                    = 3
	WaveLifeStealRatio    float64 = 0.20
	WaveWindup                    = 80 * time.Millisecond
	WaveWindupRadius      float64 = 44
	DashDistance          float64 = 300
	DashPushDistance      float64 = 300
	DashHalfWidth         float64 = 36
	AttackCooldown                = 400 * time.Millisecond
	WaveCooldown                  = 500 * time.Millisecond
	DashCooldown                  = 1 * time.Second
	FireballCooldown              = 400 * time.Millisecond
	GrenadeCooldown               = 3 * time.Second
	LandmineCooldown              = 3 * time.Second
	AttackStateDuration           = 300 * time.Millisecond
	AttackSpeedPenalty    float64 = 0.5
	WaveMaxRadius         float64 = 150
	WaveSpeed             float64 = 900
	FireballSpeed         float64 = 900
	GrenadeDistance       float64 = 150
	GrenadeFlightDuration         = 300 * time.Millisecond
	LandmineSpawnOffset   float64 = 34
	Width                         = 48
	Height                        = 48
	AttackRangeUp         float64 = 40
	AttackRangeDown       float64 = 56
	AttackRangeLeft       float64 = 48
	AttackRangeRight      float64 = 48
	AttackWidth                   = 72
	PvPDamage                     = 25
	SafeZoneDuration              = 3000 * time.Millisecond
	BurningTickDamage             = 8
	BurningTicks                  = 3
	BurningTickInterval           = 1000 * time.Millisecond
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
	Seq      int64
	Up       bool
	Down     bool
	Left     bool
	Right    bool
	Attack   bool
	Wave     bool
	Dash     bool
	Fireball bool
	Grenade  bool
	Landmine bool
}

// WaveExpandDuration returns how long the player wave spends expanding from
// zero to max radius.
func WaveExpandDuration() time.Duration {
	second := float64(time.Second)
	return time.Duration(second * WaveMaxRadius / WaveSpeed)
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

// Status effect identifiers mirror client/src/shared/types.ts.
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

// WaveIndicator is the active player wave visual state.
type WaveIndicator struct {
	X, Y   float64
	Radius float64
	State  WaveState
}

// WaveState is the current phase of the player wave visual.
type WaveState string

// Player-wave phases mirrored by the client wave indicator.
const (
	WaveStateWindup    WaveState = "windup"
	WaveStateExpanding WaveState = "expanding"
)

// WaveTargets stores the hostile IDs locked by a player wave at cast time.
type WaveTargets struct {
	EnemyIDs   []string
	DragonIDs  []string
	GelehkIDs  []string
	VanessaIDs []string
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

	AttackCooldown        time.Duration
	AttackState           time.Duration
	WaveCooldown          time.Duration
	DashCooldown          time.Duration
	FireballCooldown      time.Duration
	GrenadeCooldown       time.Duration
	LandmineCooldown      time.Duration
	AttackHitEnemyIDs     map[string]struct{}
	AttackHitPlayerIDs    map[string]struct{}
	AttackMonsterKills    int
	ToastyTriggered       bool
	ToastyCount           int
	PlayerKills           int
	MonsterKills          int
	Deaths                int
	SafeZoneTimer         time.Duration
	RespawnTimer          time.Duration
	PhaseTransferCooldown time.Duration

	LastProcessedInputSeq int64
	lastReceivedInputSeq  int64
	pendingInput          *Input
	waveActive            bool
	waveStartQueued       bool
	waveReleaseQueued     bool
	waveWindupRemaining   time.Duration
	waveRadius            float64
	waveCenterX           float64
	waveCenterY           float64
	waveTargets           WaveTargets
	dashCastQueued        bool
	dashStartX            float64
	dashStartY            float64
	dashDirection         world.Direction
	fireballCastQueued    bool
	fireballStartX        float64
	fireballStartY        float64
	fireballDirection     world.Direction
	grenadeCastQueued     bool
	grenadeStartX         float64
	grenadeStartY         float64
	grenadeDirection      world.Direction
	landmineCastQueued    bool
	landmineStartX        float64
	landmineStartY        float64
	landmineDirection     world.Direction

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
	defer p.advanceWave(dt)

	if p.AttackCooldown > 0 {
		p.AttackCooldown -= dt
		if p.AttackCooldown < 0 {
			p.AttackCooldown = 0
		}
	}
	if p.WaveCooldown > 0 {
		p.WaveCooldown -= dt
		if p.WaveCooldown < 0 {
			p.WaveCooldown = 0
		}
	}
	if p.DashCooldown > 0 {
		p.DashCooldown -= dt
		if p.DashCooldown < 0 {
			p.DashCooldown = 0
		}
	}
	if p.FireballCooldown > 0 {
		p.FireballCooldown -= dt
		if p.FireballCooldown < 0 {
			p.FireballCooldown = 0
		}
	}
	if p.GrenadeCooldown > 0 {
		p.GrenadeCooldown -= dt
		if p.GrenadeCooldown < 0 {
			p.GrenadeCooldown = 0
		}
	}
	if p.LandmineCooldown > 0 {
		p.LandmineCooldown -= dt
		if p.LandmineCooldown < 0 {
			p.LandmineCooldown = 0
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
	if input.Wave && p.WaveCooldown <= 0 {
		p.WaveCooldown = WaveCooldown
		p.waveActive = true
		p.waveStartQueued = true
		p.waveReleaseQueued = false
		p.waveWindupRemaining = WaveWindup
		p.waveRadius = 0
		p.waveCenterX = p.X
		p.waveCenterY = p.Y
		p.waveTargets = WaveTargets{}
	}
	if input.Fireball && p.FireballCooldown <= 0 {
		if fireballDirection := dashDirectionFromInput(input, p.Direction); fireballDirection != "" {
			p.FireballCooldown = FireballCooldown
			p.fireballCastQueued = true
			p.fireballStartX = p.X
			p.fireballStartY = p.Y
			p.fireballDirection = fireballDirection
		}
	}
	if input.Grenade && p.GrenadeCooldown <= 0 {
		if grenadeDirection := dashDirectionFromInput(input, p.Direction); grenadeDirection != "" {
			p.GrenadeCooldown = GrenadeCooldown
			p.grenadeCastQueued = true
			p.grenadeStartX = p.X
			p.grenadeStartY = p.Y
			p.grenadeDirection = grenadeDirection
		}
	}
	if input.Landmine && p.LandmineCooldown <= 0 {
		if landmineDirection := dashDirectionFromInput(input, p.Direction); landmineDirection != "" {
			p.LandmineCooldown = LandmineCooldown
			p.landmineCastQueued = true
			p.landmineStartX = p.X
			p.landmineStartY = p.Y
			p.landmineDirection = landmineDirection
		}
	}
	triggeredDash := false
	if input.Dash && p.DashCooldown <= 0 {
		if dashDirection := dashDirectionFromInput(input, p.Direction); dashDirection != "" {
			p.DashCooldown = DashCooldown
			p.dashCastQueued = true
			p.dashStartX = p.X
			p.dashStartY = p.Y
			p.dashDirection = dashDirection
			p.Direction = dashDirection
			triggeredDash = true
		}
	}
	if triggeredDash {
		if p.State != StateAttacking {
			p.transition(StateMoving)
		}
		return
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
		p.resetWave()
		p.resetDash()
		p.resetFireball()
		p.resetGrenade()
		p.transition(StateDead)
		p.Deaths += 1
	}
}

// Heal restores HP without reviving dead players.
func (p *Player) Heal(amount int) {
	if p.State == StateDead || amount <= 0 {
		return
	}
	p.HP += amount
	if p.HP > p.MaxHP {
		p.HP = p.MaxHP
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
	p.resetWave()
	p.resetDash()
	p.resetFireball()
	p.resetGrenade()
}

// SuspendForDisconnect resets transient combat state when a player goes idle
// after a disconnect, preserving cumulative stats for resume.
func (p *Player) SuspendForDisconnect() {
	p.pendingInput = nil
	p.LastProcessedInputSeq = -1
	p.lastReceivedInputSeq = -1
	p.resetWave()
	p.resetDash()
	p.resetFireball()
	p.resetGrenade()
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

// ConsumeWaveStart returns the center of a newly triggered wave once so the
// world can pre-lock affected hostiles before AI movement runs.
func (p *Player) ConsumeWaveStart() (float64, float64, bool) {
	if !p.waveStartQueued {
		return 0, 0, false
	}
	p.waveStartQueued = false
	return p.waveCenterX, p.waveCenterY, true
}

// SetWaveTargets stores the hostile IDs captured when the wave started.
func (p *Player) SetWaveTargets(targets WaveTargets) {
	p.waveTargets = targets
}

// ConsumeWaveRelease returns the center and captured hostiles of a completed
// player wave once.
func (p *Player) ConsumeWaveRelease() (float64, float64, WaveTargets, bool) {
	if !p.waveReleaseQueued {
		return 0, 0, WaveTargets{}, false
	}
	p.waveReleaseQueued = false
	targets := p.waveTargets
	p.waveTargets = WaveTargets{}
	return p.waveCenterX, p.waveCenterY, targets, true
}

// WaveRemainingDuration returns how long the current wave will keep hostiles
// frozen before it releases.
func (p *Player) WaveRemainingDuration() time.Duration {
	if !p.waveActive {
		return 0
	}
	remainingRadius := math.Max(0, WaveMaxRadius-p.waveRadius)
	expandRemaining := time.Duration(float64(time.Second) * remainingRadius / WaveSpeed)
	return p.waveWindupRemaining + expandRemaining
}

// ConsumeDashCast returns a newly triggered dash once.
func (p *Player) ConsumeDashCast() (float64, float64, world.Direction, bool) {
	if !p.dashCastQueued {
		return 0, 0, "", false
	}
	p.dashCastQueued = false
	return p.dashStartX, p.dashStartY, p.dashDirection, true
}

// ConsumeFireballCast returns a newly triggered fireball once.
func (p *Player) ConsumeFireballCast() (float64, float64, world.Direction, bool) {
	if !p.fireballCastQueued {
		return 0, 0, "", false
	}
	p.fireballCastQueued = false
	return p.fireballStartX, p.fireballStartY, p.fireballDirection, true
}

// ConsumeGrenadeCast returns a newly triggered grenade once.
func (p *Player) ConsumeGrenadeCast() (float64, float64, world.Direction, bool) {
	if !p.grenadeCastQueued {
		return 0, 0, "", false
	}
	p.grenadeCastQueued = false
	return p.grenadeStartX, p.grenadeStartY, p.grenadeDirection, true
}

// ConsumeLandmineCast returns a newly triggered landmine once.
func (p *Player) ConsumeLandmineCast() (float64, float64, world.Direction, bool) {
	if !p.landmineCastQueued {
		return 0, 0, "", false
	}
	p.landmineCastQueued = false
	return p.landmineStartX, p.landmineStartY, p.landmineDirection, true
}

// WaveIndicator returns the active player wave visual, if any.
func (p *Player) WaveIndicator() *WaveIndicator {
	if !p.waveActive {
		return nil
	}
	if p.waveWindupRemaining > 0 {
		return &WaveIndicator{X: p.waveCenterX, Y: p.waveCenterY, Radius: WaveWindupRadius, State: WaveStateWindup}
	}
	return &WaveIndicator{X: p.waveCenterX, Y: p.waveCenterY, Radius: p.waveRadius, State: WaveStateExpanding}
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

func (p *Player) advanceWave(dt time.Duration) {
	if !p.waveActive {
		return
	}
	remaining := dt
	if p.waveWindupRemaining > 0 {
		if remaining < p.waveWindupRemaining {
			p.waveWindupRemaining -= remaining
			return
		}
		remaining -= p.waveWindupRemaining
		p.waveWindupRemaining = 0
	}
	p.waveRadius += WaveSpeed * remaining.Seconds()
	if p.waveRadius < WaveMaxRadius {
		return
	}
	p.waveActive = false
	p.waveReleaseQueued = true
	p.waveRadius = 0
}

func (p *Player) resetWave() {
	p.WaveCooldown = 0
	p.waveActive = false
	p.waveStartQueued = false
	p.waveReleaseQueued = false
	p.waveWindupRemaining = 0
	p.waveRadius = 0
	p.waveCenterX = 0
	p.waveCenterY = 0
	p.waveTargets = WaveTargets{}
}

func (p *Player) resetDash() {
	p.DashCooldown = 0
	p.dashCastQueued = false
	p.dashStartX = 0
	p.dashStartY = 0
	p.dashDirection = ""
}

func (p *Player) resetFireball() {
	p.FireballCooldown = 0
	p.fireballCastQueued = false
	p.fireballStartX = 0
	p.fireballStartY = 0
	p.fireballDirection = ""
}

func (p *Player) resetGrenade() {
	p.GrenadeCooldown = 0
	p.grenadeCastQueued = false
	p.grenadeStartX = 0
	p.grenadeStartY = 0
	p.grenadeDirection = ""
}

func (p *Player) resetLandmine() {
	p.LandmineCooldown = 0
	p.landmineCastQueued = false
	p.landmineStartX = 0
	p.landmineStartY = 0
	p.landmineDirection = ""
}

func dashDirectionFromInput(input *Input, fallback world.Direction) world.Direction {
	if input == nil {
		return fallback
	}
	if direction := input.Direction(); direction != "" {
		return direction
	}
	return fallback
}

func (p *Player) transition(state State) {
	if p.State == state {
		return
	}
	p.State = state
}
