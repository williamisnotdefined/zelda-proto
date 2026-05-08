package boss

import (
	"math"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/hazard"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
)

// DragonLord constants.
const (
	DragonLordMaxHP                 = 175
	DragonLordSpeed         float64 = 80
	DragonLordDamage                = 5
	DragonLordAggroRadius   float64 = 700
	DragonLordContactRadius float64 = 48
	DragonLordContactCD             = 1000 * time.Millisecond
	DragonLordRespawnTime           = 15 * time.Second
	DragonLordAttackCD              = 2500 * time.Millisecond
	DragonAxisHysteresis    float64 = 18
	DragonReacquireInterval         = 250 * time.Millisecond
	DragonFireDiagThreshold float64 = 0.82
)

// DragonLord is the phase-2 mini-boss aggregate.
type DragonLord struct {
	ID                string
	X, Y              float64
	SpawnX, SpawnY    float64
	HP                int
	MaxHP             int
	Speed             float64
	Damage            int
	State             State
	Phase             int
	TargetID          string
	AttackCD          time.Duration
	ReacquireCD       time.Duration
	RespawnTimer      time.Duration
	moveAxis          string
	contactCDByPlayer map[string]time.Duration
	flameKind         hazard.Kind
	kind              Kind
}

// NewDragonLord constructs a dragon at (x, y).
func NewDragonLord(id string, x, y float64) *DragonLord {
	return &DragonLord{
		ID: id, X: x, Y: y, SpawnX: x, SpawnY: y,
		HP: DragonLordMaxHP, MaxHP: DragonLordMaxHP,
		Speed: DragonLordSpeed, Damage: DragonLordDamage,
		State: StateIdle, Phase: 1, moveAxis: "x",
		contactCDByPlayer: make(map[string]time.Duration),
		flameKind:         hazard.KindFireField,
		kind:              KindDragonLord,
	}
}

// NewPhase3Boss constructs a phase-3 entry boss.
func NewPhase3Boss(id string, x, y float64, kind Kind) *DragonLord {
	d := NewDragonLord(id, x, y)
	d.Speed = 70
	d.Damage = DragonLordDamage + 10
	d.Phase = 3
	d.kind = kind
	switch kind {
	case KindSlimMaioli:
		d.flameKind = hazard.KindPurpleField
	case KindFranklyStein:
		d.flameKind = hazard.KindBlueFlame
	default:
		d.flameKind = hazard.KindFireField
	}
	return d
}

// Update advances the dragon AI.
func (d *DragonLord) Update(dt time.Duration, players []PlayerView, fire SpawnFireLine, find FindNearestPlayer) {
	for id, cd := range d.contactCDByPlayer {
		cd -= dt
		if cd <= 0 {
			delete(d.contactCDByPlayer, id)
		} else {
			d.contactCDByPlayer[id] = cd
		}
	}
	if d.State == StateDead {
		return
	}
	if d.AttackCD > 0 {
		d.AttackCD -= dt
	}
	d.ReacquireCD -= dt
	if d.ReacquireCD <= 0 {
		d.ReacquireCD = DragonReacquireInterval
		if t := nearestAlive(players, d.X, d.Y, DragonLordAggroRadius, find); t != nil {
			d.TargetID = t.ID
		} else {
			d.TargetID = ""
		}
	}

	target := lookup(players, d.TargetID)
	if target == nil {
		d.State = StateIdle
		return
	}

	dx := target.X - d.X
	dy := target.Y - d.Y
	absDX, absDY := math.Abs(dx), math.Abs(dy)
	if math.Abs(absDX-absDY) > DragonAxisHysteresis {
		if absDX > absDY {
			d.moveAxis = "x"
		} else {
			d.moveAxis = "y"
		}
	}
	step := d.Speed * dt.Seconds()
	if d.moveAxis == "x" {
		d.X += sign(dx) * step
	} else {
		d.Y += sign(dy) * step
	}
	d.State = StateChasing

	if d.AttackCD <= 0 && fire != nil {
		dirX, dirY := d.fireDirection(dx, dy, absDX, absDY)
		if dirX != 0 || dirY != 0 {
			fire(d.X, d.Y, dirX, dirY, d.flameKind, 0)
			d.AttackCD = DragonLordAttackCD
			d.State = StateAttacking
		}
	}
}

func (d *DragonLord) fireDirection(dx, dy, absDX, absDY float64) (float64, float64) {
	if absDX == 0 && absDY == 0 {
		if d.moveAxis == "x" {
			return 1, 0
		}
		return 0, 1
	}
	larger := math.Max(absDX, absDY)
	smaller := math.Min(absDX, absDY)
	if larger > 0 && smaller/larger >= DragonFireDiagThreshold {
		return sign(dx), sign(dy)
	}
	if absDX >= absDY {
		return sign(dx), 0
	}
	return 0, sign(dy)
}

// CanDealContactDamageTo reports whether the dragon's per-player cooldown is
// expired for playerID.
func (d *DragonLord) CanDealContactDamageTo(playerID string) bool {
	_, blocked := d.contactCDByPlayer[playerID]
	return !blocked
}

// MarkContactDamageDealt arms the per-player cooldown.
func (d *DragonLord) MarkContactDamageDealt(playerID string) {
	d.contactCDByPlayer[playerID] = DragonLordContactCD
}

// TakeDamage applies amount.
func (d *DragonLord) TakeDamage(amount int) {
	if amount <= 0 || d.State == StateDead {
		return
	}
	d.HP -= amount
	if d.HP <= 0 {
		d.HP = 0
		d.State = StateDead
		d.TargetID = ""
		d.contactCDByPlayer = make(map[string]time.Duration)
		d.RespawnTimer = DragonLordRespawnTime
	}
}

// TryRespawn restores the dragon when its timer elapses.
func (d *DragonLord) TryRespawn(dt time.Duration) bool {
	if d.State != StateDead {
		return false
	}
	d.RespawnTimer -= dt
	if d.RespawnTimer > 0 {
		return false
	}
	d.X, d.Y = d.SpawnX, d.SpawnY
	d.HP = d.MaxHP
	d.State = StateIdle
	d.contactCDByPlayer = make(map[string]time.Duration)
	d.TargetID = ""
	return true
}

// Snapshot returns the wire projection.
func (d *DragonLord) Snapshot() Snapshot {
	return Snapshot{
		ID: d.ID, Kind: d.kind,
		X: physics.QuantizePosition(d.X), Y: physics.QuantizePosition(d.Y),
		HP: d.HP, MaxHP: d.MaxHP, State: d.State, Phase: d.Phase,
	}
}

// ContactRadius returns the boss collision radius.
func (d *DragonLord) ContactRadius() float64 { return DragonLordContactRadius }

// Kind returns the boss variant identifier (DragonLord or one of the Phase 3
// kinds when constructed via NewPhase3Boss).
func (d *DragonLord) Kind() Kind { return d.kind }

// TargetPosition returns the last known coordinates of the dragon's current
// target, or (0, 0, false) when no target is acquired.
func (d *DragonLord) TargetPosition(players []PlayerView) (float64, float64, bool) {
	if d.TargetID == "" {
		return 0, 0, false
	}
	for i := range players {
		if players[i].ID == d.TargetID {
			return players[i].X, players[i].Y, true
		}
	}
	return 0, 0, false
}

func lookup(players []PlayerView, id string) *PlayerView {
	if id == "" {
		return nil
	}
	for i := range players {
		if players[i].ID == id && players[i].Alive {
			return &players[i]
		}
	}
	return nil
}
