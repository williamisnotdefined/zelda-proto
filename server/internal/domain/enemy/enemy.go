// Package enemy hosts the Enemy aggregate (Blob and its variants Slime, Hand,
// PacmanGhost). Variants are configuration-driven: a single Enemy struct
// covers all kinds.
package enemy

import (
	"hash/fnv"
	"math"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
)

// Kind identifies the enemy variant. Mirrors client/src/shared/types.ts.
type Kind string

// Enemy variant identifiers.
const (
	KindBlob        Kind = "blob"
	KindSlime       Kind = "slime"
	KindHand        Kind = "hand"
	KindPacmanGhost Kind = "pacman_ghost"
)

// State enumerates the enemy AI states.
type State string

// Canonical state values.
const (
	StateIdle      State = "idle"
	StateChasing   State = "chasing"
	StateAttacking State = "attacking"
	StateDead      State = "dead"
)

// PacmanVariant is the visual variant for the PacmanGhost kind.
type PacmanVariant string

// Pacman ghost colors.
const (
	PacmanRed    PacmanVariant = "red"
	PacmanBlue   PacmanVariant = "blue"
	PacmanOrange PacmanVariant = "orange"
	PacmanPink   PacmanVariant = "pink"
)

// TargetReacquireInterval bounds how often AI scans for a new target.
const TargetReacquireInterval = 120 * time.Millisecond

const (
	EliteSizeMultiplier = 2
	EliteStatMultiplier = 3
)

// PlayerSize is the conventional axis-aligned player extent.
const (
	PlayerWidth  float64 = 48
	PlayerHeight float64 = 48
)

// Config defines the static parameters of an enemy variant.
type Config struct {
	Kind          Kind
	MaxHP         int
	Speed         float64
	Damage        int
	AggroRadius   float64
	ContactRadius float64
	Width         float64
	Height        float64
	RespawnTime   time.Duration
}

// Variant configurations for each enemy family.
var (
	BlobConfig = Config{
		Kind: KindBlob, MaxHP: 30, Speed: 60, Damage: 5,
		AggroRadius: 600, ContactRadius: 14,
		Width: 48, Height: 48, RespawnTime: 10 * time.Second,
	}
	SlimeConfig = Config{
		Kind: KindSlime, MaxHP: 45, Speed: 60, Damage: 10,
		AggroRadius: 600, ContactRadius: 24,
		Width: 48, Height: 48, RespawnTime: 10 * time.Second,
	}
	HandConfig = Config{
		Kind: KindHand, MaxHP: 60, Speed: 90, Damage: 15,
		AggroRadius: 600, ContactRadius: 24,
		Width: 48, Height: 48, RespawnTime: 10 * time.Second,
	}
	PacmanGhostConfig = Config{
		Kind: KindPacmanGhost, MaxHP: 80, Speed: 90, Damage: 20,
		AggroRadius: 600, ContactRadius: 24,
		Width: 48, Height: 48, RespawnTime: 10 * time.Second,
	}
)

// PlayerView is the read-only snapshot of a player relevant to enemy AI.
type PlayerView struct {
	ID        string
	X, Y      float64
	Alive     bool
	Protected bool
}

// Enemy is the AI aggregate.
type Enemy struct {
	ID             string
	Kind           Kind
	Elite          bool
	Variant        PacmanVariant
	Config         Config
	X, Y           float64
	SpawnX, SpawnY float64
	ChunkKey       string
	HP             int
	State          State
	TargetID       string
	DamageCooldown time.Duration
	RespawnTimer   time.Duration
	HasDropped     bool
	DropKind       drop.Kind
	RespawnEnabled bool

	reacquireTimer  time.Duration
	reacquireOffset time.Duration
}

// New constructs an enemy at (x, y) with the supplied configuration.
func New(id string, x, y float64, chunkKey string, cfg Config, dropKind drop.Kind) *Enemy {
	return newEnemy(id, x, y, chunkKey, cfg, dropKind, false)
}

// NewElite constructs an elite enemy at (x, y) with the supplied configuration.
func NewElite(id string, x, y float64, chunkKey string, cfg Config, dropKind drop.Kind) *Enemy {
	return newEnemy(id, x, y, chunkKey, cfg, dropKind, true)
}

func newEnemy(id string, x, y float64, chunkKey string, cfg Config, dropKind drop.Kind, elite bool) *Enemy {
	if elite {
		cfg = cfg.WithEliteStats()
	}
	return &Enemy{
		ID: id, Kind: cfg.Kind, Elite: elite, Config: cfg,
		X: x, Y: y, SpawnX: x, SpawnY: y,
		ChunkKey:        chunkKey,
		HP:              cfg.MaxHP,
		State:           StateIdle,
		DropKind:        dropKind,
		RespawnEnabled:  true,
		reacquireOffset: hashOffset(id),
	}
}

// NewPacmanGhost constructs a PacmanGhost variant.
func NewPacmanGhost(id string, x, y float64, chunkKey string, variant PacmanVariant, dropKind drop.Kind) *Enemy {
	e := New(id, x, y, chunkKey, PacmanGhostConfig, dropKind)
	e.Variant = variant
	return e
}

// NewElitePacmanGhost constructs an elite PacmanGhost variant.
func NewElitePacmanGhost(id string, x, y float64, chunkKey string, variant PacmanVariant, dropKind drop.Kind) *Enemy {
	e := NewElite(id, x, y, chunkKey, PacmanGhostConfig, dropKind)
	e.Variant = variant
	return e
}

// WithEliteStats returns a copy of cfg with elite stat multipliers applied.
func (cfg Config) WithEliteStats() Config {
	cfg.MaxHP *= EliteStatMultiplier
	cfg.Damage *= EliteStatMultiplier
	cfg.ContactRadius *= EliteSizeMultiplier
	cfg.Width *= EliteSizeMultiplier
	cfg.Height *= EliteSizeMultiplier
	return cfg
}

func hashOffset(id string) time.Duration {
	h := fnv.New32a()
	_, _ = h.Write([]byte(id))
	return time.Duration(h.Sum32()%uint32(TargetReacquireInterval.Milliseconds())) * time.Millisecond
}

// FindNearestPlayer is supplied by callers (typically the spatial index) to
// avoid an O(N) scan in the AI hot path.
type FindNearestPlayer func(x, y, radius float64, predicate func(PlayerView) bool) *PlayerView

// Update advances the enemy. spawnSafeZoneActive prevents the enemy from
// entering the spawn safe zone.
func (e *Enemy) Update(dt time.Duration, players []PlayerView, spawnSafeZoneActive bool, spawnX, spawnY, safeRadius float64, find FindNearestPlayer) {
	if e.DamageCooldown > 0 {
		e.DamageCooldown -= dt
		if e.DamageCooldown < 0 {
			e.DamageCooldown = 0
		}
	}
	if e.State == StateDead {
		return
	}

	e.reacquireTimer -= dt
	if e.reacquireTimer <= 0 {
		e.reacquireTimer = TargetReacquireInterval + e.reacquireOffset
		e.acquireTarget(players, find)
	}

	target := e.lookupTarget(players)
	if target == nil {
		e.TargetID = ""
		e.State = StateIdle
		return
	}

	dx := target.X - e.X
	dy := target.Y - e.Y
	dist := math.Hypot(dx, dy)
	if dist == 0 {
		return
	}
	step := e.Config.Speed * dt.Seconds()
	nx := e.X + (dx/dist)*step
	ny := e.Y + (dy/dist)*step

	if spawnSafeZoneActive && physics.IsInSafeZone(nx, ny, spawnX, spawnY, safeRadius) {
		// Tangential deflection: rotate normalized direction 90°.
		nx = e.X + (-dy/dist)*step
		ny = e.Y + (dx/dist)*step
	}

	e.X, e.Y = nx, ny
	e.State = StateChasing

	if e.overlapsTarget(target) && e.DamageCooldown <= 0 {
		e.State = StateAttacking
	}
}

func (e *Enemy) acquireTarget(players []PlayerView, find FindNearestPlayer) {
	pred := func(p PlayerView) bool { return p.Alive && !p.Protected }
	if find != nil {
		if found := find(e.X, e.Y, e.Config.AggroRadius, pred); found != nil {
			e.TargetID = found.ID
			return
		}
		e.TargetID = ""
		return
	}

	bestDistSq := e.Config.AggroRadius * e.Config.AggroRadius
	best := ""
	for _, p := range players {
		if !pred(p) {
			continue
		}
		dsq := physics.DistanceSquared(e.X, e.Y, p.X, p.Y)
		if dsq <= bestDistSq {
			bestDistSq = dsq
			best = p.ID
		}
	}
	e.TargetID = best
}

func (e *Enemy) lookupTarget(players []PlayerView) *PlayerView {
	if e.TargetID == "" {
		return nil
	}
	for i := range players {
		if players[i].ID == e.TargetID && players[i].Alive {
			return &players[i]
		}
	}
	return nil
}

func (e *Enemy) overlapsTarget(target *PlayerView) bool {
	r := e.CollisionRadius() + PlayerWidth/2
	return physics.DistanceSquared(e.X, e.Y, target.X, target.Y) <= r*r
}

// CollisionRadius returns the solid body radius used for actor-vs-actor
// blocking. This is intentionally wider than some contact-damage radii so the
// visual sprite body cannot pass through other solid actors.
func (e *Enemy) CollisionRadius() float64 {
	return math.Max(e.Config.Width, e.Config.Height) / 2
}

// MarkContactDamageDealt sets the global damage cooldown.
func (e *Enemy) MarkContactDamageDealt() {
	e.DamageCooldown = 1000 * time.Millisecond
}

// TakeDamage applies amount of damage. Negative or zero amounts are ignored.
func (e *Enemy) TakeDamage(amount int) {
	if amount <= 0 || e.State == StateDead {
		return
	}
	e.HP -= amount
	if e.HP <= 0 {
		e.HP = 0
		e.State = StateDead
		e.TargetID = ""
		e.RespawnTimer = e.Config.RespawnTime
	}
}

// TryRespawn decrements the respawn timer and resets the enemy when it
// reaches zero. Returns true on respawn.
func (e *Enemy) TryRespawn(dt time.Duration) bool {
	if e.State != StateDead || !e.RespawnEnabled {
		return false
	}
	e.RespawnTimer -= dt
	if e.RespawnTimer > 0 {
		return false
	}
	e.X = e.SpawnX
	e.Y = e.SpawnY
	e.HP = e.Config.MaxHP
	e.State = StateIdle
	e.DamageCooldown = 0
	e.TargetID = ""
	e.HasDropped = false
	return true
}

// Snapshot is the wire projection.
type Snapshot struct {
	ID      string
	Kind    Kind
	Elite   bool
	Variant PacmanVariant
	X, Y    float64
	HP      int
	MaxHP   int
	State   State
}

// Snapshot returns a quantized projection.
func (e *Enemy) Snapshot() Snapshot {
	return Snapshot{
		ID: e.ID, Kind: e.Kind, Elite: e.Elite, Variant: e.Variant,
		X: physics.QuantizePosition(e.X), Y: physics.QuantizePosition(e.Y),
		HP: e.HP, MaxHP: e.Config.MaxHP, State: e.State,
	}
}
