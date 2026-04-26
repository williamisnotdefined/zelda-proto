package boss

import (
	"math"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/physics"
)

// Gelehk constants (mirrors BossGelehk.ts).
const (
	GelehkMaxHP             = 80
	GelehkSpeed     float64 = 80
	GelehkContactR  float64 = 36
	GelehkActivateR float64 = 500
	GelehkRespawn           = 15 * time.Second

	GelehkAOERadius        float64 = 80
	GelehkAOERange         float64 = 400
	GelehkAOETelegraph             = 1000 * time.Millisecond
	GelehkChargeSpeed      float64 = 300
	GelehkChargeDamage             = 20
	GelehkChargeDuration           = 1500 * time.Millisecond
	GelehkChargeStop       float64 = 20
	GelehkWaveDamage               = 15
	GelehkWaveMaxRadius    float64 = 400
	GelehkWaveSpeed        float64 = 200
	GelehkWaveWindup               = 450 * time.Millisecond
	GelehkWaveTrailFirst   float64 = 160
	GelehkWaveTrailStep    float64 = 160
	GelehkWaveTrailPoints          = 3

	GelehkPhase1Cooldown = 3000 * time.Millisecond
	GelehkPhase2Cooldown = 2500 * time.Millisecond
	GelehkPhase3Cooldown = 2450 * time.Millisecond
	GelehkPhase2SpeedM   = 1.15
	GelehkPhase3SpeedM   = 1.3
	GelehkIceZoneSlow    = 0.4
)

// IceZone is a slowing rectangular zone created at phase-3 transition.
type IceZone struct {
	X, Y, Width, Height float64
}

// AOEIndicator is a telegraphed circular AOE.
type AOEIndicator struct {
	OwnerID string
	X, Y    float64
	Radius  float64
	Timer   time.Duration
	Hit     bool
}

// WaveState is the current life cycle of the gelehk wave.
type WaveState string

// Wave states.
const (
	WaveWindup    WaveState = "windup"
	WaveExpanding WaveState = "expanding"
)

// WaveIndicator describes the active wave.
type WaveIndicator struct {
	OwnerID string
	X, Y    float64
	Radius  float64
	State   WaveState
}

// Gelehk is the three-phase boss aggregate.
type Gelehk struct {
	ID                  string
	X, Y                float64
	SpawnX, SpawnY      float64
	HP                  int
	MaxHP               int
	Speed               float64
	State               State
	Phase               int
	Active              bool
	AttackTimer         time.Duration
	StateTimer          time.Duration
	RespawnTimer        time.Duration
	IceZones            []IceZone
	AOEIndicators       []AOEIndicator
	chargeDirX          float64
	chargeDirY          float64
	chargeRemaining     time.Duration
	chargeHitPlayers    map[string]struct{}
	waveActive          bool
	waveRadius          float64
	wavePrevRadius      float64
	waveTrailNextRadius float64
	waveHitPlayers      map[string]struct{}
}

// NewGelehk constructs the gelehk boss at (x, y).
func NewGelehk(id string, x, y float64) *Gelehk {
	return &Gelehk{
		ID: id, X: x, Y: y, SpawnX: x, SpawnY: y,
		HP: GelehkMaxHP, MaxHP: GelehkMaxHP, Speed: GelehkSpeed,
		State: StateIdle, Phase: 1,
		chargeHitPlayers: make(map[string]struct{}),
		waveHitPlayers:   make(map[string]struct{}),
	}
}

// Reset returns the boss to its initial state (used on respawn).
func (g *Gelehk) Reset() {
	g.X, g.Y = g.SpawnX, g.SpawnY
	g.HP = g.MaxHP
	g.Speed = GelehkSpeed
	g.State = StateIdle
	g.Phase = 1
	g.Active = false
	g.AttackTimer = 0
	g.StateTimer = 0
	g.IceZones = nil
	g.AOEIndicators = nil
	g.waveActive = false
	g.waveRadius = 0
	g.wavePrevRadius = 0
	g.waveTrailNextRadius = 0
	g.chargeHitPlayers = make(map[string]struct{})
	g.waveHitPlayers = make(map[string]struct{})
}

// Update advances the gelehk AI for dt.
func (g *Gelehk) Update(
	dt time.Duration,
	players []PlayerView,
	spawnMinions SpawnMinions,
	spawnPurple SpawnPurpleField,
	damage DamagePlayer,
	find FindNearestPlayer,
) {
	if g.State == StateDead {
		return
	}
	if !g.Active {
		if t := nearestAlive(players, g.X, g.Y, GelehkActivateR, find); t != nil {
			g.Active = true
		} else {
			return
		}
	}

	g.transitionPhases(spawnPurple)
	if g.AttackTimer > 0 {
		g.AttackTimer -= dt
	}
	if g.StateTimer > 0 {
		g.StateTimer -= dt
	}

	switch g.Phase {
	case 1:
		g.tickPhase1(dt, players, find)
	case 2:
		g.tickPhase2(dt, players, spawnMinions, damage, find)
	case 3:
		g.tickPhase3(dt, players, spawnPurple, damage, find)
	}
}

func (g *Gelehk) transitionPhases(spawnPurple SpawnPurpleField) {
	hpPct := float64(g.HP) / float64(g.MaxHP)
	if hpPct <= 0.2 && g.Phase < 3 {
		g.Phase = 3
		g.State = StateEnraged
		g.StateTimer = 1000 * time.Millisecond
		g.Speed = GelehkSpeed * GelehkPhase3SpeedM
		g.IceZones = []IceZone{
			{X: g.X - 120, Y: g.Y - 120, Width: 100, Height: 100},
			{X: g.X + 40, Y: g.Y - 80, Width: 120, Height: 80},
			{X: g.X - 80, Y: g.Y + 60, Width: 140, Height: 90},
		}
	} else if hpPct <= 0.5 && g.Phase < 2 {
		g.Phase = 2
		g.State = StateSpawningMinions
		g.StateTimer = 500 * time.Millisecond
		g.Speed = GelehkSpeed * GelehkPhase2SpeedM
	}
}

func (g *Gelehk) tickPhase1(dt time.Duration, players []PlayerView, find FindNearestPlayer) {
	for i := range g.AOEIndicators {
		g.AOEIndicators[i].Timer -= dt
	}
	g.AOEIndicators = filterAOE(g.AOEIndicators)

	if g.State == StateIdle && g.AttackTimer <= 0 {
		t := nearestAlive(players, g.X, g.Y, GelehkActivateR, find)
		if t == nil {
			return
		}
		dist := physics.Distance(g.X, g.Y, t.X, t.Y)
		if dist > GelehkAOERange {
			return
		}
		g.AOEIndicators = append(g.AOEIndicators, AOEIndicator{
			OwnerID: g.ID, X: t.X, Y: t.Y, Radius: GelehkAOERadius, Timer: GelehkAOETelegraph,
		})
		g.State = StateTargeting
		g.StateTimer = 500 * time.Millisecond
		g.AttackTimer = GelehkPhase1Cooldown
	} else if g.State == StateTargeting && g.StateTimer <= 0 {
		g.State = StateJumping
		g.StateTimer = 400 * time.Millisecond
	} else if g.State == StateJumping && g.StateTimer <= 0 {
		g.State = StateIdle
	}
}

func (g *Gelehk) tickPhase2(dt time.Duration, players []PlayerView, spawn SpawnMinions, damage DamagePlayer, find FindNearestPlayer) {
	if g.State == StateSpawningMinions && g.StateTimer <= 0 {
		if spawn != nil {
			spawn(g.X, g.Y, 3)
		}
		g.State = StateIdle
		g.AttackTimer = GelehkPhase2Cooldown
	}
	if g.State == StateIdle && g.AttackTimer <= 0 {
		t := nearestAlive(players, g.X, g.Y, GelehkActivateR, find)
		if t == nil {
			return
		}
		dx := t.X - g.X
		dy := t.Y - g.Y
		length := math.Hypot(dx, dy)
		if length == 0 {
			return
		}
		g.chargeDirX = dx / length
		g.chargeDirY = dy / length
		g.State = StateTargeting
		g.StateTimer = 500 * time.Millisecond
	}
	if g.State == StateTargeting && g.StateTimer <= 0 {
		g.State = StateCharging
		g.chargeRemaining = GelehkChargeDuration
		g.chargeHitPlayers = make(map[string]struct{})
	}
	if g.State == StateCharging {
		step := GelehkChargeSpeed * dt.Seconds()
		g.X += g.chargeDirX * step
		g.Y += g.chargeDirY * step
		g.chargeRemaining -= dt
		for _, p := range players {
			if !p.Alive || p.Protected {
				continue
			}
			if _, hit := g.chargeHitPlayers[p.ID]; hit {
				continue
			}
			if physics.DistanceSquared(g.X, g.Y, p.X, p.Y) <= GelehkContactR*GelehkContactR*4 {
				if damage != nil {
					damage(p.ID, GelehkChargeDamage)
				}
				g.chargeHitPlayers[p.ID] = struct{}{}
			}
		}
		if g.chargeRemaining <= 0 {
			g.State = StateIdle
			g.AttackTimer = GelehkPhase2Cooldown
		}
	}
}

func (g *Gelehk) tickPhase3(dt time.Duration, players []PlayerView, spawn SpawnPurpleField, damage DamagePlayer, find FindNearestPlayer) {
	_ = find
	if g.State == StateEnraged && g.StateTimer <= 0 {
		g.State = StateIdle
	}
	if g.waveActive {
		g.wavePrevRadius = g.waveRadius
		g.waveRadius += GelehkWaveSpeed * dt.Seconds()
		for g.waveTrailNextRadius <= g.waveRadius && g.waveTrailNextRadius <= GelehkWaveMaxRadius {
			ringIndex := int(math.Floor(g.waveTrailNextRadius / GelehkWaveTrailStep))
			angleOffset := 0.0
			if ringIndex%2 != 0 {
				angleOffset = math.Pi / float64(GelehkWaveTrailPoints)
			}
			for i := 0; i < GelehkWaveTrailPoints; i++ {
				angle := angleOffset + (math.Pi*2*float64(i))/float64(GelehkWaveTrailPoints)
				if spawn != nil {
					spawn(g.X+math.Cos(angle)*g.waveTrailNextRadius, g.Y+math.Sin(angle)*g.waveTrailNextRadius)
				}
			}
			g.waveTrailNextRadius += GelehkWaveTrailStep
		}
		for _, p := range players {
			if !p.Alive || p.Protected {
				continue
			}
			if _, hit := g.waveHitPlayers[p.ID]; hit {
				continue
			}
			d := physics.Distance(g.X, g.Y, p.X, p.Y)
			if d > g.wavePrevRadius && d <= g.waveRadius {
				if damage != nil {
					damage(p.ID, GelehkWaveDamage)
				}
				g.waveHitPlayers[p.ID] = struct{}{}
			}
		}
		if g.waveRadius >= GelehkWaveMaxRadius {
			g.waveActive = false
			g.AttackTimer = GelehkPhase3Cooldown
		}
		return
	}
	if g.State == StateIdle && g.AttackTimer <= 0 {
		g.State = StateWaveWindup
		g.StateTimer = GelehkWaveWindup
	}
	if g.State == StateWaveWindup && g.StateTimer <= 0 {
		g.waveActive = true
		g.waveRadius = 0
		g.wavePrevRadius = 0
		g.waveTrailNextRadius = GelehkWaveTrailFirst
		g.waveHitPlayers = make(map[string]struct{})
		g.State = StateIdle
	}
}

// IsInIceZone reports whether (x, y) lies in any active ice zone.
func (g *Gelehk) IsInIceZone(x, y float64) bool {
	for _, z := range g.IceZones {
		if x >= z.X && x <= z.X+z.Width && y >= z.Y && y <= z.Y+z.Height {
			return true
		}
	}
	return false
}

// WaveIndicator returns the active wave indicator, if any.
func (g *Gelehk) WaveIndicator() *WaveIndicator {
	if g.waveActive {
		return &WaveIndicator{OwnerID: g.ID, X: g.X, Y: g.Y, Radius: g.waveRadius, State: WaveExpanding}
	}
	if g.State == StateWaveWindup {
		return &WaveIndicator{OwnerID: g.ID, X: g.X, Y: g.Y, Radius: 44, State: WaveWindup}
	}
	return nil
}

// TakeDamage applies amount of damage.
func (g *Gelehk) TakeDamage(amount int) {
	if amount <= 0 || g.State == StateDead {
		return
	}
	g.HP -= amount
	if g.HP <= 0 {
		g.HP = 0
		g.State = StateDead
		g.IceZones = nil
		g.AOEIndicators = nil
		g.waveActive = false
		g.RespawnTimer = GelehkRespawn
	}
}

// TryRespawn restores the gelehk after its timer elapses.
func (g *Gelehk) TryRespawn(dt time.Duration) bool {
	if g.State != StateDead {
		return false
	}
	g.RespawnTimer -= dt
	if g.RespawnTimer > 0 {
		return false
	}
	g.Reset()
	return true
}

// Snapshot returns the wire projection.
func (g *Gelehk) Snapshot() Snapshot {
	return Snapshot{
		ID: g.ID, Kind: KindGelehk,
		X: physics.QuantizePosition(g.X), Y: physics.QuantizePosition(g.Y),
		HP: g.HP, MaxHP: g.MaxHP, State: g.State, Phase: g.Phase,
	}
}

// ContactRadius returns the gelehk collision radius.
func (g *Gelehk) ContactRadius() float64 { return GelehkContactR }

// PlayerSpeedMultiplier reports the slow factor applied when (px, py) is in
// any ice zone, or 1 otherwise.
func (g *Gelehk) PlayerSpeedMultiplier(px, py float64) float64 {
	if g.IsInIceZone(px, py) {
		return GelehkIceZoneSlow
	}
	return 1
}

func filterAOE(in []AOEIndicator) []AOEIndicator {
	out := in[:0]
	for _, a := range in {
		if a.Timer > 0 {
			out = append(out, a)
		}
	}
	return out
}
