package boss

import (
	"math"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/hazard"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/physics"
)

// Vanessa the Ruthless constants.
const (
	VanessaMaxHP                     = 175
	VanessaSpeed             float64 = 90
	VanessaDamage                    = 12
	VanessaAggroRadius       float64 = 760
	VanessaContactRadius     float64 = 44
	VanessaContactCD                 = 1000 * time.Millisecond
	VanessaRespawn                   = 15 * time.Second
	VanessaAttackCD                  = 2300 * time.Millisecond
	VanessaReacquireInterval         = 250 * time.Millisecond
	VanessaSpeechInterval            = 30 * time.Second
	VanessaSpeechDuration            = 5 * time.Second
)

const vanessaSpeechText = "kill me and you are fired, better run till you get tired."
const VanessaSpeechColor = "#ff3b30"

var vanessaFirePalette = [...]uint32{
	0xff5a36,
	0xffb347,
	0xffe066,
	0xff4fd8,
	0xc36bff,
	0x7dff7d,
}

// VanessaTheRuthless is the static phase-4 boss.
type VanessaTheRuthless struct {
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
	SpeechCD          time.Duration
	SpeechTimer       time.Duration
	attackPattern     int
	colorIndex        int
	contactCDByPlayer map[string]time.Duration
}

// NewVanessaTheRuthless constructs Vanessa at (x, y).
func NewVanessaTheRuthless(id string, x, y float64) *VanessaTheRuthless {
	return &VanessaTheRuthless{
		ID: id, X: x, Y: y, SpawnX: x, SpawnY: y,
		HP: VanessaMaxHP, MaxHP: VanessaMaxHP,
		Speed: VanessaSpeed, Damage: VanessaDamage,
		State: StateIdle, Phase: 4,
		SpeechCD:          VanessaSpeechInterval,
		contactCDByPlayer: make(map[string]time.Duration),
	}
}

// Reset returns Vanessa to her initial state.
func (v *VanessaTheRuthless) Reset() {
	v.X, v.Y = v.SpawnX, v.SpawnY
	v.HP = v.MaxHP
	v.State = StateIdle
	v.TargetID = ""
	v.AttackCD = 0
	v.ReacquireCD = 0
	v.RespawnTimer = 0
	v.SpeechCD = VanessaSpeechInterval
	v.SpeechTimer = 0
	v.attackPattern = 0
	v.contactCDByPlayer = make(map[string]time.Duration)
}

// Update advances Vanessa for dt.
func (v *VanessaTheRuthless) Update(
	dt time.Duration,
	players []PlayerView,
	fire SpawnFireLine,
	burst SpawnFireBurst,
	find FindNearestPlayer,
) {
	for id, cd := range v.contactCDByPlayer {
		cd -= dt
		if cd <= 0 {
			delete(v.contactCDByPlayer, id)
		} else {
			v.contactCDByPlayer[id] = cd
		}
	}
	if v.State == StateDead {
		return
	}
	if v.AttackCD > 0 {
		v.AttackCD -= dt
	}
	v.ReacquireCD -= dt
	v.SpeechCD -= dt
	v.SpeechTimer -= dt
	if v.SpeechCD <= 0 {
		v.SpeechTimer = VanessaSpeechDuration
		v.SpeechCD = VanessaSpeechInterval
	}
	if v.SpeechTimer < 0 {
		v.SpeechTimer = 0
	}
	if v.ReacquireCD <= 0 {
		v.ReacquireCD = VanessaReacquireInterval
		if t := nearestAlive(players, v.X, v.Y, VanessaAggroRadius, find); t != nil {
			v.TargetID = t.ID
		} else {
			v.TargetID = ""
		}
	}

	target := lookup(players, v.TargetID)
	if target == nil {
		v.State = StateIdle
		return
	}

	dx := target.X - v.X
	dy := target.Y - v.Y
	length := math.Hypot(dx, dy)
	if length > 0 {
		step := math.Min(v.Speed*dt.Seconds(), length)
		v.X += (dx / length) * step
		v.Y += (dy / length) * step
	}
	v.State = StateChasing

	if v.AttackCD <= 0 {
		if v.performAttack(*target, fire, burst) {
			v.AttackCD = VanessaAttackCD
			v.State = StateAttacking
			v.attackPattern = (v.attackPattern + 1) % 4
		}
	}
}

func (v *VanessaTheRuthless) performAttack(target PlayerView, fire SpawnFireLine, burst SpawnFireBurst) bool {
	switch v.attackPattern {
	case 0:
		if fire == nil {
			return false
		}
		tint := v.nextTint()
		fire(v.X, v.Y, 1, 0, hazard.KindFireField, tint)
		fire(v.X, v.Y, -1, 0, hazard.KindFireField, tint)
		return true
	case 1:
		if fire == nil {
			return false
		}
		tint := v.nextTint()
		fire(v.X, v.Y, 0, 1, hazard.KindFireField, tint)
		fire(v.X, v.Y, 0, -1, hazard.KindFireField, tint)
		return true
	case 2:
		if fire == nil {
			return false
		}
		tint := v.nextTint()
		fire(v.X, v.Y, 1, 1, hazard.KindFireField, tint)
		fire(v.X, v.Y, 1, -1, hazard.KindFireField, tint)
		fire(v.X, v.Y, -1, 1, hazard.KindFireField, tint)
		fire(v.X, v.Y, -1, -1, hazard.KindFireField, tint)
		return true
	default:
		if burst == nil {
			return false
		}
		burst(target.X, target.Y, hazard.KindFireField, v.nextBurstPalette())
		return true
	}
}

func (v *VanessaTheRuthless) nextTint() uint32 {
	tint := vanessaFirePalette[v.colorIndex%len(vanessaFirePalette)]
	v.colorIndex++
	return tint
}

func (v *VanessaTheRuthless) nextBurstPalette() []uint32 {
	out := make([]uint32, 0, len(vanessaFirePalette))
	for i := 0; i < len(vanessaFirePalette); i++ {
		out = append(out, vanessaFirePalette[(v.colorIndex+i)%len(vanessaFirePalette)])
	}
	v.colorIndex++
	return out
}

// Speech returns the active speech bubble content when visible.
func (v *VanessaTheRuthless) Speech() (string, string, bool) {
	if v.State == StateDead || v.SpeechTimer <= 0 {
		return "", "", false
	}
	return vanessaSpeechText, VanessaSpeechColor, true
}

// CanDealContactDamageTo reports whether Vanessa can damage playerID by touch.
func (v *VanessaTheRuthless) CanDealContactDamageTo(playerID string) bool {
	_, blocked := v.contactCDByPlayer[playerID]
	return !blocked
}

// MarkContactDamageDealt arms Vanessa's per-player contact cooldown.
func (v *VanessaTheRuthless) MarkContactDamageDealt(playerID string) {
	v.contactCDByPlayer[playerID] = VanessaContactCD
}

// TakeDamage applies amount of damage.
func (v *VanessaTheRuthless) TakeDamage(amount int) {
	if amount <= 0 || v.State == StateDead {
		return
	}
	v.HP -= amount
	if v.HP <= 0 {
		v.HP = 0
		v.State = StateDead
		v.TargetID = ""
		v.SpeechTimer = 0
		v.contactCDByPlayer = make(map[string]time.Duration)
		v.RespawnTimer = VanessaRespawn
	}
}

// TryRespawn restores Vanessa when the timer elapses.
func (v *VanessaTheRuthless) TryRespawn(dt time.Duration) bool {
	if v.State != StateDead {
		return false
	}
	v.RespawnTimer -= dt
	if v.RespawnTimer > 0 {
		return false
	}
	v.Reset()
	return true
}

// Snapshot returns the wire projection.
func (v *VanessaTheRuthless) Snapshot() Snapshot {
	return Snapshot{
		ID: v.ID, Kind: KindVanessaTheRuthless,
		X: physics.QuantizePosition(v.X), Y: physics.QuantizePosition(v.Y),
		HP: v.HP, MaxHP: v.MaxHP, State: v.State, Phase: v.Phase,
	}
}

// ContactRadius returns Vanessa's collision radius.
func (v *VanessaTheRuthless) ContactRadius() float64 { return VanessaContactRadius }

// Kind returns Vanessa's boss kind.
func (v *VanessaTheRuthless) Kind() Kind { return KindVanessaTheRuthless }
